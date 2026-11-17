import assert from "node:assert/strict";
import test from "node:test";
import { AutoLoginAuthProvider } from "../../dist/moodle/auth/auto-login-auth-provider.js";
import { getAuthProvider, clearAuthProviderCache } from "../../dist/moodle/auth/provider-factory.js";
import { ManualSessionProvider } from "../../dist/moodle/auth/manual-session-provider.js";
import { MoodleClient } from "../../dist/moodle/client.js";

const baseUrl = "https://lms.example.edu";

test("AutoLoginAuthProvider logs in and extracts session and sesskey", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push({ url: url.toString(), options });

    if (url.toString() === `${baseUrl}/login/index.php` && options.method === "GET") {
      return new Response(
        `<html><body><form><input type="hidden" name="logintoken" value="test-token-123"></form></body></html>`,
        {
          status: 200,
          headers: {
            "set-cookie": "MoodleSession=initial-cookie; path=/",
          },
        }
      );
    }

    if (url.toString() === `${baseUrl}/login/index.php` && options.method === "POST") {
      const params = new URLSearchParams(options.body);
      assert.equal(params.get("username"), "student123");
      assert.equal(params.get("password"), "secretpass");
      assert.equal(params.get("logintoken"), "test-token-123");

      return new Response("", {
        status: 303,
        headers: {
          location: `${baseUrl}/login/index.php?testsession=1`,
          "set-cookie": "MoodleSession=authenticated-cookie-abc; path=/",
        },
      });
    }

    if (url.toString() === `${baseUrl}/login/index.php?testsession=1`) {
      assert.equal(options.headers.Cookie, "MoodleSession=authenticated-cookie-abc");
      return new Response("", {
        status: 303,
        headers: {
          location: `${baseUrl}/my/`,
        },
      });
    }

    if (url.toString() === `${baseUrl}/my/`) {
      assert.equal(options.headers.Cookie, "MoodleSession=authenticated-cookie-abc");
      return new Response(
        `<html><head><script>M.cfg = {"sesskey":"valid-sesskey-xyz"};</script></head><body>Dashboard</body></html>`,
        { status: 200 }
      );
    }

    return new Response("Not found", { status: 404 });
  });

  const provider = new AutoLoginAuthProvider({
    baseUrl,
    username: "student123",
    password: "secretpass",
  });

  const credentials = await provider.getCredentials();
  assert.equal(credentials.session, "authenticated-cookie-abc");
  assert.equal(credentials.sesskey, "valid-sesskey-xyz");

  // Subsequent call must return cached credentials without fetching again
  const countBefore = requests.length;
  const cachedCredentials = await provider.getCredentials();
  assert.equal(cachedCredentials.session, "authenticated-cookie-abc");
  assert.equal(requests.length, countBefore);
});

test("AutoLoginAuthProvider rejects invalid login credentials", async (t) => {
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (options.method === "GET") {
      return new Response(`<html><input name="logintoken" value="token1"></html>`, {
        status: 200,
        headers: { "set-cookie": "MoodleSession=init-sess" },
      });
    }
    // Failed login returns 200 with error message
    return new Response(
      `<html><body><div class="loginerrors"><span class="error">Invalid login, please try again</span></div></body></html>`,
      { status: 200 }
    );
  });

  const provider = new AutoLoginAuthProvider({
    baseUrl,
    username: "wronguser",
    password: "wrongpassword",
  });

  await assert.rejects(
    provider.getCredentials(),
    error => error.code === "AUTH_REQUIRED" && error.message.includes("invalid LMS username or password")
  );
});

test("AutoLoginAuthProvider deduplicates in-flight login requests", async (t) => {
  let loginPageCalls = 0;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (url.toString().includes("/login/index.php") && options.method === "GET") {
      loginPageCalls++;
      await new Promise(resolve => setTimeout(resolve, 20));
      return new Response(`<html><input name="logintoken" value="tok"></html>`, {
        headers: { "set-cookie": "MoodleSession=s1" },
      });
    }
    if (url.toString().includes("/login/index.php") && options.method === "POST") {
      return new Response("", {
        status: 303,
        headers: {
          location: `${baseUrl}/my/`,
          "set-cookie": "MoodleSession=s2",
        },
      });
    }
    return new Response(`<html>"sesskey":"concurrent-key"</html>`, { status: 200 });
  });

  const provider = new AutoLoginAuthProvider({
    baseUrl,
    username: "u",
    password: "p",
  });

  const [res1, res2] = await Promise.all([
    provider.getCredentials(),
    provider.getCredentials(),
  ]);

  assert.equal(res1.session, "s2");
  assert.equal(res2.session, "s2");
  assert.equal(loginPageCalls, 1);
});

test("AutoLoginAuthProvider invalidate clears cache and forces re-login", async (t) => {
  let sessionNum = 1;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (options.method === "GET" && url.toString().includes("/login/index.php")) {
      return new Response(`<html><input name="logintoken" value="t"></html>`, {
        headers: { "set-cookie": `MoodleSession=init-${sessionNum}` },
      });
    }
    if (options.method === "POST") {
      return new Response("", {
        status: 303,
        headers: {
          location: `${baseUrl}/my/`,
          "set-cookie": `MoodleSession=auth-${sessionNum}`,
        },
      });
    }
    return new Response(`<html>"sesskey":"key-${sessionNum}"</html>`, { status: 200 });
  });

  const provider = new AutoLoginAuthProvider({
    baseUrl,
    username: "u",
    password: "p",
  });

  const cred1 = await provider.getCredentials();
  assert.equal(cred1.session, "auth-1");

  provider.invalidate();
  sessionNum = 2;

  const cred2 = await provider.getCredentials();
  assert.equal(cred2.session, "auth-2");
  assert.equal(cred2.sesskey, "key-2");
});

test("getAuthProvider factory returns AutoLoginAuthProvider when username/password provided", () => {
  clearAuthProviderCache();
  const provider1 = getAuthProvider({
    baseUrl: "https://lms.example.edu",
    timeoutMs: 5000,
    username: "student1",
    password: "pw1",
  });
  assert.ok(provider1 instanceof AutoLoginAuthProvider);

  const provider2 = getAuthProvider({
    baseUrl: "https://lms.example.edu",
    timeoutMs: 5000,
    username: "student1",
    password: "pw1",
  });
  assert.equal(provider1, provider2);

  const manualProvider = getAuthProvider({
    baseUrl: "https://lms.example.edu",
    timeoutMs: 5000,
    moodleSession: "manual-session",
    moodleSesskey: "manual-key",
  });
  assert.ok(manualProvider instanceof ManualSessionProvider);
});

test("MoodleClient transparently re-authenticates and retries on expired session", async (t) => {
  let currentSession = "old-session";
  let currentSesskey = "old-key";
  let attempts = 0;

  const authProvider = {
    async getCredentials() {
      return { session: currentSession, sesskey: currentSesskey };
    },
    invalidate() {
      currentSession = "refreshed-session";
      currentSesskey = "refreshed-key";
    },
  };

  t.mock.method(globalThis, "fetch", async (url, options) => {
    attempts++;
    if (options.headers.Cookie === "MoodleSession=old-session") {
      // First attempt fails with servicerequireslogin
      return Response.json([
        { error: true, exception: { errorcode: "servicerequireslogin" } },
      ]);
    }
    assert.equal(options.headers.Cookie, "MoodleSession=refreshed-session");
    assert.equal(new URL(url).searchParams.get("sesskey"), "refreshed-key");
    return Response.json([
      { error: false, data: [{ id: 42, fullname: "Fresh course" }] },
    ]);
  });

  const client = new MoodleClient({ baseUrl, authProvider });
  const result = await client.call("core_course_get_enrolled_courses", {});

  assert.deepEqual(result, [{ id: 42, fullname: "Fresh course" }]);
  assert.equal(attempts, 2);
});
