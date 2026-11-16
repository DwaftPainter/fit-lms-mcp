import { MoodleAuthError, MoodleSessionKeyError } from "../errors.js";
import { MoodleSessionCredentials } from "./auth-provider.js";

export const isSafeCookieValue = (value: string) => value.length > 0 && value.length <= 4096 && !/[\x00-\x20\x7f;,]/.test(value);
export const isSafeSesskey = (value: string) => value.length > 0 && value.length <= 1024 && !/[\x00-\x20\x7f]/.test(value);

export function validateCredentials(credentials: MoodleSessionCredentials): void {
  if (!isSafeCookieValue(credentials.session) || credentials.session === "your_moodle_session_cookie") {
    throw new MoodleAuthError("Set a valid LMS_MOODLE_SESSION from your signed-in LMS session, then restart the MCP server");
  }
  if (!isSafeSesskey(credentials.sesskey) || credentials.sesskey === "your_moodle_sesskey") {
    throw new MoodleSessionKeyError("Set LMS_MOODLE_SESSKEY from the same signed-in LMS session, then restart the MCP server", "MISSING_SESSION_KEY");
  }
}
