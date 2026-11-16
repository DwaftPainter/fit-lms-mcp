import { MoodleClient } from "../client.js";
import {
  MoodleCourseItem,
  MoodleEnrolledCoursesData,
  moodleEnrolledCoursesDataSchema,
} from "../schemas/course.schema.js";
import { MoodleError } from "../errors.js";

export interface EnrolledCoursesOptions {
  offset?: number;
  limit?: number;
  classification?: string;
  sort?: string;
  searchValue?: string;
}

export async function fetchEnrolledCourses(
  client: MoodleClient,
  options: EnrolledCoursesOptions = {},
): Promise<MoodleCourseItem[]> {
  return (await fetchCoursesPage(client, options)).courses;
}

async function fetchCoursesPage(client: MoodleClient, options: EnrolledCoursesOptions): Promise<MoodleEnrolledCoursesData> {
  const result = await client.call<
    {
      offset: number;
      limit: number;
      classification: string;
      sort: string;
      customfieldname: string;
      customfieldvalue: string;
      searchvalue: string;
    },
    MoodleEnrolledCoursesData
  >("core_course_get_enrolled_courses_by_timeline_classification", {
    offset: options.offset ?? 0,
    limit: options.limit ?? 50,
    classification: options.classification ?? "all",
    sort: options.sort ?? "fullname",
    customfieldname: "",
    customfieldvalue: "",
    searchvalue: options.searchValue ?? "",
  });

  const parsed = moodleEnrolledCoursesDataSchema.safeParse(result);
  if (!parsed.success) throw new MoodleError("Invalid Moodle courses response", "MOODLE_RESPONSE_ERROR");
  return parsed.data;
}

export async function fetchAllEnrolledCourses(
  client: MoodleClient,
  options: EnrolledCoursesOptions = {},
): Promise<MoodleCourseItem[]> {
  const courses = new Map<number, MoodleCourseItem>();
  let offset = 0;
  for (let page = 0; page < 100; page++) {
    const result = await fetchCoursesPage(client, { ...options, offset, limit: 50 });
    for (const course of result.courses) courses.set(course.id, course);
    if (!result.courses.length || result.nextoffset === 0) return [...courses.values()];
    if (result.nextoffset === undefined && result.courses.length < 50) return [...courses.values()];
    const next = result.nextoffset ?? offset + result.courses.length;
    if (next <= offset) throw new MoodleError("Moodle course pagination did not advance", "MOODLE_PAGINATION_ERROR");
    offset = next;
  }
  throw new MoodleError("Moodle courses exceeded the 100-page safety limit", "MOODLE_PAGINATION_ERROR");
}
