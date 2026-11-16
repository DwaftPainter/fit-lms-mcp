import { AuthProvider } from "./auth/auth-provider.js";
import {
  MoodleApiError,
  MoodleAuthError,
  MoodleError,
  MoodleNetworkError,
  MoodleSessionKeyError,
} from "./errors.js";

export interface MoodleClientOptions {
  baseUrl: string;
  authProvider: AuthProvider;
  timeoutMs?: number;
}

interface MoodleAjaxRequestPayload<TArgs> {
  index: number;
  methodname: string;
  args: TArgs;
}

interface MoodleAjaxResponsePayload<TResult> {
  error: boolean;
  data?: TResult;
  exception?: {
    errorcode?: string;
    message?: string;
    link?: string;
    moreinfourl?: string;
  };
  errorcode?: string;
  message?: string;
}

export class MoodleClient {
  private readonly baseUrl: string;
  private readonly authProvider: AuthProvider;
  private readonly timeoutMs: number;

  constructor(options: MoodleClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.authProvider = options.authProvider;
    this.timeoutMs = options.timeoutMs ?? 5000;
  }

  /** Fetch only the authenticated, read-only assignment index for an enrolled course. */
  async getAssignmentIndex(courseId: number): Promise<string> {
    const credentials = await this.authProvider.getCredentials();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/mod/assign/index.php?id=${courseId}`, {
        headers: { Accept: "text/html", Cookie: `MoodleSession=${credentials.session}` },
        redirect: "manual",
        signal: controller.signal,
      });
      if ([301, 302, 303, 307, 308, 401].includes(response.status)) {
        throw new MoodleAuthError("Moodle session is unavailable; refresh the session credentials");
      }
      if (!response.ok) throw new MoodleError(`Moodle assignment index failed with HTTP ${response.status}`);
      if (!response.headers.get("content-type")?.toLowerCase().includes("text/html")) {
        throw new MoodleError("Expected Moodle assignment HTML", "MOODLE_RESPONSE_ERROR");
      }
      return await response.text();
    } catch (error: unknown) {
      if (error instanceof MoodleError) throw error;
      if (controller.signal.aborted) throw new MoodleNetworkError("Moodle assignment index timed out", "NETWORK_TIMEOUT");
      throw new MoodleNetworkError("Network error reading Moodle assignment index", "NETWORK_ERROR");
    } finally {
      clearTimeout(timer);
    }
  }

  async call<TArgs, TResult>(methodname: string, args: TArgs): Promise<TResult> {
    const credentials = await this.authProvider.getCredentials();
    const endpoint = `${this.baseUrl}/lib/ajax/service.php?sesskey=${encodeURIComponent(
      credentials.sesskey,
    )}&info=${encodeURIComponent(methodname)}`;

    const payload: MoodleAjaxRequestPayload<TArgs>[] = [
      {
        index: 0,
        methodname,
        args,
      },
    ];

    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(), this.timeoutMs);

    let parsed: unknown;
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Cookie: `MoodleSession=${credentials.session}`,
        },
        body: JSON.stringify(payload),
        redirect: "manual",
        signal: controller.signal,
      });
      if ([301, 302, 303, 307, 308, 401].includes(response.status)) {
        throw new MoodleAuthError("Moodle session is unavailable; refresh the session credentials");
      }
      if (!response.ok) {
        throw new MoodleError(`Moodle HTTP request failed with status ${response.status}`);
      }
      try {
        parsed = await response.json();
      } catch (error: unknown) {
        if (controller.signal.aborted) throw error;
        throw new MoodleError("Failed to parse JSON response from Moodle");
      }
    } catch (err: unknown) {
      if (err instanceof MoodleError) throw err;
      if (controller.signal.aborted) {
        throw new MoodleNetworkError(`Request to Moodle timed out after ${this.timeoutMs}ms`, "NETWORK_TIMEOUT");
      }
      throw new MoodleNetworkError("Network error communicating with Moodle", "NETWORK_ERROR");
    } finally {
      clearTimeout(timeoutTimer);
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new MoodleError("Unexpected response shape from Moodle: expected non-empty array");
    }

    const envelope = parsed[0] as MoodleAjaxResponsePayload<TResult>;

    if (envelope.error) {
      const errorcode = envelope.exception?.errorcode ?? envelope.errorcode;
      const message = envelope.exception?.message ?? envelope.message ?? "Unknown Moodle error";

      if (errorcode === "servicerequireslogin") {
        throw new MoodleAuthError(message, "AUTH_REQUIRED");
      }
      if (errorcode === "invalidsesskey") {
        throw new MoodleSessionKeyError(message, "INVALID_SESSION_KEY");
      }
      if (errorcode === "missingparam") {
        throw new MoodleSessionKeyError(message, "MISSING_SESSION_KEY");
      }

      throw new MoodleApiError(message, errorcode, envelope.exception);
    }

    return envelope.data as TResult;
  }
}
