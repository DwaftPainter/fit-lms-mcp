import { z } from "zod";
import { MoodleClient } from "../client.js";
import { MoodleError } from "../errors.js";

const calendarEventSchema = z.object({
  id: z.number().int().positive(),
  timesort: z.number().int().nonnegative(),
  timestart: z.number().int().nonnegative().nullable().optional(),
  modulename: z.string().nullable().optional(),
  eventtype: z.string().optional(),
  name: z.string().optional(),
  activityname: z.string().nullable().optional(),
  course: z.object({ id: z.number().int().positive(), fullname: z.string() }).optional(),
  action: z.object({ url: z.string().optional() }).nullable().optional(),
  url: z.string().optional(),
  viewurl: z.string().optional(),
});

const calendarPageSchema = z.object({ events: z.array(calendarEventSchema) });
export type CalendarEvent = z.infer<typeof calendarEventSchema>;

export async function fetchActionEventsPage(
  client: MoodleClient,
  timesortfrom: number,
  aftereventid: number,
): Promise<CalendarEvent[]> {
  const data = await client.call("core_calendar_get_action_events_by_timesort", {
    timesortfrom, aftereventid, limitnum: 20,
  });
  const parsed = calendarPageSchema.safeParse(data);
  if (!parsed.success) {
    throw new MoodleError("Invalid Moodle calendar response", "MOODLE_RESPONSE_ERROR");
  }
  return parsed.data.events;
}
