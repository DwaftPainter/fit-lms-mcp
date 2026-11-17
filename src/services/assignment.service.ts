import { parseAssignmentIndex, AssignmentLink } from "../moodle/api/assignments.js";
import { parseAssignmentDetail, AssignmentDetail } from "../moodle/api/assignment-detail.js";
import { MoodleClient } from "../moodle/client.js";
import { MoodleError } from "../moodle/errors.js";
import { CourseService } from "./course.service.js";

export interface AssignmentInput { courseId?: number; }
export interface AssignmentSummary extends AssignmentLink { courseId: number; courseName: string; }

export class AssignmentService {
  constructor(private readonly client: MoodleClient, private readonly baseUrl: string) {}

  async getCourseAssignments(courseId: number) {
    return (await this.getAssignments({ courseId })).map(assignment => ({
      id: assignment.courseModuleId,
      idType: "courseModule" as const,
      name: assignment.title,
      courseId: assignment.courseId,
      courseName: assignment.courseName,
      url: assignment.url,
    }));
  }

  async getAssignmentDetail(courseModuleId: number): Promise<AssignmentDetail> {
    if (!Number.isSafeInteger(courseModuleId) || courseModuleId <= 0) {
      throw new MoodleError("Invalid course module ID", "INVALID_REQUEST");
    }
    const html = await this.client.getAssignmentPage(courseModuleId);
    return parseAssignmentDetail(html, this.baseUrl, courseModuleId);
  }

  async getAssignments(input: AssignmentInput = {}): Promise<AssignmentSummary[]> {
    const courses = await new CourseService(this.client).getMyCourses();
    if (input.courseId && !courses.some(course => course.id === input.courseId)) {
      throw new MoodleError("Requested course is not in the student's enrolled courses", "COURSE_NOT_ENROLLED");
    }
    const assignments: AssignmentSummary[] = [];
    for (const course of courses.filter(course => !input.courseId || course.id === input.courseId)) {
      const html = await this.client.getAssignmentIndex(course.id);
      assignments.push(...parseAssignmentIndex(html, this.baseUrl).map(assignment => ({
        ...assignment, courseId: course.id, courseName: course.name,
      })));
    }
    return assignments;
  }
}
