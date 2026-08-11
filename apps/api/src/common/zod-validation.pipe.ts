import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { ZodType, ZodTypeDef } from 'zod';

export class ZodValidationPipe<T> implements PipeTransform {
  // Input is left as `any` rather than pinned to T: schemas that `.transform()`
  // or `.pipe()` (e.g. a JSON-encoded field into a parsed array) legitimately
  // have an input type that differs from their output, and every use here
  // parses an unknown request body anyway.
  constructor(private readonly schema: ZodType<T, ZodTypeDef, any>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return result.data;
  }
}

export const zodPipe = <T>(schema: ZodType<T, ZodTypeDef, any>) => new ZodValidationPipe(schema);
