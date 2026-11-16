import { AuthProvider, MoodleSessionCredentials } from "./auth-provider.js";
import { validateCredentials } from "./credentials.js";
import { MoodleAuthError, MoodleNetworkError, MoodleSessionKeyError } from "../errors.js";

export interface AutoLoginConfig {
  baseUrl: string;
  username: string;
  password: string;
  timeoutMs?: number;
}

export class AutoLoginAuthProvider implements AuthProvider {
  readonly baseUrl: string;
  private readonly username: string;
  private readonly password: string;
  private readonly timeoutMs: number;
  private cachedCredentials?: MoodleSessionCredentials;
  private inFlightLogin?: Promise<MoodleSessionCredentials>;

  constructor(config: AutoLoginConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.username = config.username;
    this.password = config.password;
    this.timeoutMs = config.timeoutMs ?? 5000;
  }

  async getCredentials(): Promise<MoodleSessionCredentials> {
    if (this.cachedCredentials) {
      return this.cachedCredentials;
    }
    if (this.inFlightLogin) {
      return await this.inFlightLogin;
    }
    this.inFlightLogin = this.performLogin().finally(() => {
      this.inFlightLogin = undefined;
    });
    this.cachedCredentials = await this.inFlightLogin;
    return this.cachedCredentials;
  }

  invalidate(): void {
    this.cachedCredentials = undefined;
  }

  private extractCookies(response: Response): Record<string, string> {
    const cookies: Record<string, string> = {};
    const setCookieHeaders: string[] = typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : (response.headers.get("set-cookie") ? [response.headers.get("set-cookie")!] : []);

    for (const header of setCookieHeaders) {
      const parts = header.split(";");
      const nameValue = parts[0];
      if (nameValue) {
        const eqIdx = nameValue.indexOf("=");
        if (eqIdx > 0) {
          const name = nameValue.slice(0, eqIdx).trim();
          const value = nameValue.slice(eqIdx + 1).trim();
          cookies[name] = value;
        }
      }
    }
    return cookies;
  }

  private extractLogintoken(html: string): string | undefined {
    const match = html.match(/<input[^>]+name=["']logintoken["'][^>]+value=["']([^"']+)["']/i)
      || html.match(/<input[^>]+value=["']([^"']+)["'][^>]+name=["']logintoken["']/i);
    return match ? match[1] : undefined;
  }

  private extractSesskey(html: string): string | undefined {
    const match = html.match(/["']sesskey["']\s*:\s*["']([^"'\s\x00-\x20\x7f]+)["']/)
      || html.match(/[?&]sesskey=([^"'\s\x00-\x20\x7f&]+)/)
      || html.match(/<input[^>]+name=["']sesskey["'][^>]+value=["']([^"'\s\x00-\x20\x7f]+)["']/i);
    return match ? match[1] : undefined;
  }

  private async performLogin(): Promise<MoodleSessionCredentials> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      // Step 1: GET login page to obtain initial session cookie and logintoken
      const loginPageRes = await fetch(`${this.baseUrl}/login/index.php`, {
        method: "GET",
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        redirect: "manual",
        signal: controller.signal,
      });

      const initialCookies = this.extractCookies(loginPageRes);
      let session = initialCookies["MoodleSession"];
      const loginHtml = await loginPageRes.text();
      const logintoken = this.extractLogintoken(loginHtml);

      // Step 2: POST credentials to /login/index.php
      const formParams = new URLSearchParams();
      if (logintoken) {
        formParams.append("logintoken", logintoken);
      }
      formParams.append("username", this.username);
      formParams.append("password", this.password);

      const postHeaders: Record<string, string> = {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      };
      if (session) {
        postHeaders["Cookie"] = `MoodleSession=${session}`;
      }

      const loginPostRes = await fetch(`${this.baseUrl}/login/index.php`, {
        method: "POST",
        headers: postHeaders,
        body: formParams.toString(),
        redirect: "manual",
        signal: controller.signal,
      });

      const postCookies = this.extractCookies(loginPostRes);
      if (postCookies["MoodleSession"]) {
        session = postCookies["MoodleSession"];
      }

      if (loginPostRes.status === 200) {
        const errorBody = await loginPostRes.text();
        if (/loginerrormessage|loginerrors|invalid login/i.test(errorBody)) {
          throw new MoodleAuthError("Authentication failed: invalid LMS username or password");
        }
      }

      if (!session) {
        throw new MoodleAuthError("Authentication failed: MoodleSession cookie was not received from LMS");
      }

      // Step 3: Follow redirect chain or fetch authenticated page to obtain sesskey
      let currentUrl = loginPostRes.headers.get("location") || `${this.baseUrl}/my/`;
      let sesskey: string | undefined;

      for (let redirectCount = 0; redirectCount < 4; redirectCount++) {
        const targetUrl = new URL(currentUrl, this.baseUrl).toString();
        const nextRes = await fetch(targetUrl, {
          method: "GET",
          headers: {
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            Cookie: `MoodleSession=${session}`,
          },
          redirect: "manual",
          signal: controller.signal,
        });

        const nextCookies = this.extractCookies(nextRes);
        if (nextCookies["MoodleSession"]) {
          session = nextCookies["MoodleSession"];
        }

        if ([301, 302, 303, 307, 308].includes(nextRes.status)) {
          const nextLoc = nextRes.headers.get("location");
          if (!nextLoc) break;
          if (nextLoc.includes("/login/index.php") && !nextLoc.includes("testsession")) {
            throw new MoodleAuthError("Authentication failed: redirected to login page");
          }
          currentUrl = nextLoc;
          continue;
        }

        if (nextRes.status === 200) {
          const html = await nextRes.text();
          sesskey = this.extractSesskey(html);
          if (sesskey) {
            break;
          }
        }
      }

      // If sesskey was not extracted yet, make a direct request to /my/
      if (!sesskey) {
        const myRes = await fetch(`${this.baseUrl}/my/`, {
          method: "GET",
          headers: {
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            Cookie: `MoodleSession=${session}`,
          },
          redirect: "manual",
          signal: controller.signal,
        });
        if (myRes.status === 200) {
          const myHtml = await myRes.text();
          sesskey = this.extractSesskey(myHtml);
        }
      }

      if (!sesskey) {
        throw new MoodleSessionKeyError("Authenticated but could not find LMS sesskey in page HTML");
      }

      const credentials: MoodleSessionCredentials = { session, sesskey };
      validateCredentials(credentials);
      return credentials;
    } catch (error: unknown) {
      if (error instanceof MoodleAuthError || error instanceof MoodleSessionKeyError) {
        throw error;
      }
      if (controller.signal.aborted) {
        throw new MoodleNetworkError("Moodle login request timed out", "NETWORK_TIMEOUT");
      }
      throw new MoodleNetworkError("Network error during Moodle authentication", "NETWORK_ERROR");
    } finally {
      clearTimeout(timer);
    }
  }
}
