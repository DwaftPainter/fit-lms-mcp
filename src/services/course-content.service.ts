import { parseCourseContents } from "../moodle/api/course-contents.js";
import { MoodleClient } from "../moodle/client.js";
import { MoodleError } from "../moodle/errors.js";
import { CourseService } from "./course.service.js";

export class CourseContentService {
  constructor(private readonly client: MoodleClient, private readonly baseUrl: string) {}

  async getCourseContents(courseId: number) {
    const course = (await new CourseService(this.client).getMyCourses()).find(course => course.id === courseId);
    if (!course) throw new MoodleError("Requested course is not in the student's enrolled courses", "COURSE_NOT_ENROLLED");
    return {
      courseId, courseName: course.name,
      sections: parseCourseContents(await this.client.getCoursePage(courseId), this.baseUrl),
    };
  }
}
