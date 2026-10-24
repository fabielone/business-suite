import { OfflineClient, emptyState, type LocalState, type LocalStore } from '@suite/offline';
import { request, type DemoRole } from './api';

const database = new Promise<IDBDatabase>((resolve, reject) => {
  const open = indexedDB.open('business-suite-demo-v1', 1);
  open.onupgradeneeded = () => open.result.createObjectStore('workspaces');
  open.onsuccess = () => resolve(open.result);
  open.onerror = () => reject(new Error('Device storage is unavailable. Nothing has been saved.'));
});

function localStore(key: string): LocalStore {
  return {
    async read() {
      const db = await database;
      return new Promise((resolve, reject) => {
        const tx = db.transaction('workspaces', 'readonly');
        const get = tx.objectStore('workspaces').get(key);
        get.onsuccess = () => resolve((get.result as LocalState | undefined) ?? emptyState());
        get.onerror = () => reject(get.error);
      });
    },
    async update(change) {
      const db = await database;
      return new Promise((resolve, reject) => {
        const tx = db.transaction('workspaces', 'readwrite');
        const store = tx.objectStore('workspaces');
        const get = store.get(key);
        let next: LocalState;
        let failure: unknown;
        get.onsuccess = () => {
          try {
            next = change((get.result as LocalState | undefined) ?? emptyState());
            store.put(next, key);
          } catch (error) {
            failure = error;
            tx.abort();
          }
        };
        tx.oncomplete = () => resolve(next);
        tx.onabort = tx.onerror = () =>
          reject(
            failure ?? tx.error ?? new Error('Local save failed. Keep this form open and retry.'),
          );
      });
    },
  };
}
const clients = new Map<DemoRole, OfflineClient>();
export function offlineClient(role: DemoRole): OfflineClient {
  let client = clients.get(role);
  if (!client) {
    client = new OfflineClient({
      store: localStore(`${location.origin}|demo|10000000-0000-4000-8000-000000000001|${role}`),
      transport: (path, options) => request(path, role, options),
      businessId: '10000000-0000-4000-8000-000000000001',
      userId:
        role === 'manager'
          ? '20000000-0000-4000-8000-000000000001'
          : '20000000-0000-4000-8000-000000000002',
      newId: () => crypto.randomUUID(),
    });
    clients.set(role, client);
  }
  return client;
}
