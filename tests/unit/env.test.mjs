import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../../dist/config/env.js";

const validEnv = {
  LMS_BASE_URL: "https://lms.example.edu/moodle/",
  LMS_MOODLE_SESSION: "session-value",
  LMS_MOODLE_SESSKEY: "sesskey-value",
};

test("loads and normalizes valid configuration", () => {
  assert.deepEqual(loadConfig(validEnv), {
    baseUrl: "https://lms.example.edu/moodle",
    timeoutMs: 5000,
    moodleSession: "session-value",
    moodleSesskey: "sesskey-value",
  });
});

test("reports all missing required settings without credential values", () => {
  assert.throws(() => loadConfig({}), (error) => {
    assert.match(error.message, /LMS_BASE_URL is required/);
    assert.match(error.message, /LMS_MOODLE_SESSION is required/);
    assert.match(error.message, /LMS_MOODLE_SESSKEY is required/);
    return true;
  });
});

test("rejects malformed or credential-bearing URLs", () => {
  for (const url of [
    "not-a-url",
    "ftp://lms.example.edu",
    "https://user:pass@lms.example.edu",
    "https://lms.example.edu/?token=secret",
  ]) {
    assert.throws(
      () => loadConfig({ ...validEnv, LMS_BASE_URL: url }),
      /LMS_BASE_URL must be an HTTP\(S\) URL/,
    );
  }
});

test("rejects placeholder credentials and invalid timeout", () => {
  assert.throws(
    () =>
      loadConfig({
        ...validEnv,
        LMS_MOODLE_SESSION: "your_moodle_session_cookie",
        TIMEOUT_MS: "0",
      }),
    (error) => {
      assert.match(error.message, /LMS_MOODLE_SESSION is required/);
      assert.match(error.message, /TIMEOUT_MS must be a positive integer/);
      return true;
    },
  );
});
