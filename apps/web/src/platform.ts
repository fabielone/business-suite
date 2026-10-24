export interface DesktopRequest {
  path: string;
  role: 'manager' | 'worker';
  businessId?: string;
  body?: unknown;
  idempotencyKey?: string;
  demoSessionId?: string;
}
export interface DesktopBridge {
  platform: 'darwin' | 'win32' | 'linux';
  mode: 'demo' | 'setup';
  request(input: DesktopRequest): Promise<{ status: number; data: unknown }>;
}
declare global {
  interface Window {
    suiteDesktop?: DesktopBridge;
  }
}
/** Browser builds never trust an injected desktop-shaped object to enable demo access. */
export function desktopBridge(): DesktopBridge | undefined {
  if (!['desktop', 'desktop-demo'].includes(import.meta.env.MODE)) return undefined;
  if (location.protocol !== 'suite:' || location.hostname !== 'app') return undefined;
  return window.suiteDesktop;
}
export function demoEnabled(): boolean {
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);
  return (
    (import.meta.env.MODE === 'demo' && loopback) ||
    (import.meta.env.MODE === 'desktop-demo' && desktopBridge()?.mode === 'demo')
  );
}
