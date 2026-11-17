import { AuthProvider, MoodleSessionCredentials } from "./auth/auth-provider.js";
import { validateCredentials } from "./auth/credentials.js";
import { MoodleAuthError, MoodleError, MoodleNetworkError, MoodleSessionKeyError } from "./errors.js";
import { decodeMoodleResponses } from "./response.js";

export interface MoodleClientOptions {
  baseUrl: string;
  authProvider: AuthProvider;
  timeoutMs?: number;
}

export interface MoodleCall<TArgs = unknown> { method: string; args: TArgs; }

const responseError = () => new MoodleError("Moodle returned an invalid or oversized response", "MOODLE_RESPONSE_ERROR");
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

export class MoodleClient {
  readonly baseUrl: string;
  private readonly authProvider: AuthProvider;
  private readonly timeoutMs: number;

  constructor(options: MoodleClientOptions) {
    let base: URL;
    try { base = new URL(options.baseUrl); } catch {
      throw new MoodleError("Invalid Moodle base URL", "INVALID_CONFIG");
    }
    if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
      throw new MoodleError("Invalid Moodle base URL", "INVALID_CONFIG");
    }
    this.baseUrl = base.toString().replace(/\/$/, "");
    this.authProvider = options.authProvider;
    this.timeoutMs = options.timeoutMs ?? 5000;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs <= 0 || this.timeoutMs > 2147483647) {
      throw new MoodleError("Invalid Moodle request timeout", "INVALID_CONFIG");
    }
  }

  async call<TArgs, TResult>(method: string, args: TArgs): Promise<TResult> {
    return (await this.callBatch<TArgs, TResult>([{ method, args }]))[0];
  }

  /** Results follow request order. The first per-call error rejects the whole batch. */
  async callBatch<TArgs = unknown, TResult = unknown>(requests: MoodleCall<TArgs>[]): Promise<TResult[]> {
    if (!requests.length) return [];
    if (requests.length > 50 || requests.some(request => !/^[a-z][a-z0-9_]{0,127}$/.test(request.method))) {
      throw new MoodleError("A Moodle batch must contain at most 50 valid method names", "INVALID_REQUEST");
    }
    return this.withAuthRetry(async (credentials) => {
      const { response, body } = await this.send(`/lib/ajax/service.php?sesskey=${encodeURIComponent(credentials.sesskey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(requests.map((request, index) => ({ index, methodname: request.method, args: request.args }))),
      }, credentials);
      let parsed: unknown;
      try { parsed = JSON.parse(body); } catch {
        if (!response.ok) throw this.httpError(response.status);
        if (/id=["']page-login-index["']/.test(body)) throw this.loginError();
        throw responseError();
      }
      // Moodle can return meaningful JSON errors even with a non-2xx HTTP status.
      const data = decodeMoodleResponses(parsed, requests.length, credentials);
      if (!response.ok) throw this.httpError(response.status);
      return data as TResult[];
    });
  }

  getAssignmentIndex(courseId: number): Promise<string> {
    return this.getPage("/mod/assign/index.php", courseId);
  }

  getCoursePage(courseId: number): Promise<string> {
    return this.getPage("/course/view.php", courseId);
  }

  private async getPage(path: string, courseId: number): Promise<string> {
    if (!Number.isSafeInteger(courseId) || courseId <= 0) throw new MoodleError("Invalid course ID", "INVALID_REQUEST");
    return this.withAuthRetry(async (credentials) => {
      const { response, body } = await this.send(`${path}?id=${courseId}`, { headers: { Accept: "text/html" } }, credentials);
      if (!response.ok) throw this.httpError(response.status);
      if (!response.headers.get("content-type")?.toLowerCase().includes("text/html")) throw responseError();
      if (/id=["']page-login-index["']/.test(body)) throw this.loginError();
      return body;
    });
  }

  private async withAuthRetry<T>(fn: (credentials: MoodleSessionCredentials) => Promise<T>): Promise<T> {
    const credentials = await this.credentials();
    try {
      return await fn(credentials);
    } catch (error) {
      if (
        (error instanceof MoodleAuthError || error instanceof MoodleSessionKeyError) &&
        typeof this.authProvider.invalidate === "function"
      ) {
        this.authProvider.invalidate();
        const fresh = await this.credentials();
        if (fresh.session !== credentials.session || fresh.sesskey !== credentials.sesskey) {
          return await fn(fresh);
        }
      }
      throw error;
    }
  }

  private async credentials(): Promise<MoodleSessionCredentials> {
    const credentials = await this.authProvider.getCredentials();
    validateCredentials(credentials);
    return credentials;
  }

  private loginError(): MoodleAuthError {
    return new MoodleAuthError("Sign in to the LMS, refresh LMS_MOODLE_SESSION and LMS_MOODLE_SESSKEY together, then restart the MCP server");
  }

  private httpError(status: number): MoodleError {
    return new MoodleError(`Moodle HTTP request failed (${status})`, "MOODLE_HTTP_ERROR");
  }

  private async send(path: string, init: RequestInit, credentials: MoodleSessionCredentials): Promise<{ response: Response; body: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: { ...init.headers, Cookie: `MoodleSession=${credentials.session}` },
        redirect: "manual", signal: controller.signal,
      });
      if ([301, 302, 303, 307, 308, 401].includes(response.status)) throw this.loginError();
      if (Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES) {
        controller.abort();
        throw responseError();
      }
      const reader = response.body?.getReader();
      if (!reader) return { response, body: "" };
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_RESPONSE_BYTES) { controller.abort(); throw responseError(); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      return { response, body: Buffer.concat(chunks).toString("utf8") };
    } catch (error: unknown) {
      if (error instanceof MoodleError) throw error;
      if (controller.signal.aborted) throw new MoodleNetworkError("Moodle request timed out", "NETWORK_TIMEOUT");
      throw new MoodleNetworkError("Network error communicating with Moodle", "NETWORK_ERROR");
    } finally { clearTimeout(timer); }
  }
}
