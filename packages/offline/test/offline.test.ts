import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  OfflineClient,
  SyncError,
  emptyState,
  type Expense,
  type Job,
  type LocalState,
  type LocalStore,
  type Snapshot,
  type Transport,
  type TransportOptions,
  type Workspace,
} from '../src/index.js';

const ids = {
  business: '10000000-0000-4000-8000-000000000001',
  otherBusiness: '10000000-0000-4000-8000-000000000002',
  user: '20000000-0000-4000-8000-000000000001',
  otherUser: '20000000-0000-4000-8000-000000000002',
  job: '30000000-0000-4000-8000-000000000001',
  session: '40000000-0000-4000-8000-000000000001',
};
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const workspace = (): Workspace => ({
  business: { id: ids.business, name: 'Fictional business', currency: 'MXN' },
  user: { id: ids.user, name: 'Fictional worker' },
  modules: ['work', 'money'],
  permissions: [
    'work.jobs.read',
    'work.jobs.close',
    'money.expenses.read',
    'money.expenses.submit',
  ],
  demo: true,
  demoSessionId: ids.session,
});
const job = (): Job => ({
  id: ids.job,
  title: 'Fictional job',
  customerName: 'Fictional customer',
  status: 'scheduled',
  currency: 'MXN',
  assignedUserIds: [ids.user],
  version: 1,
});
const expenseInput = {
  description: 'Test materials',
  amountMinor: 15500,
  currency: 'MXN',
  missingReceiptReason: 'Vendor could not provide a receipt.',
};
const snapshot = (): Snapshot => ({
  workspace: workspace(),
  jobs: [job()],
  expenses: [],
  fetchedAt: '2026-10-24T00:00:00.000Z',
});

// JSON is the durable boundary: callers never share object references with storage.
// Shared serialization models the required atomic adapter contract, not IndexedDB itself.
class DurableMemory {
  serialized = JSON.stringify({ ...emptyState(), snapshot: snapshot() });
  tail: Promise<unknown> = Promise.resolve();
  failNextWrite = false;
  open(): LocalStore {
    return {
      read: async () => {
        await this.tail;
        return JSON.parse(this.serialized) as LocalState;
      },
      update: (change) => {
        const operation = this.tail.then(() => {
          const next = change(JSON.parse(this.serialized) as LocalState);
          if (this.failNextWrite) {
            this.failNextWrite = false;
            throw new Error('Storage write failed');
          }
          this.serialized = JSON.stringify(next);
          return clone(next);
        });
        this.tail = operation.catch(() => undefined);
        return operation;
      },
    };
  }
}
type Call = { path: string; options: TransportOptions };
class FakeServer {
  workspace = workspace();
  jobs = [job()];
  expenses: Expense[] = [];
  calls: Call[] = [];
  receipts = new Map<string, unknown>();
  loseNextAcknowledgement = false;
  onCommand?: (call: Call) => void | Promise<void>;
  transport: Transport = async <T>(path: string, options: TransportOptions): Promise<T> => {
    this.calls.push(clone({ path, options }));
    if (!options.body) {
      if (path === '/workspace') return clone(this.workspace) as T;
      if (path === '/jobs') return clone({ jobs: this.jobs }) as T;
      if (path === '/expenses') return clone({ expenses: this.expenses }) as T;
      throw new Error('Unexpected read ' + path);
    }
    await this.onCommand?.({ path, options });
    const key = options.idempotencyKey!;
    let result = this.receipts.get(key);
    if (!result) {
      if (path === '/expenses') {
        const body = options.body as typeof expenseInput;
        const expense: Expense = {
          id: '50000000-0000-4000-8000-' + String(this.expenses.length + 1).padStart(12, '0'),
          ...body,
          jobId: null,
          payerUserId: this.workspace.user.id,
          status: 'submitted',
          version: 1,
        };
        this.expenses.push(expense);
        result = { expense };
      } else {
        this.jobs[0] = { ...this.jobs[0]!, status: 'completed', version: 2 };
        result = { job: this.jobs[0] };
      }
      this.receipts.set(key, clone(result));
    }
    if (this.loseNextAcknowledgement) {
      this.loseNextAcknowledgement = false;
      throw new TypeError('Network response lost after commit');
    }
    return clone(result) as T;
  };
  writes(): Call[] {
    return this.calls.filter((call) => call.options.body);
  }
}
function fixture() {
  const disk = new DurableMemory();
  const server = new FakeServer();
  let sequence = 0;
  const client = (overrides: { businessId?: string; userId?: string } = {}) =>
    new OfflineClient({
      store: disk.open(),
      transport: server.transport,
      businessId: ids.business,
      userId: ids.user,
      newId: () => '60000000-0000-4000-8000-' + String(++sequence).padStart(12, '0'),
      now: () => '2026-10-24T00:01:00.000Z',
      ...overrides,
    });
  return { disk, server, client };
}

test('offline capture commits locally before transport and remains separate from confirmed records', async () => {
  const { disk, server, client } = fixture();
  const first = client();
  const queued = await first.enqueue('expense.submit', expenseInput);
  assert.equal(server.calls.length, 0);
  const persisted = JSON.parse(disk.serialized) as LocalState;
  assert.equal(persisted.commands[0]?.id, queued.id);
  assert.equal(persisted.commands[0]?.status, 'queued');
  assert.deepEqual(persisted.snapshot?.expenses, []);
  assert.deepEqual((await client().read()).commands, persisted.commands);
  queued.body.amountMinor = 1;
  assert.equal((await first.read()).commands[0]?.body.amountMinor, 15500);
  server.onCommand = () =>
    assert.equal((JSON.parse(disk.serialized) as LocalState).commands.length, 1);
  const synced = await client().sync();
  assert.equal(synced.commands.length, 0);
  assert.equal(synced.snapshot?.expenses[0]?.status, 'submitted');
  assert.equal(synced.snapshot?.expenses[0]?.amountMinor, 15500);
  assert.equal(server.writes()[0]?.options.demoSessionId, ids.session);
});

test('lost response after server commit survives reopening and retries the same key only once on server', async () => {
  const { server, client } = fixture();
  const first = client();
  const command = await first.enqueue('expense.submit', expenseInput);
  server.loseNextAcknowledgement = true;
  await assert.rejects(first.sync(), /response lost/);
  assert.equal(server.expenses.length, 1);
  assert.equal((await client().read()).commands[0]?.id, command.id);
  const completed = await client().sync();
  assert.deepEqual(
    server.writes().map((call) => call.options.idempotencyKey),
    [command.id, command.id],
  );
  assert.equal(server.expenses.length, 1);
  assert.equal(completed.commands.length, 0);
  assert.equal(completed.snapshot?.expenses.length, 1);
});

test('failed local acknowledgement commit retains retry intent without duplicate server expense', async () => {
  const { disk, server, client } = fixture();
  const current = client();
  const command = await current.enqueue('expense.submit', expenseInput);
  server.onCommand = () => {
    disk.failNextWrite = true;
  };
  await assert.rejects(current.sync(), /Storage write failed/);
  assert.equal((await current.read()).commands[0]?.id, command.id);
  assert.equal(server.expenses.length, 1);
  server.onCommand = undefined;
  assert.equal((await current.sync()).commands.length, 0);
  assert.equal(server.expenses.length, 1);
});

test('conflicts retain original version without rebasing; rejected entries do not stop independent work', async () => {
  const { server, client } = fixture();
  const current = client();
  const close = await current.enqueue('job.close', { jobId: ids.job, version: 1 });
  const invalid = await current.enqueue('expense.submit', {
    ...expenseInput,
    description: 'Rejected by server',
  });
  await current.enqueue('expense.submit', expenseInput);
  server.jobs[0]!.version = 2;
  server.onCommand = ({ path, options }) => {
    if (path.includes('/close'))
      throw new SyncError(409, 'VERSION_CONFLICT', 'A different worker changed this job.');
    if ((options.body as typeof expenseInput).description === 'Rejected by server')
      throw new SyncError(400, 'INVALID_INPUT', 'Record cannot be accepted.');
  };
  const result = await current.sync();
  assert.equal(result.commands.find((c) => c.id === close.id)?.status, 'conflict');
  assert.deepEqual(result.commands.find((c) => c.id === close.id)?.body, { version: 1 });
  assert.equal(result.commands.find((c) => c.id === invalid.id)?.status, 'rejected');
  assert.equal(result.snapshot?.jobs[0]?.version, 2);
  assert.equal(result.snapshot?.expenses.length, 1);
  const attempts = server.writes().length;
  await current.sync();
  assert.equal(server.writes().length, attempts);
  assert.equal(
    (await current.discard(close.id)).commands.some((c) => c.id === close.id),
    false,
  );
});

test('transport failures and retryable HTTP statuses leave uncertain delivery queued', async () => {
  for (const error of [
    new TypeError('Offline'),
    new SyncError(408, 'TIMEOUT', 'Timed out'),
    new SyncError(429, 'THROTTLED', 'Later'),
    new SyncError(503, 'UNAVAILABLE', 'Unavailable'),
  ]) {
    const { server, client } = fixture();
    const current = client();
    const queued = await current.enqueue('expense.submit', expenseInput);
    server.onCommand = () => {
      throw error;
    };
    await assert.rejects(current.sync());
    assert.equal((await current.read()).commands[0]?.status, 'queued');
    assert.equal((await current.discard(queued.id)).commands.length, 1);
  }
});

test('401 and 403 clear cached records and lock replay while retaining queued work', async () => {
  for (const status of [401, 403]) {
    const { server, client } = fixture();
    const current = client();
    await current.enqueue('expense.submit', expenseInput);
    server.onCommand = () => {
      throw new SyncError(status, 'ACCESS_DENIED', 'Access must be rechecked.');
    };
    await assert.rejects(current.sync());
    const state = await current.read();
    assert.equal(state.snapshot, null);
    assert.equal(state.commands.length, 1);
    assert.equal(state.blockedReason, 'Access must be rechecked.');
    await assert.rejects(
      current.enqueue('expense.submit', expenseInput),
      /Access must be rechecked/,
    );
    const count = server.writes().length;
    await assert.rejects(client().sync());
    assert.equal(server.writes().length, count);
  }
});

test('restarted demo blocks old pending work before send, and command-time epoch conflict also locks it', async () => {
  for (const duringCommand of [false, true]) {
    const { server, client } = fixture();
    const current = client();
    await current.enqueue('expense.submit', expenseInput);
    if (duringCommand)
      server.onCommand = () => {
        throw new SyncError(409, 'DEMO_SESSION_CHANGED', 'Demo restarted.');
      };
    else server.workspace.demoSessionId = '40000000-0000-4000-8000-000000000002';
    await assert.rejects(current.sync());
    const state = await current.read();
    assert.equal(state.snapshot, null);
    assert.equal(state.commands.length, 1);
    assert.ok(state.blockedReason);
    assert.equal(server.writes().length, duringCommand ? 1 : 0);
  }
});

test('wrong stored user or business cannot be reinterpreted as another account during refresh', async () => {
  for (const change of ['user', 'business'] as const) {
    const { server, client } = fixture();
    await client().enqueue('expense.submit', expenseInput);
    if (change === 'user') server.workspace.user.id = ids.otherUser;
    else server.workspace.business.id = ids.otherBusiness;
    const wrongAccount = client(
      change === 'user' ? { userId: ids.otherUser } : { businessId: ids.otherBusiness },
    );
    await assert.rejects(wrongAccount.sync(), /match|account|identity/i);
    assert.equal(server.writes().length, 0);
  }
});

test('repeated reads never expose another account pending command bodies after an identity lock', async () => {
  const { client } = fixture();
  await client().enqueue('expense.submit', expenseInput);
  const wrongAccount = client({ userId: ids.otherUser });
  await assert.rejects(wrongAccount.read(), /match|account|identity/i);
  for (let attempt = 0; attempt < 2; attempt++) {
    const state = await wrongAccount.read().catch((error: unknown) => {
      assert.ok(error instanceof SyncError);
      assert.equal(error.status, 403);
      return undefined;
    });
    if (state) {
      assert.equal(state.snapshot, null);
      assert.equal(
        state.commands.length,
        0,
        'A different account must not receive retained pending financial records.',
      );
    }
  }
});

test('local validation rejects spoofed payer, missing reason, invalid money and unsupported permissions', async () => {
  const { disk, server, client } = fixture();
  const current = client();
  for (const input of [
    { ...expenseInput, payerUserId: ids.otherUser },
    { ...expenseInput, missingReceiptReason: ' ' },
    { ...expenseInput, amountMinor: 0 },
    { ...expenseInput, amountMinor: 0.5 },
    { ...expenseInput, jobId: '30000000-0000-4000-8000-000000000099' },
  ])
    await assert.rejects(current.enqueue('expense.submit', input));
  await disk.open().update((s) => ({
    ...s,
    snapshot: { ...s.snapshot!, workspace: { ...s.snapshot!.workspace, permissions: [] } },
  }));
  await assert.rejects(current.enqueue('expense.submit', expenseInput), /unavailable/);
  await assert.rejects(current.enqueue('job.close', { jobId: ids.job, version: 1 }), /unavailable/);
  assert.equal((await current.read()).commands.length, 0);
  assert.equal(server.calls.length, 0);
});

test('atomic adapter serializes concurrent captures and deduplicates close intent across clients', async () => {
  const { client } = fixture();
  const first = client();
  const second = client();
  await Promise.all(
    Array.from({ length: 10 }, (_, index) =>
      (index % 2 ? first : second).enqueue('expense.submit', {
        ...expenseInput,
        description: 'Expense ' + index,
      }),
    ),
  );
  const closes = await Promise.all([
    first.enqueue('job.close', { jobId: ids.job, version: 1 }),
    second.enqueue('job.close', { jobId: ids.job, version: 1 }),
  ]);
  const state = await first.read();
  assert.equal(state.commands.length, 11);
  assert.equal(new Set(state.commands.map((command) => command.id)).size, 11);
  assert.equal(closes[0]!.id, closes[1]!.id);
});

test('in-flight acknowledgement preserves newly captured work and simultaneous sync shares one batch', async () => {
  const { server, client } = fixture();
  const current = client();
  const first = await current.enqueue('expense.submit', expenseInput);
  let notifyStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    notifyStarted = resolve;
  });
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  server.onCommand = async () => {
    notifyStarted();
    await wait;
  };
  const syncing = current.sync();
  assert.equal(current.sync(), syncing);
  await started;
  const next = await current.enqueue('expense.submit', {
    ...expenseInput,
    description: 'Captured during sync',
  });
  release();
  const state = await syncing;
  assert.deepEqual(
    state.commands.map((command) => command.id),
    [next.id],
  );
  assert.equal(state.snapshot?.expenses.length, 1);
  assert.deepEqual(
    server.writes().map((call) => call.options.idempotencyKey),
    [first.id],
  );
  server.onCommand = undefined;
  assert.equal((await current.sync()).commands.length, 0);
  assert.equal(server.expenses.length, 2);
});

test('mutations preserve unsupported schema and independently recorded owner identity', async () => {
  for (const incompatible of ['schema', 'owner']) {
    const { disk, client } = fixture();
    const current = client();
    const command = await current.enqueue('expense.submit', expenseInput);
    const state = JSON.parse(disk.serialized);
    state.commands[0].status = 'conflict';
    if (incompatible === 'schema') state.schemaVersion = 2;
    else state.owner = { userId: ids.otherUser, businessId: ids.business };
    disk.serialized = JSON.stringify(state);
    const before = disk.serialized;
    await assert.rejects(current.enqueue('expense.submit', expenseInput));
    assert.equal(disk.serialized, before);
    await assert.rejects(current.discard(command.id));
    assert.equal(disk.serialized, before);
  }
});

test('malformed stored intents cannot redirect replay or change the permitted command shape', async () => {
  const mutations: Array<(state: LocalState) => void> = [
    (state) => {
      state.commands[0]!.path = '/jobs';
    },
    (state) => {
      state.commands[0]!.path = '/expenses/' + ids.job + '/review';
    },
    (state) => {
      state.commands[0]!.path = '//outside.example/expenses';
    },
    (state) => {
      state.commands[0]!.kind = 'payments.create' as never;
    },
    (state) => {
      state.commands[0]!.body.payerUserId = ids.otherUser;
    },
    (state) => {
      state.commands[0]!.body.amountMinor = -1;
    },
    (state) => {
      state.commands[0]!.status = ['queued'] as never;
    },
    (state) => {
      state.commands[0]!.id = '';
    },
    (state) => {
      state.commands.push(clone(state.commands[0]!));
    },
    (state) => {
      state.commands[0] = {
        ...state.commands[0]!,
        kind: 'job.close',
        path: '/jobs/' + ids.job + '/close',
        body: { version: '1' },
      };
    },
  ];
  for (const change of mutations) {
    const { disk, server, client } = fixture();
    const current = client();
    await current.enqueue('expense.submit', expenseInput);
    const state = JSON.parse(disk.serialized) as LocalState;
    change(state);
    disk.serialized = JSON.stringify(state);
    const before = disk.serialized;
    await assert.rejects(
      current.sync(),
      (error) => error instanceof SyncError && error.code === 'LOCAL_FORMAT',
    );
    assert.equal(server.calls.length, 0);
    assert.equal(disk.serialized, before);
  }
});

test('queue corruption during an in-flight request cannot send a later unrelated action', async () => {
  const { disk, server, client } = fixture();
  const current = client();
  await current.enqueue('expense.submit', expenseInput);
  await current.enqueue('expense.submit', { ...expenseInput, description: 'Second expense' });
  server.onCommand = () => {
    const state = JSON.parse(disk.serialized) as LocalState;
    state.commands[1]!.path = '/jobs';
    disk.serialized = JSON.stringify(state);
  };
  await assert.rejects(
    current.sync(),
    (error) => error instanceof SyncError && error.code === 'LOCAL_FORMAT',
  );
  assert.equal(server.writes().length, 1);
  assert.equal(server.expenses.length, 1);
  const stored = JSON.parse(disk.serialized) as LocalState;
  assert.equal(stored.commands.length, 2);
  assert.equal(stored.commands[0]!.status, 'queued');
  assert.equal(stored.commands[1]!.path, '/jobs');
});

test('a late acknowledgement cannot repopulate a locally reset and refreshed snapshot', async () => {
  const { server, client } = fixture();
  const firstTab = client();
  const secondTab = client();
  await firstTab.enqueue('expense.submit', expenseInput);
  let notifyStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    notifyStarted = resolve;
  });
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  server.onCommand = async () => {
    notifyStarted();
    await wait;
  };
  const syncing = firstTab.sync();
  await started;
  await secondTab.reset();
  await secondTab.refresh();
  release();
  const state = await syncing;
  assert.equal(
    server.expenses.length,
    1,
    'Reset cannot cancel a server operation already in flight.',
  );
  assert.equal(state.commands.length, 0);
  assert.deepEqual(state.snapshot?.expenses, []);
  assert.equal((await secondTab.refresh()).snapshot?.expenses.length, 1);
});
