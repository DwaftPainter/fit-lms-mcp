export interface LmsConfig {
  baseUrl: string;
  timeoutMs: number;
  moodleSession: string;
  moodleSesskey: string;
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

  const moodleSession = env.LMS_MOODLE_SESSION?.trim() ?? "";
  const moodleSesskey = env.LMS_MOODLE_SESSKEY?.trim() ?? "";
  if (!moodleSession || moodleSession === "your_moodle_session_cookie") {
    errors.push("LMS_MOODLE_SESSION is required");
  }
  if (!moodleSesskey || moodleSesskey === "your_moodle_sesskey") {
    errors.push("LMS_MOODLE_SESSKEY is required");
  }

  const rawTimeout = env.TIMEOUT_MS?.trim() || "5000";
  const timeoutMs = Number(rawTimeout);
  if (!/^\d+$/.test(rawTimeout) || !Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    errors.push("TIMEOUT_MS must be a positive integer in milliseconds");
  }

  if (errors.length) {
    throw new Error(`Invalid LMS configuration:\n- ${errors.join("\n- ")}`);
  }

  return { baseUrl, timeoutMs, moodleSession, moodleSesskey };
}
