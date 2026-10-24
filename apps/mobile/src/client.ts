import { OfflineClient, SyncError, type Transport } from '@suite/offline';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { sqliteStore } from './sqliteStore';

export type DemoRole = 'worker' | 'manager';
export const API_URL = 'http://127.0.0.1:4310/v1';
export const demoRequested = process.env.EXPO_PUBLIC_SUITE_MODE === 'demo';
export const simulatorDemoAllowed =
  demoRequested &&
  Device.isDevice === false &&
  (Platform.OS === 'ios' || Platform.OS === 'android');
const businessId = '10000000-0000-4000-8000-000000000001';
const users: Record<DemoRole, string> = {
  manager: '20000000-0000-4000-8000-000000000001',
  worker: '20000000-0000-4000-8000-000000000002',
};

export function createClient(role: DemoRole): OfflineClient {
  if (!simulatorDemoAllowed)
    throw new Error('Fictional demo access is available only in a simulator or emulator.');
  const transport: Transport = async <T>(
    path: string,
    options: Parameters<Transport>[1],
  ): Promise<T> => {
    if (!simulatorDemoAllowed || !path.startsWith('/') || path.startsWith('//')) {
      throw new SyncError(
        403,
        'DEMO_UNAVAILABLE',
        'This device cannot use the fictional demo API.',
      );
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(`${API_URL}${path}`, {
        method: options.body === undefined ? 'GET' : 'POST',
        headers: {
          Accept: 'application/json',
          'x-demo-user': role,
          'x-business-id': options.businessId,
          ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
          ...(options.demoSessionId ? { 'X-Demo-Session-Id': options.demoSessionId } : {}),
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        signal: controller.signal,
      });
      const result = (await response.json().catch(() => null)) as {
        error?: { code?: string; message?: string };
      } | null;
      if (!response.ok)
        throw new SyncError(
          response.status,
          result?.error?.code ?? 'HTTP_ERROR',
          result?.error?.message ?? `The server returned ${response.status}.`,
        );
      if (!result)
        throw new SyncError(
          502,
          'INVALID_RESPONSE',
          'The server returned an unreadable response. Saved entries remain on this device.',
        );
      return result as T;
    } catch (error) {
      if (error instanceof SyncError) throw error;
      throw new SyncError(
        0,
        'UNREACHABLE',
        'The local demo server could not be reached. Saved entries will stay on this device.',
      );
    } finally {
      clearTimeout(timeout);
    }
  };
  return new OfflineClient({
    store: sqliteStore(`suite-v1-loopback4310-${businessId}-${users[role]}`),
    transport,
    businessId,
    userId: users[role],
    newId: () => Crypto.randomUUID(),
  });
}
