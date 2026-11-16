import { parseAssignmentIndex, AssignmentLink } from "../moodle/api/assignments.js";
import { MoodleClient } from "../moodle/client.js";
import { MoodleError } from "../moodle/errors.js";
import { CourseService } from "./course.service.js";

export interface AssignmentInput { courseId?: number; }
export interface AssignmentSummary extends AssignmentLink { courseId: number; courseName: string; }

export class AssignmentService {
  constructor(private readonly client: MoodleClient, private readonly baseUrl: string) {}

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
