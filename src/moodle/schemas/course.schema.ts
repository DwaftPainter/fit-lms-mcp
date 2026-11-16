import { z } from "zod";

export const moodleCourseItemSchema = z.object({
  id: z.number().int().positive().safe(),
  fullname: z.string(),
  shortname: z.string().optional(),
  summary: z.string().optional(),
  startdate: z.number().optional().nullable(),
  enddate: z.number().optional().nullable(),
  visible: z.boolean().optional(),
  progress: z.number().optional().nullable(),
  viewurl: z.string().optional(),
});

export const moodleEnrolledCoursesDataSchema = z.object({
  courses: z.array(moodleCourseItemSchema),
  nextoffset: z.number().int().nonnegative().safe().optional(),
});

export type MoodleCourseItem = z.infer<typeof moodleCourseItemSchema>;
export type MoodleEnrolledCoursesData = z.infer<typeof moodleEnrolledCoursesDataSchema>;
