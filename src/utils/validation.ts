import { ValidationError } from './errors';

export function validateRequired(
  value: unknown,
  fieldName: string,
  service: string
): void {
  if (value === undefined || value === null || value === '') {
    throw new ValidationError(
      `Field '${fieldName}' is required`,
      service,
      { field: fieldName }
    );
  }
}

export function validateString(
  value: unknown,
  fieldName: string,
  service: string
): string {
  if (typeof value !== 'string') {
    throw new ValidationError(
      `Field '${fieldName}' must be a string`,
      service,
      { field: fieldName, received: typeof value }
    );
  }
  return value;
}

export function validateNumber(
  value: unknown,
  fieldName: string,
  service: string
): number {
  if (typeof value !== 'number' || isNaN(value)) {
    throw new ValidationError(
      `Field '${fieldName}' must be a number`,
      service,
      { field: fieldName, received: typeof value }
    );
  }
  return value;
}

export function validateBoolean(
  value: unknown,
  fieldName: string,
  service: string
): boolean {
  if (typeof value !== 'boolean') {
    throw new ValidationError(
      `Field '${fieldName}' must be a boolean`,
      service,
      { field: fieldName, received: typeof value }
    );
  }
  return value;
}

export function validateEnum<T extends string>(
  value: unknown,
  fieldName: string,
  allowedValues: T[],
  service: string
): T {
  if (typeof value !== 'string' || !allowedValues.includes(value as T)) {
    throw new ValidationError(
      `Field '${fieldName}' must be one of: ${allowedValues.join(', ')}`,
      service,
      { field: fieldName, received: value, allowed: allowedValues }
    );
  }
  return value as T;
}
