import { AuthProvider, MoodleSessionCredentials } from "./auth-provider.js";
import { LmsConfig } from "../../config/env.js";

export class ManualSessionProvider implements AuthProvider {
  constructor(private readonly credentials: MoodleSessionCredentials) {}

  static fromConfig(config: LmsConfig): ManualSessionProvider {
    return new ManualSessionProvider({
      session: config.moodleSession,
      sesskey: config.moodleSesskey,
    });
  }

  async getCredentials(): Promise<MoodleSessionCredentials> {
    return {
      session: this.credentials.session,
      sesskey: this.credentials.sesskey,
    };
  }
}
