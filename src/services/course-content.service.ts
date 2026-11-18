import { parseCourseContents } from "../moodle/api/course-contents.js";
import { fetchCourseAnnouncements, parseAnnouncementsForum, type CourseAnnouncement } from "../moodle/api/course-announcements.js";
import { parseMaterialDetail } from "../moodle/api/material-detail.js";
import { isMaterialType, MoodleClient } from "../moodle/client.js";
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

  async getCourseAnnouncements(courseId: number, page = 0): Promise<CourseAnnouncement[]> {
    if (!Number.isSafeInteger(courseId) || courseId <= 0 || !Number.isSafeInteger(page) || page < 0) {
      throw new MoodleError("Invalid course ID or announcements page", "INVALID_REQUEST");
    }
    const { sections } = await this.getCourseContents(courseId);
    for (const module of sections.flatMap(section => section.modules)) {
      if (module.type !== "forum") continue;
      const discussions = parseAnnouncementsForum(await this.client.getForumPage(module.id, page), this.baseUrl);
      if (discussions !== null) return fetchCourseAnnouncements(this.client, courseId, discussions, this.baseUrl);
    }
    return [];
  }

  async getMaterialDetail(courseId: number, courseModuleId: number) {
    if (!Number.isSafeInteger(courseId) || courseId <= 0 || !Number.isSafeInteger(courseModuleId) || courseModuleId <= 0) {
      throw new MoodleError("Invalid course ID or course module ID", "INVALID_REQUEST");
    }
    const { sections } = await this.getCourseContents(courseId);
    const module = sections.flatMap(section => section.modules).find(item => item.id === courseModuleId);
    if (!module?.url || !isMaterialType(module.type)) {
      throw new MoodleError("Requested module is not a visible material in the enrolled course", "MATERIAL_NOT_AVAILABLE");
    }
    const html = await this.client.getMaterialPage(module.type, courseModuleId);
    return {
      id: module.id, courseId, name: module.name, type: module.type, url: module.url,
      ...parseMaterialDetail(html, module.type, this.baseUrl),
    };
  }
}
