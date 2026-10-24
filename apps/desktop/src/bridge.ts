import { MAX_BYTES, validateRequest, type DesktopMode } from './security';

export interface BridgeResult {
  status: number;
  data: unknown;
}
export type ApiFetch = (url: string, options: RequestInit) => Promise<Response>;
export const bridgeError = (status: number, code: string, message: string): BridgeResult => ({
  status,
  data: { error: { code, message } },
});

export async function executeRequest(
  input: unknown,
  options: { mode: DesktopMode; fetcher: ApiFetch },
): Promise<BridgeResult> {
  if (options.mode !== 'demo')
    return bridgeError(
      403,
      'DESKTOP_SETUP_REQUIRED',
      'This desktop build needs authenticated service setup.',
    );
  let request: ReturnType<typeof validateRequest>;
  try {
    request = validateRequest(input);
  } catch {
    return bridgeError(
      400,
      'INVALID_DESKTOP_REQUEST',
      'The request is outside the supported desktop API contract or exceeds 64 KiB.',
    );
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await options.fetcher(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: controller.signal,
      redirect: 'error',
      credentials: 'omit',
      cache: 'no-store',
    });
    if (response.status >= 300 && response.status < 400)
      return bridgeError(
        502,
        'REDIRECT_DENIED',
        'The local API must not redirect desktop requests.',
      );
    if (!response.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
      return bridgeError(
        502,
        'INVALID_API_RESPONSE',
        'The local API returned an unexpected content type.',
      );
    if (!response.body)
      return bridgeError(502, 'INVALID_API_RESPONSE', 'The local API response was empty.');
    const reader = response.body.getReader();
    const parts: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > MAX_BYTES) {
        await reader.cancel();
        return bridgeError(
          502,
          'API_RESPONSE_TOO_LARGE',
          'The local API response exceeds this prototype’s 64 KiB limit.',
        );
      }
      parts.push(part.value);
    }
    try {
      return {
        status: response.status,
        data: JSON.parse(Buffer.concat(parts).toString('utf8')) as unknown,
      };
    } catch {
      return bridgeError(502, 'INVALID_API_RESPONSE', 'The local API response was not valid JSON.');
    }
  } catch {
    return bridgeError(
      0,
      'API_UNREACHABLE',
      'The local demo API could not be reached. Saved entries remain on this device.',
    );
  } finally {
    clearTimeout(timer);
  }
}
