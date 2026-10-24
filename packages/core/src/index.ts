export const PERMISSIONS = [
  'work.jobs.read',
  'work.jobs.create',
  'work.jobs.close',
  'work.prices.read',
  'money.expenses.read',
  'money.expenses.submit',
  'money.expenses.review',
] as const;
export type Permission = (typeof PERMISSIONS)[number];
export type Scope = 'business' | 'assigned' | 'own';
export type JobStatus = 'draft' | 'scheduled' | 'in_progress' | 'completed';
export type ExpenseStatus = 'submitted' | 'approved' | 'rejected';
export interface Job {
  id: string;
  title: string;
  customerName: string;
  status: JobStatus;
  agreedPriceMinor?: number;
  currency: 'MXN';
  assignedUserIds: string[];
  version: number;
}
export interface Expense {
  id: string;
  jobId: string | null;
  description: string;
  amountMinor: number;
  currency: 'MXN';
  payerUserId: string;
  status: ExpenseStatus;
  missingReceiptReason: string;
  version: number;
  reviewReason?: string | null;
}
export interface Workspace {
  business: { id: string; name: string; currency: 'MXN' };
  user: { id: string; name: string };
  modules: string[];
  permissions: string[];
  demo: boolean;
  members?: { id: string; name: string }[];
}
export class DomainError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
export const MAX_MONEY_MINOR = 1_000_000_000_000;
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function uuid(value: unknown, label: string): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new DomainError(400, 'INVALID_INPUT', label + ' must be a UUID.');
  }
  return value.toLowerCase();
}
export function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new DomainError(400, 'INVALID_INPUT', 'A JSON object is required.');
  }
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some((key) => !keys.includes(key))) {
    throw new DomainError(400, 'INVALID_INPUT', 'The request contains an unsupported field.');
  }
  return result;
}
export function text(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new DomainError(
      400,
      'INVALID_INPUT',
      label + ' is required and must be at most ' + max + ' characters.',
    );
  }
  return value.trim();
}
export function money(value: unknown, allowZero = false): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < (allowZero ? 0 : 1) ||
    value > MAX_MONEY_MINOR
  ) {
    throw new DomainError(
      400,
      'INVALID_INPUT',
      'Amount must be whole MXN centavos within the supported range.',
    );
  }
  return value;
}
export function currency(value: unknown): 'MXN' {
  if (value !== 'MXN') throw new DomainError(400, 'INVALID_INPUT', 'This slice supports MXN only.');
  return 'MXN';
}
export function version(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new DomainError(400, 'INVALID_INPUT', 'A positive record version is required.');
  }
  return value;
}
export function idempotencyKey(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 160 ||
    !/^[\x21-\x7e]+$/.test(value)
  ) {
    throw new DomainError(
      400,
      'INVALID_IDEMPOTENCY_KEY',
      'Idempotency-Key must contain 1–160 printable non-space characters.',
    );
  }
  return value;
}
