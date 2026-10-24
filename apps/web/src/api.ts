export type DemoRole = 'manager' | 'worker';
export type JobStatus = 'draft' | 'scheduled' | 'in_progress' | 'completed';
export type ExpenseStatus = 'submitted' | 'approved' | 'rejected';

export interface Workspace {
  business: { id: string; name: string; currency: string };
  user: { id: string; name: string };
  modules: string[];
  permissions: string[];
  members?: { id: string; name: string }[];
  demo: boolean;
  demoSessionId?: string;
}

export interface Job {
  id: string;
  title: string;
  customerName: string;
  status: JobStatus;
  agreedPriceMinor?: number;
  currency: string;
  assignedUserIds: string[];
  version: number;
}

export interface Expense {
  id: string;
  jobId?: string | null;
  description: string;
  amountMinor: number;
  currency: string;
  payerUserId: string;
  status: ExpenseStatus;
  missingReceiptReason: string | null;
  reviewReason?: string | null;
  version: number;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function request<T>(
  path: string,
  role: DemoRole,
  options: {
    businessId?: string;
    signal?: AbortSignal;
    body?: unknown;
    idempotencyKey?: string;
    demoSessionId?: string;
  } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', 'x-demo-user': role };
  if (options.businessId) headers['x-business-id'] = options.businessId;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
  if (options.demoSessionId) headers['X-Demo-Session-Id'] = options.demoSessionId;
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      method: options.body === undefined ? 'GET' : 'POST',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal ?? AbortSignal.timeout(10000),
      credentials: 'omit',
      cache: 'no-store',
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new ApiError(
      0,
      'connection_failed',
      'The local API could not be reached. Check that the demo backend is running, then try again.',
    );
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      response.status,
      data?.error?.code ?? 'request_failed',
      data?.error?.message ?? 'The API could not complete this request.',
    );
  }
  if (!data)
    throw new ApiError(
      502,
      'invalid_response',
      'The API returned an unexpected response. No demo data has been substituted.',
    );
  return data as T;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409)
      return `This record or request has changed. Refresh the data before trying again. ${error.message}`;
    if (error.status === 403)
      return `You do not have permission to perform this action. ${error.message}`;
    if (error.status === 401)
      return 'The API did not accept this identity. Check the explicit local demo configuration.';
    if (error.status === 404)
      return 'This record is unavailable or outside your access. Refresh the data to continue.';
    return error.message;
  }
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

export function formatMoney(amountMinor: number, currency = 'MXN'): string {
  return new Intl.NumberFormat('en-MX', {
    style: 'currency',
    currency,
    currencyDisplay: 'code',
  }).format(amountMinor / 100);
}

/** Parse decimal input without multiplying a floating-point currency value. */
export function parseMinor(input: string): number | null {
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(input.trim())) return null;
  const [whole, decimal = ''] = input.trim().split('.');
  const result = Number(whole) * 100 + Number(decimal.padEnd(2, '0'));
  return Number.isSafeInteger(result) ? result : null;
}
