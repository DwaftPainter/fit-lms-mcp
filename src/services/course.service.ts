import { fetchEnrolledCourses } from "../moodle/api/courses.js";
import { MoodleClient } from "../moodle/client.js";
import { toIsoString } from "../shared/date.js";

export interface CourseSummary {
  id: number;
  name: string;
  shortName?: string;
  summary?: string;
  startDate?: string | null;
  endDate?: string | null;
  progress?: number | null;
  url?: string;
}

export class CourseService {
  constructor(private readonly client: MoodleClient) {}

  async getMyCourses(classification: string = "all"): Promise<CourseSummary[]> {
    const rawCourses = await fetchEnrolledCourses(this.client, { classification });

    return rawCourses.map((c) => ({
      id: c.id,
      name: c.fullname,
      shortName: c.shortname,
      summary: c.summary,
      startDate: toIsoString(c.startdate),
      endDate: toIsoString(c.enddate),
      progress: c.progress ?? null,
      url: c.viewurl,
    }));
  }

}
