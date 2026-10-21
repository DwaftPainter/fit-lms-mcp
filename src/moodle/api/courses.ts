import { MoodleClient } from "../client.js";
import {
  MoodleCourseItem,
  MoodleEnrolledCoursesData,
} from "../schemas/course.schema.js";

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

  return result.courses ?? [];
}
