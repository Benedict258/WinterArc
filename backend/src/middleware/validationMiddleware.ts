import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

/**
 * Middleware to validate request body using a Zod schema
 * @param schema - Zod schema to validate against
 */
export const validateRequest = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Parse and validate the request body against the schema
      schema.parse(req.body);
      // If validation passes, move to the next middleware
      next();
    } catch (error) {
      // If validation fails, send a 400 Bad Request response
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(400).json({ error: 'Validation failed' });
      }
    }
  };
};