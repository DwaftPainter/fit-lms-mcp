import { z } from "zod";

export const moodleExceptionSchema = z.object({
  errorcode: z.string().optional(),
  message: z.string().optional(),
  link: z.string().optional(),
  moreinfourl: z.string().optional(),
});

export const moodleErrorResponseSchema = z.object({
  error: z.literal(true),
  exception: moodleExceptionSchema.optional(),
  errorcode: z.string().optional(),
  message: z.string().optional(),
});

export function createMoodleSuccessResponseSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    error: z.literal(false),
    data: dataSchema,
  });
}

export type MoodleException = z.infer<typeof moodleExceptionSchema>;
export type MoodleErrorResponse = z.infer<typeof moodleErrorResponseSchema>;
