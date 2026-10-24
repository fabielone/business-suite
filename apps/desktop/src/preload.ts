import { contextBridge, ipcRenderer } from 'electron';
import type { BridgeInput } from './security';
import type { BridgeResult } from './bridge';

// The main process appends this trusted argument from bundled build metadata.
const modeArg = process.argv.filter((value) => value.startsWith('--suite-mode=')).at(-1);
const mode = modeArg === '--suite-mode=demo' ? 'demo' : 'setup';
contextBridge.exposeInMainWorld(
  'suiteDesktop',
  Object.freeze({
    platform: process.platform,
    mode,
    request: (input: BridgeInput): Promise<BridgeResult> =>
      ipcRenderer.invoke('suite:request', input),
  }),
);
