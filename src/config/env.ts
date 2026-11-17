import { isSafeCookieValue, isSafeSesskey } from "../moodle/auth/credentials.js";

export interface LmsConfig {
  baseUrl: string;
  timeoutMs: number;
  moodleSession?: string;
  moodleSesskey?: string;
  username?: string;
  password?: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): LmsConfig {
  const errors: string[] = [];
  const rawBaseUrl = env.LMS_BASE_URL?.trim();
  let baseUrl = "";

  if (!rawBaseUrl) {
    errors.push("LMS_BASE_URL is required");
  } else {
    try {
      const url = new URL(rawBaseUrl);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        !url.hostname ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      ) {
        throw new Error("invalid base URL");
      }
      baseUrl = url.toString().replace(/\/$/, "");
    } catch {
      errors.push("LMS_BASE_URL must be an HTTP(S) URL without credentials, query, or fragment");
    }
  }

  const rawUsername = env.LMS_USERNAME?.trim();
  const rawPassword = env.LMS_PASSWORD;
  const hasCredentialConfig = Boolean(rawUsername || (rawPassword !== undefined && rawPassword !== ""));

  let username: string | undefined;
  let password: string | undefined;
  let moodleSession: string | undefined;
  let moodleSesskey: string | undefined;

  if (hasCredentialConfig) {
    if (!rawUsername || rawUsername === "your_student_id") {
      errors.push("LMS_USERNAME is required when using credentials login");
    } else {
      username = rawUsername;
    }
    if (rawPassword === undefined || rawPassword === "" || rawPassword === "your_password") {
      errors.push("LMS_PASSWORD is required when using credentials login");
    } else {
      password = rawPassword;
    }
  } else {
    const rawSession = env.LMS_MOODLE_SESSION?.trim() ?? "";
    const rawSesskey = env.LMS_MOODLE_SESSKEY?.trim() ?? "";
    if (!rawSession || rawSession === "your_moodle_session_cookie") {
      errors.push("LMS_MOODLE_SESSION is required");
    } else if (!isSafeCookieValue(rawSession)) {
      errors.push("LMS_MOODLE_SESSION must be a single valid cookie value");
    } else {
      moodleSession = rawSession;
    }

    if (!rawSesskey || rawSesskey === "your_moodle_sesskey") {
      errors.push("LMS_MOODLE_SESSKEY is required");
    } else if (!isSafeSesskey(rawSesskey)) {
      errors.push("LMS_MOODLE_SESSKEY must not contain whitespace or control characters");
    } else {
      moodleSesskey = rawSesskey;
    }
  }

  const rawTimeout = env.TIMEOUT_MS?.trim() || "5000";
  const timeoutMs = Number(rawTimeout);
  if (!/^\d+$/.test(rawTimeout) || !Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2147483647) {
    errors.push("TIMEOUT_MS must be a positive integer in milliseconds, at most 2147483647");
  }

  if (errors.length) {
    throw new Error(`Invalid LMS configuration:\n- ${errors.join("\n- ")}`);
  }

  const config: LmsConfig = { baseUrl, timeoutMs };
  if (moodleSession !== undefined) config.moodleSession = moodleSession;
  if (moodleSesskey !== undefined) config.moodleSesskey = moodleSesskey;
  if (username !== undefined) config.username = username;
  if (password !== undefined) config.password = password;

  return config;
}
