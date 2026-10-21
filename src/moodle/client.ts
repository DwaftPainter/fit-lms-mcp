import { AuthProvider } from "./auth/auth-provider.js";
import {
  MoodleApiError,
  MoodleAuthError,
  MoodleError,
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

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Cookie: `MoodleSession=${credentials.session}`,
      },
      body: JSON.stringify(payload),
    });

    const parsed: unknown = await response.json();

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
