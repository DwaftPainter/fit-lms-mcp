import { MoodleSessionCredentials } from "./auth/auth-provider.js";
import { MoodleApiError, MoodleAuthError, MoodleError, MoodleSessionKeyError } from "./errors.js";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const invalidResponse = () => new MoodleError("Invalid Moodle AJAX response envelope", "MOODLE_RESPONSE_ERROR");

function apiError(envelope: Record<string, unknown>, credentials: MoodleSessionCredentials, index?: number): MoodleError {
  const exception = isRecord(envelope.exception) ? envelope.exception : {};
  const candidate = exception.errorcode ?? envelope.errorcode;
  // Remote messages, stacks, links and debug fields are private data. Never retain them.
  const errorcode = typeof candidate === "string" && /^[a-z][a-z0-9_]{0,63}$/.test(candidate) &&
    ![credentials.session, credentials.sesskey].some(secret => candidate.includes(secret)) ? candidate : undefined;
  let error: MoodleError;
  if (errorcode === "servicerequireslogin" || errorcode === "requireloginerror" || errorcode === "notloggedin") {
    error = new MoodleAuthError("Sign in to the LMS, refresh LMS_MOODLE_SESSION and LMS_MOODLE_SESSKEY together, then restart the MCP server");
  } else if (errorcode === "invalidsesskey") {
    error = new MoodleSessionKeyError("LMS_MOODLE_SESSKEY is invalid; copy it from the same signed-in LMS session and restart the MCP server");
  } else {
    // A remote missingparam may refer to courseid or any other method argument.
    error = new MoodleApiError("Moodle rejected the API request", errorcode);
  }
  if (index !== undefined) error.requestIndex = index;
  return error;
}

export function decodeMoodleResponses(payload: unknown, count: number, credentials: MoodleSessionCredentials): unknown[] {
  if (isRecord(payload) && (payload.error === true || typeof payload.error === "string")) {
    throw apiError(payload, credentials);
  }
  if (!Array.isArray(payload) || payload.length !== count) throw invalidResponse();
  return payload.map((envelope, index) => {
    if (!isRecord(envelope)) throw invalidResponse();
    if (envelope.error === true) throw apiError(envelope, credentials, index);
    if (envelope.error !== false || !Object.hasOwn(envelope, "data")) throw invalidResponse();
    return envelope.data;
  });
}
