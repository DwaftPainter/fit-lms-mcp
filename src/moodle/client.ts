import { AuthProvider } from "./auth/auth-provider.js";
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

    const parsed = (await response.json()) as Array<{ data: TResult }>;
    return parsed[0].data;
  }
}
