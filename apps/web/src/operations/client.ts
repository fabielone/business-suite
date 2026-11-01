import {
  emptyData,
  executeCommand,
  sampleData,
  ROLE_GRANTS,
  validateData,
  type SuiteData,
  type Command,
  type Access,
  type Workspace,
} from '@suite/core/operations';

export type User = { id: string; email: string; name: string };
export type WorkspaceEntry = {
  workspace: Workspace;
  role: string;
  grants: Access[];
};
export class RequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export const API = import.meta.env.VITE_SUITE_API_BASE || '/sharedapi';
export async function api<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(API + '/v2' + path, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new RequestError(
      0,
      'NETWORK',
      'Cannot reach the shared server. Your form is still here. Check your connection and retry.',
    );
  }
  let result: any;
  try {
    result = await response.json();
  } catch {
    throw new RequestError(
      response.status,
      'SERVER_UNAVAILABLE',
      'This server has not loaded the new workspace API yet. You can explore the examples while deployment is completed.',
    );
  }
  if (!response.ok)
    throw new RequestError(
      response.status,
      result?.error?.code ?? 'REQUEST_FAILED',
      result?.error?.message ?? 'The request could not be completed.',
    );
  return result as T;
}
const database = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('business-suite-operations-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('documents');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Device storage is unavailable. Nothing was saved.'));
  });
export async function readDocument<T>(key: string): Promise<T | undefined> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('documents', 'readonly');
    const get = tx.objectStore('documents').get(key);
    get.onsuccess = () => resolve(get.result);
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => db.close();
  });
}
export async function writeDocument(key: string, value: unknown) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('documents', 'readwrite');
    tx.objectStore('documents').put(value, key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(tx.error ?? new Error('Local save failed. Keep your draft and retry.'));
    };
  });
}
export async function samples(): Promise<SuiteData> {
  return updateSamples((current) => current);
}
export async function updateSamples(update: (current: SuiteData) => SuiteData): Promise<SuiteData> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('documents', 'readwrite');
    const store = tx.objectStore('documents');
    const get = store.get('samples');
    let next: SuiteData;
    let error: unknown;
    get.onsuccess = () => {
      try {
        next = update(get.result ? validateData(get.result) : sampleData());
        store.put(next, 'samples');
      } catch (e) {
        error = e;
        tx.abort();
      }
    };
    tx.oncomplete = () => {
      db.close();
      resolve(next);
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(error ?? tx.error ?? new Error('Local save failed. Nothing was changed.'));
    };
  });
}
export async function sampleCommand(command: Command): Promise<SuiteData> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('documents', 'readwrite');
    const store = tx.objectStore('documents');
    const get = store.get('samples');
    let next: SuiteData;
    let error: unknown;
    get.onsuccess = () => {
      try {
        next = executeCommand(validateData(get.result), command);
        store.put(next, 'samples');
      } catch (e) {
        error = e;
        tx.abort();
      }
    };
    tx.oncomplete = () => {
      db.close();
      resolve(next);
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(error ?? tx.error ?? new Error('Nothing was saved. Please retry.'));
    };
  });
}
export type Pending = {
  command: Command;
  state: 'queued' | 'conflict' | 'rejected';
  error?: string;
};
export type OfflineDocument = {
  user: User;
  entry: WorkspaceEntry;
  confirmed: SuiteData;
  pending: Pending[];
  downloadedAt: string;
};
type Envelope = {
  version: 1;
  revision?: number;
  salt: number[];
  iv: number[];
  bytes: number[];
};
/** Tokens never enter this vault. The passphrase remains in memory only. */
export class OfflineVault {
  private key: CryptoKey | undefined;
  private salt: Uint8Array | undefined;
  private revision = 0;
  constructor(private email: string) {}
  private async name() {
    const bytes = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(this.email.toLowerCase()),
    );
    return (
      'vault-' + Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('')
    );
  }
  async unlock(passphrase: string): Promise<OfflineDocument | undefined> {
    if (passphrase.length < 12)
      throw new Error('Use at least 12 characters for your device passphrase.');
    const envelope = await readDocument<Envelope>(await this.name());
    this.revision = envelope?.revision ?? 0;
    this.salt = envelope
      ? new Uint8Array(envelope.salt)
      : crypto.getRandomValues(new Uint8Array(16));
    const material = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(passphrase),
      'PBKDF2',
      false,
      ['deriveKey'],
    );
    this.key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: this.salt as BufferSource,
        iterations: 310000,
        hash: 'SHA-256',
      },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
    if (!envelope) return undefined;
    try {
      if (envelope.version !== 1) throw new Error('Unsupported vault version.');
      const bytes = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(envelope.iv) },
        this.key,
        new Uint8Array(envelope.bytes),
      );
      const document = JSON.parse(new TextDecoder().decode(bytes)) as OfflineDocument;
      // Live projections can intentionally omit protected collections; full validation happens at the server.
      if (
        document.user.email.toLowerCase() !== this.email.toLowerCase() ||
        document.confirmed.schemaVersion !== 1 ||
        !Array.isArray(document.pending)
      )
        throw new Error('Invalid ownership or schema.');
      return document;
    } catch {
      this.key = undefined;
      throw new Error(
        'The device passphrase is incorrect or the offline vault is damaged. Existing data has been preserved.',
      );
    }
  }
  async save(document: OfflineDocument) {
    if (!this.key || !this.salt) throw new Error('Unlock device storage before saving offline.');
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const bytes = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      this.key,
      new TextEncoder().encode(JSON.stringify(document)),
    );
    const name = await this.name(),
      revision = this.revision;
    const envelope: Envelope = {
      version: 1,
      revision: revision + 1,
      salt: [...this.salt],
      iv: [...iv],
      bytes: [...new Uint8Array(bytes)],
    };
    const db = await database();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('documents', 'readwrite');
      const store = tx.objectStore('documents');
      const get = store.get(name);
      let conflict = false;
      get.onsuccess = () => {
        if ((get.result?.revision ?? 0) !== revision) {
          conflict = true;
          tx.abort();
        } else store.put(envelope, name);
      };
      tx.oncomplete = () => {
        db.close();
        this.revision = revision + 1;
        resolve();
      };
      tx.onabort = tx.onerror = () => {
        db.close();
        reject(
          new Error(
            conflict
              ? 'Offline storage changed in another tab. Existing pending work is preserved. Close the other tab, then sign out and unlock the saved workspace again.'
              : 'Device save failed. Keep your draft and retry.',
          ),
        );
      };
    });
  }
  lock() {
    this.key = undefined;
    this.salt = undefined;
  }
}
export function sampleEntries(data: SuiteData): WorkspaceEntry[] {
  return data.workspaces.map((workspace) => ({
    workspace,
    role: 'owner',
    grants: ROLE_GRANTS.owner!,
  }));
}
export function download(name: string, value: string | Blob, type = 'text/plain') {
  const blob = typeof value === 'string' ? new Blob([value], { type }) : value;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export function eml(to: string, subject: string, body: string) {
  const header = (s: string) => s.replace(/[\r\n]/g, ' ');
  const encoded = btoa(
    Array.from(new TextEncoder().encode(subject), (b) => String.fromCharCode(b)).join(''),
  );
  return `To: ${header(to)}\r\nSubject: =?UTF-8?B?${encoded}?=\r\nX-Unsent: 1\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${body.replace(/\r?\n/g, '\r\n')}`;
}
