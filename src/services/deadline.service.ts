import { z } from "zod";
import { fetchActionEventsPage } from "../moodle/api/calendar.js";
import { assignmentUrl } from "../moodle/assignment-url.js";
import { MoodleClient } from "../moodle/client.js";
import { MoodleError } from "../moodle/errors.js";
import { toIsoString } from "../shared/date.js";

export const deadlineInputSchema = z.object({
  from: z.string().datetime({ offset: true }).optional().describe("Inclusive due date lower bound, ISO 8601 with timezone; defaults to now"),
  to: z.string().datetime({ offset: true }).optional().describe("Inclusive due date upper bound, ISO 8601 with timezone"),
  courseId: z.number().int().positive().safe().optional().describe("Only deadlines for this course"),
});

export type DeadlineInput = z.infer<typeof deadlineInputSchema>;

export const upcomingDeadlineInputSchema = deadlineInputSchema.extend({
  daysAhead: z.number().int().min(1).max(365).default(7).describe("Look ahead this many days; defaults to 7"),
  includePast: z.boolean().default(false).describe("Include past due dates when no explicit from date is supplied"),
});
export type UpcomingDeadlineInput = z.input<typeof upcomingDeadlineInputSchema>;

export interface DeadlineSummary {
  eventId: number;
  title: string;
  courseId: number;
  courseName: string;
  dueDate: string;
  url: string | null;
}

export class DeadlineService {
  constructor(private readonly client: MoodleClient, private readonly baseUrl: string) {}

  async getUpcomingDeadlines(input: UpcomingDeadlineInput = {}) {
    const now = Date.now();
    const deadlines = await this.getDeadlines({
      from: input.from ?? new Date(input.includePast ? 0 : now).toISOString(),
      to: input.to ?? new Date(now + (input.daysAhead ?? 7) * 86400000).toISOString(),
      courseId: input.courseId,
    });
    return deadlines.map(deadline => ({
      ...deadline,
      courseModuleId: deadline.url ? Number(new URL(deadline.url).searchParams.get("id")) : null,
    }));
  }

  async getDeadlines(input: DeadlineInput = {}): Promise<DeadlineSummary[]> {
    const from = input.from ? Date.parse(input.from) : Date.now();
    const to = input.to ? Date.parse(input.to) : Infinity;
    if (from > to) throw new MoodleError("from must be before or equal to to", "INVALID_DATE_RANGE");
    const deadlines: DeadlineSummary[] = [];
    const seen = new Set<number>();
    // timesort is the action ordering, which can differ from the actual due date.
    // Scan from zero and filter timestart locally to avoid losing upcoming due dates.
    let timesortfrom = 0;
    let aftereventid = 0;

    for (let page = 0; page < 100; page++) {
      const events = await fetchActionEventsPage(this.client, timesortfrom, aftereventid);
      if (!events.length) {
        return deadlines.sort((a, b) => Date.parse(a.dueDate) - Date.parse(b.dueDate) || a.eventId - b.eventId);
      }
      const last = events[events.length - 1];
      if (last.timesort < timesortfrom || (last.timesort === timesortfrom && last.id <= aftereventid) || events.every(event => seen.has(event.id))) {
        throw new MoodleError("Moodle calendar pagination did not advance", "MOODLE_PAGINATION_ERROR");
      }
      for (const event of events) {
        if (seen.has(event.id)) continue;
        seen.add(event.id);
        if (event.modulename !== "assign" || event.eventtype !== "due" || !event.course) continue;
        const dueDate = toIsoString(event.timestart);
        if (!dueDate || Date.parse(dueDate) < from || Date.parse(dueDate) > to) continue;
        if (input.courseId && event.course.id !== input.courseId) continue;
        deadlines.push({
          eventId: event.id,
          title: event.activityname || event.name || "Assignment",
          courseId: event.course.id,
          courseName: event.course.fullname,
          dueDate,
          url: [event.action?.url, event.url, event.viewurl]
            .map(url => assignmentUrl(url, this.baseUrl)).find(url => url !== null) ?? null,
        });
      }
      timesortfrom = last.timesort;
      aftereventid = last.id;
    }
    throw new MoodleError("Moodle calendar exceeded the 100-page safety limit", "MOODLE_PAGINATION_ERROR");
  }
}
