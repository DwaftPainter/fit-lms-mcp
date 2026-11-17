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

test("rejects cookie delimiters, control characters and overflowing timeouts without echoing values", () => {
  for (const fields of [
    { LMS_MOODLE_SESSION: "private; other=injected" },
    { LMS_MOODLE_SESSION: "private\nheader" },
    { LMS_MOODLE_SESSKEY: "private\nkey" },
    { TIMEOUT_MS: "2147483648" },
  ]) {
    assert.throws(() => loadConfig({ ...validEnv, ...fields }), error => !error.message.includes("private"));
  }
});

test("loads valid username and password credentials configuration", () => {
  assert.deepEqual(
    loadConfig({
      LMS_BASE_URL: "https://lms.example.edu/moodle",
      LMS_USERNAME: "student-123",
      LMS_PASSWORD: "secret-password",
    }),
    {
      baseUrl: "https://lms.example.edu/moodle",
      timeoutMs: 5000,
      username: "student-123",
      password: "secret-password",
    }
  );
});

test("rejects incomplete credentials login configuration and placeholders", () => {
  assert.throws(
    () => loadConfig({ LMS_BASE_URL: "https://lms.example.edu", LMS_USERNAME: "student" }),
    /LMS_PASSWORD is required when using credentials login/
  );
  assert.throws(
    () => loadConfig({ LMS_BASE_URL: "https://lms.example.edu", LMS_PASSWORD: "pass" }),
    /LMS_USERNAME is required when using credentials login/
  );
  assert.throws(
    () => loadConfig({ LMS_BASE_URL: "https://lms.example.edu", LMS_USERNAME: "your_student_id", LMS_PASSWORD: "your_password" }),
    (error) => {
      assert.match(error.message, /LMS_USERNAME is required when using credentials login/);
      assert.match(error.message, /LMS_PASSWORD is required when using credentials login/);
      return true;
    }
  );
});
