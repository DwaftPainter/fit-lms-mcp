import { createHmac, randomBytes } from "node:crypto";
import { DEFAULT_COURSE_CACHE_TTL_MS, type LmsConfig } from "../config/env.js";
import type { CourseContentService } from "./course-content.service.js";
import type { CourseSummary } from "./course.service.js";

const MAX_CACHE_ENTRY_BYTES = 512 * 1024;

interface CacheEntry<Value> {
  value: Promise<Value>;
  expiresAt?: number;
  timer?: NodeJS.Timeout;
}

class BoundedTtlCache<Key, Value> {
  private readonly entries = new Map<Key, CacheEntry<Value>>();

  constructor(private readonly ttlMs: number, private readonly capacity: number) {}

  async getOrLoad(key: Key, load: () => Promise<Value>, bypassCache = false): Promise<Value> {
    if (this.ttlMs === 0) return load();

    const current = this.entries.get(key);
    if (current) {
      if (!bypassCache && (current.expiresAt === undefined || current.expiresAt > performance.now())) {
        this.entries.delete(key);
        this.entries.set(key, current);
        return current.value;
      }
      this.remove(key, current);
    }

    if (this.entries.size >= this.capacity) {
      const oldest = this.entries.entries().next();
      if (!oldest.done) this.remove(...oldest.value);
    }

    const entry: CacheEntry<Value> = {
      value: Promise.resolve().then(load).then(value => {
        if (this.entries.get(key) === entry) {
          if (Buffer.byteLength(JSON.stringify(value)) <= MAX_CACHE_ENTRY_BYTES) {
            entry.expiresAt = performance.now() + this.ttlMs;
            entry.timer = setTimeout(() => this.remove(key, entry), this.ttlMs).unref();
          } else {
            this.remove(key, entry);
          }
        }
        return value;
      }).catch(error => {
        this.remove(key, entry);
        throw error;
      }),
    };
    this.entries.set(key, entry);
    return entry.value;
  }

  clear(): void {
    for (const [key, entry] of this.entries) this.remove(key, entry);
  }

  private remove(key: Key, entry: CacheEntry<Value>): void {
    if (entry.timer) clearTimeout(entry.timer);
    if (this.entries.get(key) === entry) this.entries.delete(key);
  }
}

type CourseContents = Awaited<ReturnType<CourseContentService["getCourseContents"]>>;
const scopeSecret = randomBytes(32);
let current: {
  scope: string;
  courses: BoundedTtlCache<string, CourseSummary[]>;
  contents: BoundedTtlCache<number, CourseContents>;
} | undefined;

export function getCourseMetadataCache(config: LmsConfig) {
  const ttlMs = config.cacheTtlMs ?? DEFAULT_COURSE_CACHE_TTL_MS;
  const scope = createHmac("sha256", scopeSecret).update(JSON.stringify([
    config.baseUrl, config.username, config.password, config.moodleSession, config.moodleSesskey, ttlMs,
  ])).digest("hex");
  if (current?.scope !== scope) {
    current?.courses.clear();
    current?.contents.clear();
    current = {
      scope,
      courses: new BoundedTtlCache(ttlMs, 4),
      contents: new BoundedTtlCache(ttlMs, 64),
    };
  }
  return current;
}
