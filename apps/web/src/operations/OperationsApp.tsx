import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  emptyData,
  executeCommand,
  authorizeCommand,
  projectForActor,
  workspaceData,
  PRESETS,
  ROLE_GRANTS,
  type Actor,
  type SuiteData,
  type Command,
  type Access,
  type Module,
} from '@suite/core/operations';
import {
  api,
  samples,
  sampleCommand,
  sampleEntries,
  sampleTick,
  OfflineVault,
  download,
  RequestError,
  type User,
  type WorkspaceEntry,
  type OfflineDocument,
  type Pending,
} from './client';
import {
  Button,
  Editor,
  Icon,
  Search,
  Badge,
  Empty,
  PageTitle,
  Panel,
  type FormSpec,
} from './components';
import {
  Overview,
  Contacts,
  Companies,
  CRM,
  Work,
  Money,
  Tasks,
  MyWork,
  Referrals,
  Activity,
  type PageProps,
} from './pages';
import { Settings } from './Settings';
import { Automations } from './Automations';
import './operations.css';

const OFFLINE_COMMANDS = new Set([
  'contact.save',
  'contact.convert',
  'deal.save',
  'project.save',
  'expense.add',
  'task.save',
  'task.complete',
  // A claim made offline stays pending; if a teammate claimed first the server refuses it.
  'task.claim',
  'task.unclaim',
  'referral.save',
  'template.save',
  'draft.save',
]);
const PAGE_NAMES: Record<string, string> = {
  overview: 'Overview',
  mywork: 'My work',
  crm: 'Pipeline',
  contacts: 'People',
  companies: 'Companies',
  work: 'Jobs',
  money: 'Money',
  chores: 'Tasks',
  referrals: 'Referrals',
  automations: 'Automations',
  settings: 'Settings',
  activity: 'Activity',
  sync: 'Device sync',
};
/** Example mode only: preview each role with the same projection the server applies. */
const VIEW_AS: Record<string, { label: string; email: string }> = {
  owner: { label: 'Owner', email: '' },
  manager: { label: 'Manager', email: '' },
  collaborator: { label: 'Sales', email: '' },
  lead: { label: 'Team lead (Sam)', email: 'sam@example.com' },
  production: { label: 'Production (Alex)', email: 'alex@example.com' },
};
type Theme = 'system' | 'light' | 'dark';
type Breakpoint = 'phone' | 'tablet' | 'desktop';
const PHONE = '(max-width: 639px)';
const TABLET = '(max-width: 1023px)';
function useBreakpoint(): Breakpoint {
  const read = () =>
    matchMedia(PHONE).matches ? 'phone' : matchMedia(TABLET).matches ? 'tablet' : 'desktop';
  const [value, setValue] = useState<Breakpoint>(read);
  useEffect(() => {
    const queries = [matchMedia(PHONE), matchMedia(TABLET)];
    const update = () => setValue(read());
    queries.forEach((q) => q.addEventListener('change', update));
    return () => queries.forEach((q) => q.removeEventListener('change', update));
  }, []);
  return value;
}
const THEME_KEY = 'suite-theme';
export const initials = (value: string) =>
  value
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('');
export function OperationsApp() {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  });
  const breakpoint = useBreakpoint();
  const [moreOpen, setMoreOpen] = useState(false);
  const [mobileSearch, setMobileSearch] = useState(false);
  const changeTheme = (next: Theme) => {
    setTheme(next);
    if (next === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, next);
  };
  const themeAttr = theme === 'system' ? undefined : theme;
  const [example, setExample] = useState(
    new URLSearchParams(location.search).get('examples') === '1',
  );
  const [viewAs, setViewAs] = useState('owner');
  const [user, setUser] = useState<User | null>(null);
  const [entries, setEntries] = useState<WorkspaceEntry[]>([]);
  const [entry, setEntry] = useState<WorkspaceEntry | null>(null);
  const [data, setData] = useState<SuiteData>(emptyData);
  // Several commands in one flow (import batches) must not compare against a stale render.
  const revisionRef = useRef(0);
  revisionRef.current = data.revision;
  const [page, setPage] = useState('overview');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<FormSpec | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending[]>([]);
  const pendingRef = useRef<Pending[]>([]);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [vault, setVault] = useState<OfflineVault | null>(null);
  const [lastDownloaded, setLastDownloaded] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [offlineUnlock, setOfflineUnlock] = useState(false);
  const invitation = useRef(
    location.hash.startsWith('#activate=') ? decodeURIComponent(location.hash.slice(10)) : '',
  );
  const activeId = useRef('');
  const userRef = useRef<User | null>(null);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);
  useEffect(() => {
    userRef.current = user;
  }, [user]);
  const notify = (s: string) => {
    setNotice(s);
  };
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(''), 6000);
    return () => clearTimeout(id);
  }, [notice]);
  const showForm = (s: FormSpec) => {
    setFormKey((v) => v + 1);
    setForm(s);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const go = (next: string) => {
    setPage(next);
    setSearch('');
    setForm(null);
    setMoreOpen(false);
    setMobileSearch(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  async function persist(confirmed: SuiteData, queue: Pending[], selected = entry) {
    if (vault && user && selected)
      await vault.save({
        user,
        entry: selected,
        confirmed,
        pending: queue,
        downloadedAt: lastDownloaded || new Date().toISOString(),
      });
  }
  async function choose(selected: WorkspaceEntry, isExample = example) {
    if (pendingRef.current.length && activeId.current !== selected.workspace.id) {
      setError('Synchronize or export pending work before changing workspaces.');
      return;
    }
    activeId.current = selected.workspace.id;
    setLoading(true);
    setError('');
    setForm(null);
    setSearch('');
    setPage('overview');
    try {
      const result = isExample
        ? { data: await samples(), grants: ROLE_GRANTS.owner!, role: 'owner' }
        : await api<{ data: SuiteData; grants: Access[]; role: string }>(
            `/workspaces/${selected.workspace.id}`,
          );
      if (activeId.current !== selected.workspace.id) return;
      const current = {
        workspace: result.data.workspaces.find((w) => w.id === selected.workspace.id)!,
        grants: result.grants,
        role: result.role,
      };
      setData(result.data);
      setEntry(current);
      setLastDownloaded(new Date().toISOString());
      localStorage.setItem('suite-workspace-id', selected.workspace.id);
      setOffline(false);
      if (vault && user)
        await vault.save({
          user,
          entry: current,
          confirmed: result.data,
          pending: [],
          downloadedAt: new Date().toISOString(),
        });
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof RequestError && e.status === 0) setOffline(true);
    } finally {
      setLoading(false);
    }
  }
  async function reload(isExample = example) {
    setError('');
    if (isExample) {
      const d = await samples();
      const list = sampleEntries(d);
      setEntries(list);
      setData(d);
      const chosen =
        list.find((e) => e.workspace.id === activeId.current) ??
        list.find((e) => e.workspace.id === localStorage.getItem('suite-workspace-id')) ??
        list[0];
      if (chosen) {
        setEntry(chosen);
        activeId.current = chosen.workspace.id;
      }
      setLoading(false);
      return;
    }
    const result = await api<{ user: User; workspaces: WorkspaceEntry[] }>('/workspaces');
    setUser(result.user);
    userRef.current = result.user;
    setEntries(result.workspaces);
    const chosen =
      result.workspaces.find((e) => e.workspace.id === activeId.current) ??
      result.workspaces.find(
        (e) => e.workspace.id === localStorage.getItem('suite-workspace-id'),
      ) ??
      result.workspaces[0];
    if (chosen) await choose(chosen, false);
    else {
      setEntry(null);
      setLoading(false);
    }
  }
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        if (example) await reload(true);
        else {
          if (localStorage.getItem('suite-device-locked')) return;
          const result = await api<{ user: User }>('/auth/me');
          if (!mounted) return;
          setUser(result.user);
          userRef.current = result.user;
          await reload(false);
        }
      } catch (e) {
        if (!(e instanceof RequestError && e.status === 401)) setError((e as Error).message);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [example]);
  useEffect(() => {
    const online = () => setOffline(false),
      offlineEvent = () => setOffline(true);
    window.addEventListener('online', online);
    window.addEventListener('offline', offlineEvent);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offlineEvent);
    };
  }, []);
  // Example mode has no server, so the browser runs due waits and timers itself.
  useEffect(() => {
    if (!example || loading) return;
    const tick = () =>
      void sampleTick()
        .then((next) => setData((current) => (next.revision === current.revision ? current : next)))
        .catch(() => undefined);
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [example, loading]);
  useEffect(() => {
    if (example || !user || !entry) return;
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible' || pendingRef.current.length || form || busy)
        return;
      const wsId = activeId.current;
      void api<{ data: SuiteData; grants: Access[]; role: string }>(`/workspaces/${wsId}`)
        .then(async (r) => {
          if (
            activeId.current !== wsId ||
            pendingRef.current.length ||
            userRef.current?.id !== user.id
          )
            return;
          setData(r.data);
          setEntry({
            workspace: r.data.workspaces[0]!,
            grants: r.grants,
            role: r.role,
          });
          setLastDownloaded(new Date().toISOString());
          setOffline(false);
          await persist(r.data, []);
        })
        .catch((e) => {
          if (e instanceof RequestError && [401, 403].includes(e.status)) {
            setData(emptyData());
            setEntry(null);
            setError(
              'Access changed. Sign in again or contact the owner. Encrypted pending work is preserved.',
            );
          }
        });
    }, 20000);
    return () => clearInterval(id);
  }, [example, user?.id, entry?.workspace.id, form, busy, vault]);
  async function sync() {
    if (!entry || example) {
      await reload(example);
      return;
    }
    setBusy(true);
    setError('');
    let remaining = [...pendingRef.current];
    let latest = data;
    try {
      for (const item of [...remaining]) {
        if (item.state !== 'queued') break;
        try {
          const result = await api<{
            data: SuiteData;
            grants: Access[];
            role: string;
          }>(`/workspaces/${entry.workspace.id}/commands`, item.command);
          latest = result.data;
          remaining = remaining.filter((q) => q.command.id !== item.command.id);
          await persist(latest, remaining);
          pendingRef.current = remaining;
          setPending(remaining);
          setData(latest);
        } catch (e) {
          if (e instanceof RequestError && e.status >= 400 && e.status < 500) {
            item.state = e.status === 409 ? 'conflict' : 'rejected';
            item.error = e.message;
            remaining = remaining.map((q) => (q.command.id === item.command.id ? item : q));
            await persist(latest, remaining);
            pendingRef.current = remaining;
            setPending(remaining);
            if ([401, 403].includes(e.status)) setData(emptyData());
          }
          throw e;
        }
      }
      if (!remaining.length) {
        const result = await api<{
          data: SuiteData;
          grants: Access[];
          role: string;
        }>(`/workspaces/${entry.workspace.id}`);
        await persist(result.data, []);
        setData(result.data);
        setEntry({
          workspace: result.data.workspaces[0]!,
          grants: result.grants,
          role: result.role,
        });
        setLastDownloaded(new Date().toISOString());
        setOffline(false);
        notify('Workspace is up to date.');
      }
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof RequestError && e.status === 0) setOffline(true);
    } finally {
      setBusy(false);
    }
  }
  async function run(
    type: string,
    payload: Record<string, unknown>,
    key: string = crypto.randomUUID(),
  ) {
    if (!entry) throw new Error('Choose a workspace first.');
    const command: Command = {
      id: key,
      workspaceId: entry.workspace.id,
      type,
      payload,
      // The server checks claims against the task itself, so unrelated edits never block one.
      expectedRevision: ['task.claim', 'task.unclaim'].includes(type)
        ? undefined
        : revisionRef.current + pendingRef.current.length,
    };
    if (example) {
      authorizeCommand(data, command, exampleActor);
      const result = await sampleCommand(command);
      revisionRef.current = result.revision;
      setData(result);
      setEntries(sampleEntries(result));
      const ws = result.workspaces.find((w) => w.id === entry.workspace.id)!;
      setEntry({ ...entry, workspace: ws });
      notify('Saved in this browser’s example workspace.');
      return;
    }
    if (pendingRef.current.length && !vault)
      throw new Error('Unlock offline storage before adding pending work.');
    const stage = async () => {
      if (pendingRef.current.some((p) => p.state !== 'queued'))
        throw new Error('Resolve the rejected pending change before capturing more work.');
      if (!vault || !OFFLINE_COMMANDS.has(type))
        throw new Error(
          'This action requires the shared server. Your draft is preserved. Offline capture must be enabled before disconnecting.',
        );
      // Validate against a projected copy without changing confirmed financial records.
      let projected = data;
      for (const item of pendingRef.current)
        if (item.state === 'queued')
          projected = executeCommand(projected, {
            ...item.command,
            expectedRevision: undefined,
          });
      executeCommand(projected, { ...command, expectedRevision: undefined });
      const next = [...pendingRef.current, { command, state: 'queued' as const }];
      await persist(data, next);
      pendingRef.current = next;
      setPending(next);
      notify('Saved on this device. Awaiting server acceptance; not approved or paid.');
    };
    if (pendingRef.current.length || offline) {
      await stage();
      return;
    }
    try {
      const result = await api<{
        data: SuiteData;
        grants: Access[];
        role: string;
      }>(`/workspaces/${entry.workspace.id}/commands`, command);
      // If local persistence fails after a server success, preserve the command for idempotent retry.
      try {
        await persist(result.data, []);
      } catch {
        if (vault) {
          await stage();
          return;
        }
      }
      revisionRef.current = result.data.revision;
      setData(result.data);
      setEntry({
        workspace: result.data.workspaces[0]!,
        grants: result.grants,
        role: result.role,
      });
      setEntries((v) =>
        v.map((e) =>
          e.workspace.id === entry.workspace.id
            ? { ...e, workspace: result.data.workspaces[0]! }
            : e,
        ),
      );
      notify('Saved to the shared workspace.');
    } catch (e) {
      if (e instanceof RequestError && e.status === 0 && vault && OFFLINE_COMMANDS.has(type)) {
        setOffline(true);
        await stage();
      } else throw e;
    }
  }
  async function signIn(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (offlineUnlock) {
        const next = new OfflineVault(email);
        const doc = await next.unlock(password);
        if (!doc) throw new Error('No offline workspace is saved for this email on this device.');
        setVault(next);
        setUser(doc.user);
        userRef.current = doc.user;
        setEntry(doc.entry);
        setEntries([doc.entry]);
        setData(doc.confirmed);
        setPending(doc.pending);
        pendingRef.current = doc.pending;
        setLastDownloaded(doc.downloadedAt);
        activeId.current = doc.entry.workspace.id;
        setOffline(true);
      } else {
        const result = await api<{ user: User }>(
          invitation.current && name ? '/auth/activate' : '/auth/login',
          invitation.current && name
            ? { token: invitation.current, name, password }
            : { email, password },
        );
        setUser(result.user);
        userRef.current = result.user;
        if (invitation.current && !name)
          await api('/invitations/accept', { token: invitation.current });
        if (invitation.current) {
          invitation.current = '';
          history.replaceState(null, '', location.pathname);
        }
        await reload(false);
      }
      localStorage.removeItem('suite-device-locked');
      setPassword('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    setBusy(true);
    try {
      if (!example && !offline) await api('/auth/logout', {});
      localStorage.setItem('suite-device-locked', 'true');
      vault?.lock();
      setVault(null);
      setData(emptyData());
      setEntry(null);
      setEntries([]);
      setUser(null);
      userRef.current = null;
      setPending([]);
      pendingRef.current = [];
      activeId.current = '';
      setPassword('');
      setOfflineUnlock(false);
      if (example) {
        history.replaceState(null, '', location.pathname);
        setExample(false);
      }
      notify('Signed out. Device data is locked.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function enableOffline() {
    if (!user || !entry) return;
    showForm({
      title: 'Protect offline access on this device',
      description:
        'Choose a separate passphrase of at least 12 characters. It encrypts this workspace’s downloaded records and pending work. It is not your account password, is never sent to the server, and cannot be recovered for you.',
      fields: [
        {
          name: 'passphrase',
          label: 'Device passphrase',
          type: 'password',
          required: true,
        },
      ],
      submit: async (values) => {
        if (!('serviceWorker' in navigator))
          throw new Error(
            'Offline reopening requires a supported browser over HTTPS or localhost.',
          );
        await Promise.race([
          navigator.serviceWorker.ready,
          new Promise((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(
                    'The offline app is still downloading. Keep this page online and retry.',
                  ),
                ),
              10000,
            ),
          ),
        ]);
        const next = new OfflineVault(user.email);
        const saved = await next.unlock(String(values.passphrase));
        if (saved?.pending.length && saved.entry.workspace.id !== entry.workspace.id)
          throw new Error(
            'Another workspace has unsynced work in this vault. Sign out and unlock that offline workspace to synchronize it first.',
          );
        if (saved?.pending.length) {
          setData(saved.confirmed);
          setPending(saved.pending);
          pendingRef.current = saved.pending;
          setEntry(saved.entry);
        } else
          await next.save({
            user,
            entry,
            confirmed: data,
            pending: [],
            downloadedAt: new Date().toISOString(),
          });
        setVault(next);
        notify('Encrypted offline storage is ready on this device.');
      },
    });
  }
  function newWorkspace() {
    showForm({
      title: 'Create a workspace',
      description: example
        ? 'This creates an empty example workspace on this browser. Sign in for shared accounts.'
        : 'Each workspace has its own records, settings and members. Start empty with the template that fits.',
      fields: [
        { name: 'name', label: 'Workspace name', required: true },
        {
          name: 'preset',
          label: 'Template',
          type: 'select',
          options: Object.entries(PRESETS).map(([value, p]) => ({
            value,
            label: p.name,
          })),
        },
        {
          name: 'currency',
          label: 'Currency',
          type: 'select',
          options: ['MXN', 'USD', 'EUR'].map((value) => ({
            value,
            label: value,
          })),
        },
      ],
      submit: async (values, key) => {
        if (pendingRef.current.length)
          throw new Error('Synchronize pending work before creating another workspace.');
        if (example) {
          const next = await sampleCommand({
            id: key,
            workspaceId: key,
            type: 'workspace.create',
            payload: values,
          });
          setData(next);
          setEntries(sampleEntries(next));
          const selected = sampleEntries(next).find((e) => e.workspace.id === key)!;
          activeId.current = key;
          setEntry(selected);
        } else {
          const result = await api<{ workspace: WorkspaceEntry['workspace'] }>('/workspaces', {
            ...values,
            id: key,
          });
          activeId.current = result.workspace.id;
          await reload(false);
        }
      },
    });
  }
  const ws = entry?.workspace;
  const exampleActor: Actor = { grants: ROLE_GRANTS[viewAs]!, email: VIEW_AS[viewAs]!.email };
  // In example mode `data` holds every sample workspace; other roles see the server projection.
  const shown = useMemo(
    () =>
      example && viewAs !== 'owner' && ws
        ? projectForActor(workspaceData(data, ws), {
            grants: ROLE_GRANTS[viewAs]!,
            email: VIEW_AS[viewAs]!.email,
          })
        : data,
    [example, viewAs, data, ws],
  );
  if (!example && !user)
    return (
      <div className="operations op-auth" data-theme={themeAttr}>
        <aside>
          <div className="op-wordmark">
            <span className="op-mark">
              <Icon name="suite" size={16} />
            </span>
            Business Suite
          </div>
          <div>
            <h1>Shared workspaces for work, people and money.</h1>
            <p>
              Each workspace keeps its own records, members and settings. Your role decides what you
              can see and change on every device.
            </p>
          </div>
          <div className="op-auth-scenarios">
            <span>Insignia · signage sales and installation</span>
            <span>Household · shared expenses and chores</span>
            <span>Referrals · candidates and follow-ups</span>
          </div>
        </aside>
        <main>
          <div className="op-auth-form">
            <h2>
              {offlineUnlock
                ? 'Unlock offline workspace'
                : invitation.current
                  ? 'Activate your invitation'
                  : 'Sign in'}
            </h2>
            <p>
              {offlineUnlock
                ? 'Use the email and device passphrase you set up on this device.'
                : invitation.current
                  ? 'Choose a password for a new account, or sign in with an existing account to accept this invitation.'
                  : 'Use the account the workspace owner invited.'}
            </p>
            {loading ? (
              <div className="op-skeleton" aria-label="Checking session" />
            ) : (
              <form onSubmit={signIn}>
                {invitation.current && !offlineUnlock && (
                  <label>
                    Name · new accounts only
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoComplete="name"
                    />
                  </label>
                )}
                <label>
                  Email
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required={!invitation.current || !name}
                    autoComplete="username"
                  />
                </label>
                <label>
                  {offlineUnlock ? 'Device passphrase' : 'Password'}
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={(invitation.current && name) || offlineUnlock ? 12 : undefined}
                    autoComplete={invitation.current && name ? 'new-password' : 'current-password'}
                  />
                </label>
                {error && (
                  <p className="op-error" role="alert">
                    {error}
                  </p>
                )}
                <Button type="submit" disabled={busy}>
                  {busy
                    ? 'Please wait…'
                    : offlineUnlock
                      ? 'Unlock this device'
                      : invitation.current && name
                        ? 'Create account & accept'
                        : 'Sign in'}
                </Button>
              </form>
            )}
            <div className="op-auth-links">
              <button
                onClick={() => {
                  setOfflineUnlock(!offlineUnlock);
                  setError('');
                }}
              >
                {offlineUnlock ? 'Back to account sign-in' : 'Use saved offline workspace'}
              </button>
              <button
                onClick={() => {
                  setError('');
                  setExample(true);
                }}
              >
                Explore example workspaces
              </button>
            </div>
            <small>
              New accounts are invitation-only. Ask the workspace owner for an activation link.
            </small>
          </div>
        </main>
      </div>
    );
  const grants = example ? ROLE_GRANTS[viewAs]! : (entry?.grants ?? []);
  const actor: Actor = example ? exampleActor : { grants, email: user?.email ?? '' };
  const nav = [
    'overview',
    // Second, so phones keep it in the bottom bar.
    ...(ws?.modules.includes('chores') && grants.includes('chores.read') ? ['mywork'] : []),
    ...(grants.includes('contacts.read') ? ['contacts'] : []),
    ...(grants.includes('contacts.read') && ws?.preset !== 'household' ? ['companies'] : []),
    ...(['crm', 'work', 'money', 'chores', 'referrals'] as Module[]).filter(
      (m) =>
        ws?.modules.includes(m) &&
        (grants.includes((m + '.read') as Access) ||
          (m === 'work' && grants.includes('work.read.assigned'))),
    ),
    ...(grants.includes('automations.manage') && ws?.preset !== 'household' ? ['automations'] : []),
    'sync',
    ...(grants.includes('workspace.manage') ? ['activity'] : []),
    'settings',
  ];
  const permittedPage = nav.includes(page) ? page : 'overview';
  const props: PageProps | null = ws
    ? { data: shown, ws, grants, actor, search, run, form: showForm, notify, go }
    : null;
  const content = props
    ? (
        {
          overview: <Overview {...props} />,
          contacts: <Contacts {...props} />,
          companies: <Companies {...props} />,
          crm: <CRM {...props} />,
          work: <Work {...props} />,
          money: <Money {...props} />,
          chores: <Tasks {...props} />,
          mywork: <MyWork {...props} />,
          referrals: <Referrals {...props} />,
          activity: <Activity {...props} />,
          automations: (
            <Automations
              {...props}
              example={example}
              fastForward={async (until) => {
                setData(await sampleTick(until));
                notify('Example time moved forward to the next wait.');
              }}
            />
          ),
          settings: (
            <Settings
              key={ws!.id}
              {...props}
              example={example}
              reload={() => reload(example)}
              enableOffline={enableOffline}
              offlineReady={!!vault}
              theme={theme}
              setTheme={changeTheme}
            />
          ),
          sync: (
            <>
              <PageTitle
                title="Device sync"
                description="Changes saved on this device wait here until the server accepts them. A local save is not an approval or a payment."
                action={
                  <Button icon="sync" onClick={() => void sync()} disabled={busy}>
                    {busy ? 'Synchronizing…' : 'Synchronize now'}
                  </Button>
                }
              />
              <Panel title={`${pending.length} pending changes`}>
                <p className="op-caption">
                  Last downloaded:{' '}
                  {lastDownloaded ? new Date(lastDownloaded).toLocaleString() : 'Not downloaded'}.{' '}
                  {vault
                    ? 'Your offline copy is encrypted on this device.'
                    : 'Enable protected offline storage in Settings before disconnecting.'}
                </p>
                {pending.length ? (
                  <div className="op-list">
                    {pending.map((item) => (
                      <div key={item.command.id}>
                        <span>
                          <strong>{item.command.type.replaceAll('.', ' ')}</strong>
                          <small>
                            {String(
                              item.command.payload.description ??
                                item.command.payload.title ??
                                item.command.payload.name ??
                                item.command.payload.role ??
                                '',
                            )}
                          </small>
                          {item.error && <small className="op-error-text">{item.error}</small>}
                        </span>
                        <Badge
                          tone={
                            item.state === 'queued'
                              ? 'attention'
                              : item.state === 'conflict'
                                ? 'danger'
                                : 'danger'
                          }
                        >
                          {item.state}
                        </Badge>
                        {item.state !== 'queued' && (
                          <button
                            className="op-text-button"
                            onClick={() =>
                              showForm({
                                title: 'Discard rejected local attempt',
                                description:
                                  'This removes only an attempt the server definitively rejected. Queued requests cannot be discarded because their delivery is uncertain. Export pending work first if you need to keep the original draft.',
                                fields: [],
                                submitLabel: 'Discard rejected attempt',
                                submit: async () => {
                                  const next = pendingRef.current.filter(
                                    (q) => q.command.id !== item.command.id,
                                  );
                                  await persist(data, next);
                                  pendingRef.current = next;
                                  setPending(next);
                                },
                              })
                            }
                          >
                            Discard attempt
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty title="No pending changes">
                    Everything on this device matches the last download from the server.
                  </Empty>
                )}
                {pending.length > 0 && (
                  <Button
                    secondary
                    icon="download"
                    onClick={() =>
                      download(
                        'business-suite-pending-work.json',
                        JSON.stringify(
                          { user: user?.email, workspace: ws!.name, pending },
                          null,
                          2,
                        ),
                        'application/json',
                      )
                    }
                  >
                    Export pending work
                  </Button>
                )}
              </Panel>
            </>
          ),
        } as Record<string, React.ReactNode>
      )[permittedPage]
    : null;
  const navLabel = (n: string) =>
    n === 'chores' && ws?.preset === 'household'
      ? 'Chores'
      : n === 'work' && ws
        ? PRESETS[ws.preset].workLabel
        : PAGE_NAMES[n];
  const primaryNav = nav.filter((n) => !['sync', 'activity', 'settings'].includes(n)).slice(0, 4);
  const moreNav = nav.filter((n) => !primaryNav.includes(n));
  const syncLabel = example
    ? 'Example data'
    : offline
      ? 'Offline'
      : pending.length
        ? `${pending.length} pending`
        : 'Up to date';
  const workspaceSwitch = (
    <label className="op-workspace-switch">
      <span className="sr-only">Workspace</span>
      <select
        value={ws?.id ?? ''}
        aria-label="Choose workspace"
        onChange={(e) => {
          const selected = entries.find((x) => x.workspace.id === e.target.value);
          if (selected) void choose(selected);
        }}
      >
        {!ws && <option value="">Choose workspace</option>}
        {entries.map((e) => (
          <option key={e.workspace.id} value={e.workspace.id}>
            {e.workspace.name}
          </option>
        ))}
      </select>
    </label>
  );
  const accountName = example
    ? `Example ${VIEW_AS[viewAs]!.label.toLowerCase()}`
    : user?.name || user?.email || 'Signed in';
  const accountDetail = example ? 'Fictional records only' : (entry?.role ?? user?.email ?? '');
  return (
    <div className="operations" data-theme={themeAttr}>
      <a className="op-skip" href="#op-main">
        Skip to content
      </a>
      {example && (
        <div className="op-example-bar">
          <span>
            <strong>Example workspaces.</strong> Fictional records saved only in this browser.
          </span>
          <label className="op-view-as">
            <span>View as</span>
            <select value={viewAs} onChange={(e) => setViewAs(e.target.value)}>
              {Object.entries(VIEW_AS).map(([role, v]) => (
                <option key={role} value={role}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          <button onClick={() => void signOut()}>
            Sign in for shared workspaces <Icon name="arrow" size={14} />
          </button>
        </div>
      )}
      <div className="op-shell">
        {breakpoint !== 'phone' && (
          <aside className="op-sidebar">
            <div className="op-wordmark">
              <span className="op-mark">
                <Icon name="suite" size={16} />
              </span>
              <span>Business Suite</span>
            </div>
            {workspaceSwitch}
            <nav aria-label="Main navigation">
              {nav.map((n) => (
                <Fragment key={n}>
                  {n === 'sync' && <div className="op-nav-section">Device</div>}
                  <button
                    className={permittedPage === n ? 'active' : ''}
                    onClick={() => go(n)}
                    aria-current={permittedPage === n ? 'page' : undefined}
                  >
                    <Icon name={n} size={18} />
                    <span>{navLabel(n)}</span>
                    {n === 'sync' && pending.length > 0 && (
                      <b className="op-count">{pending.length}</b>
                    )}
                  </button>
                </Fragment>
              ))}
            </nav>
            <button className="op-new-workspace" onClick={newWorkspace}>
              <Icon name="plus" size={18} /> <span>New workspace</span>
            </button>
            <div className="op-sidebar-bottom">
              <div className="op-user">
                <span className="op-avatar" aria-hidden="true">
                  {initials(accountName) || '•'}
                </span>
                <span>
                  <strong>{accountName}</strong>
                  <small>{accountDetail}</small>
                </span>
              </div>
              <button onClick={() => void signOut()} disabled={busy}>
                Sign out and lock device
              </button>
            </div>
          </aside>
        )}
        <div className="op-workarea">
          {breakpoint !== 'phone' && (
            <header className="op-topbar">
              <div>
                <span>{ws ? PRESETS[ws.preset].name : 'Your workspaces'}</span>
                <strong>{navLabel(permittedPage)}</strong>
              </div>
              {breakpoint === 'tablet' && workspaceSwitch}
              <Search value={search} set={setSearch} />
              <button
                className="op-sync-status"
                onClick={() => go('sync')}
                title="Open device sync"
              >
                <span className={offline ? 'offline' : pending.length ? 'pending' : ''} />
                {syncLabel}
              </button>
              <button
                className="op-icon-button"
                aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
                title="Theme"
                onClick={() =>
                  changeTheme(
                    theme === 'dark' ||
                      (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
                      ? 'light'
                      : 'dark',
                  )
                }
              >
                <Icon
                  name={
                    theme === 'dark' ||
                    (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
                      ? 'sun'
                      : 'moon'
                  }
                  size={18}
                />
              </button>
            </header>
          )}
          {breakpoint === 'phone' && (
            <header className="op-mobile-bar">
              {workspaceSwitch}
              <button
                className="op-icon-button"
                aria-label={mobileSearch ? 'Hide search' : 'Search'}
                aria-pressed={mobileSearch}
                onClick={() => setMobileSearch((v) => !v)}
              >
                <Icon name="search" size={20} />
              </button>
              <button
                className="op-sync-status"
                onClick={() => go('sync')}
                aria-label={`Sync status: ${syncLabel}`}
              >
                <span className={offline ? 'offline' : pending.length ? 'pending' : ''} />
                {syncLabel}
              </button>
            </header>
          )}
          {breakpoint === 'phone' && mobileSearch && (
            <div className="op-mobile-search">
              <Search value={search} set={setSearch} />
            </div>
          )}
          <main id="op-main">
            {error && (
              <div className="op-error" role="alert">
                {error}
                <button className="op-text-button" onClick={() => setError('')}>
                  Dismiss
                </button>
              </div>
            )}
            {pending.length > 0 && (
              <div className="op-pending-notice">
                <Icon name="sync" size={16} />
                <span>
                  {pending.length} {pending.length === 1 ? 'change' : 'changes'} saved on this
                  device, not yet accepted by the server. Totals below use confirmed records only.
                </span>
                <button onClick={() => go('sync')}>Review</button>
              </div>
            )}
            {form && <Editor key={formKey} spec={form} close={() => setForm(null)} />}
            {loading ? (
              <div className="op-loading" aria-label="Loading workspace">
                <div className="op-skeleton" />
                <div className="op-skeleton" />
                <div className="op-skeleton" />
              </div>
            ) : !entry ? (
              <Empty
                title="Create your first shared workspace"
                action={
                  <Button icon="plus" onClick={newWorkspace}>
                    Create workspace
                  </Button>
                }
              >
                Start from the Insignia, household or referrals template. You can add more templates
                and invite members afterwards.
              </Empty>
            ) : (
              content
            )}
          </main>
          {notice && (
            <div className="op-notice" role="status">
              <Icon name="check" size={18} />
              <span>{notice}</span>
              <button aria-label="Dismiss notification" onClick={() => setNotice('')}>
                <Icon name="close" size={16} />
              </button>
            </div>
          )}
          {breakpoint !== 'phone' && (
            <footer className="op-footer">
              <span>Business Suite · {ws?.currency ?? 'Your workspace'}</span>
              <span>
                {example
                  ? 'Sample data · isolated from shared accounts'
                  : 'Changes are checked by the server · Email drafts are not sent'}
              </span>
            </footer>
          )}
          {breakpoint === 'phone' && (
            <nav className="op-bottom-nav" aria-label="Main navigation">
              {primaryNav.map((n) => (
                <button
                  key={n}
                  className={permittedPage === n && !moreOpen ? 'active' : ''}
                  onClick={() => go(n)}
                  aria-current={permittedPage === n ? 'page' : undefined}
                >
                  <Icon name={n} size={22} />
                  <span>{navLabel(n)}</span>
                </button>
              ))}
              <button
                className={moreOpen || moreNav.includes(permittedPage) ? 'active' : ''}
                onClick={() => setMoreOpen((v) => !v)}
                aria-expanded={moreOpen}
              >
                <Icon name="more" size={22} />
                <span>More</span>
                {pending.length > 0 && <b className="op-count">{pending.length}</b>}
              </button>
            </nav>
          )}
          {breakpoint === 'phone' && moreOpen && (
            <div
              className="op-more-sheet"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setMoreOpen(false);
              }}
            >
              <div role="dialog" aria-label="More">
                {moreNav.map((n) => (
                  <button
                    key={n}
                    className={permittedPage === n ? 'active' : ''}
                    onClick={() => go(n)}
                  >
                    <Icon name={n} size={20} />
                    <span>{navLabel(n)}</span>
                    {n === 'sync' && pending.length > 0 && (
                      <b className="op-count">{pending.length}</b>
                    )}
                  </button>
                ))}
                <hr />
                <button
                  onClick={() => {
                    setMoreOpen(false);
                    newWorkspace();
                  }}
                >
                  <Icon name="plus" size={20} />
                  <span>New workspace</span>
                </button>
                <hr />
                <div className="op-user">
                  <span className="op-avatar" aria-hidden="true">
                    {initials(accountName) || '•'}
                  </span>
                  <span>
                    <strong>{accountName}</strong>
                    <small>{accountDetail}</small>
                  </span>
                </div>
                <button onClick={() => void signOut()} disabled={busy}>
                  <Icon name="logout" size={20} />
                  <span>Sign out and lock device</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
