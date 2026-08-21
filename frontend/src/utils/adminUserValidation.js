import { z } from 'zod';

const utf8ByteLength = (value) => new TextEncoder().encode(value).length;

const optionalPositiveInteger = (message) => z.preprocess(
  (value) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!/^\d+$/.test(trimmed)) return value;
      return Number(trimmed);
    }
    return value;
  },
  z.number({ invalid_type_error: message })
    .int(message)
    .positive(message)
    .safe(message)
    .optional()
);

const optionalDepartment = (message) => z.preprocess(
  (value) => {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed || undefined;
  },
  z.string().max(100, message).optional()
);

export function createAdminUserSchema(t) {
  return z.object({
    name: z.string()
      .trim()
      .min(2, t('admin.validationName'))
      .max(100, t('admin.validationName')),
    email: z.string()
      .trim()
      .max(255, t('admin.validationEmail'))
      .email(t('admin.validationEmail'))
      .transform((value) => value.toLowerCase()),
    password: z.string()
      .min(8, t('admin.validationPasswordLength'))
      .refine((value) => utf8ByteLength(value) <= 72, t('admin.validationPasswordBytes'))
      .refine((value) => /[A-Z]/.test(value), t('admin.validationPasswordUppercase'))
      .refine((value) => /[a-z]/.test(value), t('admin.validationPasswordLowercase'))
      .refine((value) => /[0-9]/.test(value), t('admin.validationPasswordDigit')),
    role: z.enum(['admin', 'teacher', 'student'], {
      errorMap: () => ({ message: t('admin.validationRole') }),
    }),
    studentId: optionalPositiveInteger(t('admin.validationStudentId')),
    department: optionalDepartment(t('admin.validationDepartment')),
  });
}

export function buildCreateUserPayload(values) {
  const payload = {
    name: values.name.trim(),
    email: values.email.trim().toLowerCase(),
    password: values.password,
    role: values.role,
  };

  if (values.role === 'student' && values.studentId !== undefined) {
    payload.studentId = values.studentId;
  }

  if (values.role === 'teacher' && values.department) {
    payload.department = values.department.trim();
  }

  return payload;
}
