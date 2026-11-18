import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout } from "node:timers/promises";
import { getCourseMetadataCache } from "../../dist/services/course-metadata-cache.js";

const config = {
  baseUrl: "https://cache.example.test/moodle",
  timeoutMs: 5000,
  moodleSession: "synthetic-cache-session",
  moodleSesskey: "synthetic-cache-key",
};

const contents = (courseId, courseName = "Example course") => ({ courseId, courseName, sections: [] });

test("course metadata expires according to the configured TTL", async () => {
  const { courses } = getCourseMetadataCache({ ...config, cacheTtlMs: 40 });
  let loads = 0;
  const load = async () => [{ id: ++loads, name: "Example course" }];
  assert.deepEqual(await courses.getOrLoad("all", load), await courses.getOrLoad("all", load));
  assert.equal(loads, 1);
  await setTimeout(70);
  assert.equal((await courses.getOrLoad("all", load))[0].id, 2);
});

test("coalesces ordinary misses and prevents an older miss from replacing a forced refresh", async () => {
  const cache = getCourseMetadataCache(config).contents;
  let release;
  let loads = 0;
  const load = () => {
    loads++;
    return new Promise(resolve => { release = resolve; });
  };
  const first = cache.getOrLoad(7, load);
  const concurrent = cache.getOrLoad(7, load);
  await Promise.resolve();
  assert.equal(loads, 1);
  const refreshed = contents(7, "Updated course");
  assert.deepEqual(await cache.getOrLoad(7, async () => refreshed, true), refreshed);
  release(contents(7));
  assert.deepEqual(await first, await concurrent);
  assert.deepEqual(await cache.getOrLoad(7, load), refreshed);
  assert.equal(loads, 1);
});

test("cache remains bounded and evicts the least recently used course", async () => {
  const cache = getCourseMetadataCache({ ...config, moodleSession: "synthetic-capacity-session" }).contents;
  for (let id = 1; id <= 64; id++) await cache.getOrLoad(id, async () => contents(id));
  assert.deepEqual(await cache.getOrLoad(1, async () => assert.fail("course 1 should be a hit")), contents(1));
  await cache.getOrLoad(65, async () => contents(65));
  assert.deepEqual(await cache.getOrLoad(1, async () => assert.fail("recent course 1 should still be a hit")), contents(1));
  assert.deepEqual(await cache.getOrLoad(2, async () => contents(2, "Reloaded course")), contents(2, "Reloaded course"));
});

test("discards failed and oversized results and supports disabling caching", async () => {
  const cache = getCourseMetadataCache(config).contents;
  await assert.rejects(cache.getOrLoad(8, async () => { throw new Error("Fetch failed"); }), /Fetch failed/);
  assert.deepEqual(await cache.getOrLoad(8, async () => contents(8)), contents(8));
  await cache.getOrLoad(9, async () => contents(9, "a".repeat(600 * 1024)));
  assert.deepEqual(await cache.getOrLoad(9, async () => contents(9)), contents(9));

  const disabled = getCourseMetadataCache({ ...config, cacheTtlMs: 0 }).contents;
  await disabled.getOrLoad(8, async () => contents(8));
  assert.deepEqual(await disabled.getOrLoad(8, async () => contents(8, "Refetched course")), contents(8, "Refetched course"));
});

test("cached metadata is discarded on a credential or LMS change", async () => {
  const previous = getCourseMetadataCache(config).courses;
  await previous.getOrLoad("all", async () => [{ id: 1, name: "First user's course" }]);
  const other = getCourseMetadataCache({ ...config, moodleSession: "synthetic-other-session" }).courses;
  assert.deepEqual(await other.getOrLoad("all", async () => []), []);
  assert.deepEqual(await getCourseMetadataCache({ ...config, baseUrl: "https://other.example.test/moodle" }).courses.getOrLoad("all", async () => [{ id: 2, name: "Other LMS course" }]), [{ id: 2, name: "Other LMS course" }]);
  assert.deepEqual(await getCourseMetadataCache(config).courses.getOrLoad("all", async () => []), []);
});
