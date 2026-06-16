import { ZodError, type ZodTypeAny, z } from "zod";
import { badRequest } from "./errors.js";

export function parseWithSchema<TSchema extends ZodTypeAny>(
  schema: TSchema,
  value: unknown
): z.infer<TSchema> {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) {
      throw badRequest("Request validation failed.", {
        issues: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message
        }))
      });
    }

    throw error;
  }
}
