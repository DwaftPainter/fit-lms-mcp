/**
 * Custom error types for Moodle authentication and request errors.
 */

export class MoodleError extends Error {
  constructor(message: string, public readonly code: string = "MOODLE_ERROR") {
    super(message);
    this.name = "MoodleError";
  }
}

export class MoodleAuthError extends MoodleError {
  constructor(message: string, code: "AUTH_REQUIRED" | "AUTH_SESSION_EXPIRED" = "AUTH_REQUIRED") {
    super(message, code);
    this.name = "MoodleAuthError";
  }
}

export class MoodleSessionKeyError extends MoodleError {
  constructor(message: string, code: "MISSING_SESSION_KEY" | "INVALID_SESSION_KEY" = "INVALID_SESSION_KEY") {
    super(message, code);
    this.name = "MoodleSessionKeyError";
  }
}

export class MoodleApiError extends MoodleError {
  constructor(
    message: string,
    public readonly errorcode?: string,
    public readonly exception?: unknown,
  ) {
    super(message, "MOODLE_API_ERROR");
    this.name = "MoodleApiError";
  }
}

export class MoodleNetworkError extends MoodleError {
  constructor(message: string, code: "NETWORK_TIMEOUT" | "NETWORK_ERROR" = "NETWORK_ERROR") {
    super(message, code);
    this.name = "MoodleNetworkError";
  }
}
