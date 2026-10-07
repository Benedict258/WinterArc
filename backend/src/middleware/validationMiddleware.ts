import { Request, Response, NextFunction } from 'express';
import { ZodError, ZodType } from 'zod';

/**
 * Middleware to validate request body using a Zod schema.
 * On success the body is replaced with the parsed value, so unknown
 * fields are stripped and can't be mass-assigned onto Mongoose documents.
 */
export const validateRequest = (schema: ZodType) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      const error = result.error instanceof ZodError
        ? result.error.issues.map(i => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ')
        : 'Validation failed';
      res.status(400).json({ error });
      return;
    }
    req.body = result.data;
    next();
  };
};
