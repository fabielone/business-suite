import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as Network from 'expo-network';
import {
  emptyState,
  messageOf,
  statusOf,
  type Job,
  type LocalState,
  type PendingCommand,
} from '@suite/offline';
import { createClient, demoRequested, simulatorDemoAllowed, type DemoRole } from './client';
import { formatMoney, parsePesos } from './money';
import { ThemeContext, dark, light, makeStyles, useTheme } from './theme';

type Tab = 'work' | 'money' | 'sync';
type Notice = { text: string; kind: 'info' | 'error' | 'success' } | null;

function Button({
  children,
  onPress,
  disabled = false,
  secondary = false,
  destructive = false,
  testID,
  label,
}: {
  children: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  destructive?: boolean;
  testID?: string;
  label?: string;
}) {
  const { s } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        secondary && s.secondaryButton,
        destructive && s.destructiveButton,
        disabled && s.disabled,
        pressed && s.pressed,
      ]}
    >
      <Text
        style={[s.buttonText, secondary && s.secondaryButtonText, destructive && s.destructiveText]}
      >
        {children}
      </Text>
    </Pressable>
  );
}

function Card({ children }: { children: ReactNode }) {
  const { s } = useTheme();
  return <View style={s.card}>{children}</View>;
}
function Label({ children }: { children: ReactNode }) {
  const { s } = useTheme();
  return <Text style={s.label}>{children}</Text>;
}
type StampTone = 'neutral' | 'good' | 'warning' | 'danger';
function Stamp({
  children,
  tone = 'neutral',
  warning = false,
}: {
  children: ReactNode;
  tone?: StampTone;
  warning?: boolean;
}) {
  const { s, c } = useTheme();
  const kind: StampTone = warning ? 'warning' : tone;
  const box =
    kind === 'good'
      ? s.stampGood
      : kind === 'warning'
        ? s.stampWarning
        : kind === 'danger'
          ? s.stampDanger
          : undefined;
  const text =
    kind === 'good'
      ? s.stampGoodText
      : kind === 'warning'
        ? s.stampWarningText
        : kind === 'danger'
          ? s.stampDangerText
          : undefined;
  const dot =
    kind === 'good'
      ? c.success
      : kind === 'warning'
        ? c.warning
        : kind === 'danger'
          ? c.danger
          : c.text3;
  return (
    <View style={[s.stamp, box]}>
      <View style={[s.stampDot, { backgroundColor: dot }]} />
      <Text style={[s.stampText, text]}>{children}</Text>
    </View>
  );
}
function Note({ notice }: { notice: Notice }) {
  const { s } = useTheme();
  return notice ? (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[s.notice, notice.kind === 'error' && s.errorNotice]}
    >
      <View
        style={[
          s.noticeBar,
          notice.kind === 'error' ? s.errorBar : notice.kind === 'info' ? s.infoBar : undefined,
        ]}
      />
      <Text style={s.noticeText}>{notice.text}</Text>
    </View>
  ) : null;
}
function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : 'Not yet';
}
function statusLabel(value: string) {
  return value === 'in_progress'
    ? 'In progress'
    : value === 'submitted'
      ? 'Awaiting review'
      : value.charAt(0).toUpperCase() + value.slice(1);
}
function expenseTone(status: string): StampTone {
  return status === 'approved'
    ? 'good'
    : status === 'rejected'
      ? 'danger'
      : status === 'submitted'
        ? 'warning'
        : 'neutral';
}

export default function App() {
  const [role, setRole] = useState<DemoRole>('worker');
  const scheme: 'light' | 'dark' = useColorScheme() === 'dark' ? 'dark' : 'light';
  const theme = useMemo(() => {
    const c = scheme === 'dark' ? dark : light;
    return { c, s: makeStyles(c), scheme };
  }, [scheme]);
  return (
    <ThemeContext.Provider value={theme}>
      <SafeAreaProvider>
        <SafeAreaView style={theme.s.safe} edges={['top', 'left', 'right', 'bottom']}>
          <StatusBar barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'} />
          {simulatorDemoAllowed ? (
            <DemoApp key={role} role={role} onRoleChange={setRole} />
          ) : (
            <SetupScreen />
          )}
        </SafeAreaView>
      </SafeAreaProvider>
    </ThemeContext.Provider>
  );
}

function SetupScreen() {
  const { s } = useTheme();
  return (
    <ScrollView contentContainerStyle={s.setup}>
      <View style={s.brandRow}>
        <View style={s.brandMark}>
          <Text style={s.brandMarkText}>B</Text>
        </View>
        <Text style={s.brandName}>Business Suite</Text>
      </View>
      <Text style={s.setupTitle}>Setup required</Text>
      <Text style={s.body}>
        {demoRequested
          ? 'The fictional demo only runs in an iOS simulator or Android emulator on your computer.'
          : 'This app needs a configured business service and sign-in before it can connect.'}
      </Text>
      <Card>
        <Text style={s.cardTitle}>Nothing is loaded</Text>
        <Text style={s.body}>
          Secure sign-in and a configured business service are not available in this preview. No
          business records are stored on this device.
        </Text>
      </Card>
      <Text style={s.caption}>
        The simulator demo is enabled explicitly by the development command. Physical devices and
        LAN demo access are disabled.
      </Text>
    </ScrollView>
  );
}

function DemoApp({
  role,
  onRoleChange,
}: {
  role: DemoRole;
  onRoleChange: (role: DemoRole) => void;
}) {
  const { s, c } = useTheme();
  const client = useMemo(() => createClient(role), [role]);
  const [state, setState] = useState<LocalState>(emptyState);
  const [tab, setTab] = useState<Tab>('work');
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [connection, setConnection] = useState<
    'checking' | 'connected' | 'unavailable' | 'blocked'
  >('checking');
  const mounted = useRef(true);
  const syncRunning = useRef(false);
  const savingRef = useRef(false);

  const readLatest = useCallback(async () => {
    const next = await client.read();
    if (mounted.current) setState(next);
    return next;
  }, [client]);

  const sync = useCallback(async () => {
    if (syncRunning.current) return;
    syncRunning.current = true;
    if (mounted.current) setSyncing(true);
    try {
      const next = await client.sync();
      if (mounted.current) {
        setState(next);
        setConnection('connected');
        setNotice(
          next.commands.some((c) => c.status !== 'queued')
            ? { kind: 'info', text: 'Some saved entries need attention. Open Sync to review them.' }
            : null,
        );
      }
    } catch (error) {
      if (mounted.current) {
        setConnection([401, 403].includes(statusOf(error)) ? 'blocked' : 'unavailable');
        setNotice({ kind: 'error', text: messageOf(error) });
      }
      try {
        await readLatest();
      } catch (localError) {
        if (mounted.current) {
          setState(emptyState());
          setNotice({ kind: 'error', text: messageOf(localError) });
        }
      }
    } finally {
      syncRunning.current = false;
      if (mounted.current) {
        setSyncing(false);
        setLoaded(true);
      }
    }
  }, [client, readLatest]);

  useEffect(() => {
    mounted.current = true;
    void (async () => {
      try {
        await readLatest();
      } catch (error) {
        if (mounted.current) setNotice({ kind: 'error', text: messageOf(error) });
      }
      if (mounted.current) {
        setLoaded(true);
        void sync();
      }
    })();
    const foreground = AppState.addEventListener('change', (next) => {
      if (next === 'active') void sync();
    });
    const network = Network.addNetworkStateListener((next) => {
      if (next.isConnected && AppState.currentState === 'active') void sync();
    });
    return () => {
      mounted.current = false;
      foreground.remove();
      network.remove();
    };
  }, [readLatest, sync]);

  const save = async (
    kind: PendingCommand['kind'],
    input: Record<string, unknown>,
  ): Promise<boolean> => {
    if (savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    try {
      await client.enqueue(kind, input);
      // The committed enqueue is the save boundary, even if a later UI read fails.
      try {
        await readLatest();
      } catch (error) {
        if (mounted.current)
          setNotice({
            kind: 'error',
            text: `Saved on this device, but the list could not refresh: ${messageOf(error)}`,
          });
        return true;
      }
      if (mounted.current)
        setNotice({
          kind: 'success',
          text: 'Saved on this device. Server confirmation is pending until sync succeeds.',
        });
      void sync();
      return true;
    } catch (error) {
      if (mounted.current) setNotice({ kind: 'error', text: messageOf(error) });
      return false;
    } finally {
      savingRef.current = false;
      if (mounted.current) setSaving(false);
    }
  };

  const reset = () =>
    Alert.alert(
      'Reset this fictional account?',
      `This removes this account’s cached records and ${state.commands.length} saved entries from this device. Pending entries will not be sent. This cannot be undone.`,
      [
        { text: 'Keep local data', style: 'cancel' },
        {
          text: 'Reset demo data',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                const next = await client.reset();
                if (mounted.current) {
                  setState(next);
                  setNotice(null);
                }
                await sync();
              } catch (error) {
                if (mounted.current) setNotice({ kind: 'error', text: messageOf(error) });
              }
            })();
          },
        },
      ],
    );

  const discard = (command: PendingCommand) =>
    Alert.alert(
      'Remove this issue from the device?',
      'The server did not accept this entry. Removing it does not change any confirmed business record. Review the current records before entering a replacement.',
      [
        { text: 'Keep entry', style: 'cancel' },
        {
          text: 'Remove entry',
          style: 'destructive',
          onPress: () => {
            void client
              .discard(command.id)
              .then((next) => {
                if (mounted.current) setState(next);
              })
              .catch((error) => {
                if (mounted.current) setNotice({ kind: 'error', text: messageOf(error) });
              });
          },
        },
      ],
    );

  const snapshot = state.snapshot;
  const permissions = snapshot?.workspace.permissions ?? [];
  const enabled = (module: string, permission: string) =>
    !state.blockedReason &&
    Boolean(snapshot?.workspace.modules.includes(module)) &&
    permissions.includes(permission);
  const pendingCount = state.commands.filter((command) => command.status === 'queued').length;
  const issueCount = state.commands.length - pendingCount;
  const connectionText = state.blockedReason
    ? 'Access needs attention'
    : syncing
      ? 'Checking server…'
      : connection === 'connected'
        ? 'Server connected'
        : connection === 'checking'
          ? 'Connecting…'
          : 'Server unavailable';

  useEffect(() => {
    if (!pendingCount || state.blockedReason) return;
    const retry = setInterval(() => {
      if (AppState.currentState === 'active') void sync();
    }, 30_000);
    return () => clearInterval(retry);
  }, [pendingCount, state.blockedReason, sync]);

  return (
    <View style={s.app}>
      <View style={s.banner}>
        <Text style={s.bannerText}>
          <Text style={s.bannerStrong}>Fictional demo · simulator only.</Text> Server data is
          temporary; local saves stay on this device.
        </Text>
      </View>
      <View style={s.header}>
        <View style={s.headerTitle}>
          <Text style={s.product}>Business Suite</Text>
          <Text style={s.screenTitle}>
            {tab === 'work' ? 'Work' : tab === 'money' ? 'Money' : 'Device sync'}
          </Text>
        </View>
        <View style={s.segment} accessibilityLabel="Fictional demo identity">
          {(['worker', 'manager'] as DemoRole[]).map((value) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityLabel={`Use fictional ${value}`}
              accessibilityState={{ selected: role === value, disabled: saving || syncing }}
              disabled={saving || syncing}
              onPress={() => onRoleChange(value)}
              testID={`role-${value}`}
              style={[s.segmentButton, role === value && s.segmentSelected]}
            >
              <Text style={[s.segmentText, role === value && s.segmentTextSelected]}>
                {statusLabel(value)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={s.statusBar}>
        <View
          style={[s.dot, connection === 'connected' && !state.blockedReason && s.dotConnected]}
        />
        <Text style={s.statusText}>{connectionText}</Text>
        <Text style={s.queueCount}>
          {pendingCount} pending · {issueCount} {issueCount === 1 ? 'issue' : 'issues'}
        </Text>
      </View>
      <KeyboardAvoidingView
        style={s.content}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <Note notice={notice} />
          {!loaded && (
            <View style={s.loading}>
              <ActivityIndicator color={c.accent} />
              <Text style={s.body}>Opening your local workspace…</Text>
            </View>
          )}
          {loaded && !snapshot && tab !== 'sync' && (
            <Card>
              <Text style={s.cardTitle}>
                {state.blockedReason ? 'Workspace locked' : 'Prepare this device online'}
              </Text>
              <Text style={s.body}>
                {state.blockedReason ??
                  'Connect to the local demo server once to cache the jobs and permissions for this fictional account.'}
              </Text>
              <Button
                onPress={() => void sync()}
                disabled={syncing || Boolean(state.blockedReason)}
                testID="prepare-device"
              >
                {syncing ? 'Connecting…' : 'Connect to demo server'}
              </Button>
              <Button secondary onPress={() => setTab('sync')}>
                Open device sync
              </Button>
            </Card>
          )}
          {snapshot && tab !== 'sync' && (
            <Text style={s.caption}>
              Server-confirmed copy · Updated {formatDate(snapshot.fetchedAt)}
              {connection !== 'connected'
                ? '\nThis copy may be out of date. New actions are saved for checking.'
                : ''}
            </Text>
          )}
          {snapshot && tab === 'work' && (
            <>
              <View style={s.sectionHeading}>
                <Text style={s.sectionTitle}>
                  {role === 'worker' ? 'Your assigned jobs' : 'Business jobs'}
                </Text>
                <Text style={s.caption}>{snapshot.jobs.length} records</Text>
              </View>
              {!enabled('work', 'work.jobs.read') ? (
                <Text style={s.body}>Job access is unavailable for this account.</Text>
              ) : snapshot.jobs.length === 0 ? (
                <Card>
                  <Text style={s.cardTitle}>No jobs here yet</Text>
                  <Text style={s.body}>
                    Jobs appear here after they are created or assigned in the web app and synced.
                  </Text>
                </Card>
              ) : (
                snapshot.jobs.map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    pending={state.commands.find(
                      (command) => command.path === `/jobs/${job.id}/close`,
                    )}
                    canSeePrice={permissions.includes('work.prices.read')}
                    canClose={enabled('work', 'work.jobs.close')}
                    saving={saving}
                    onClose={() => void save('job.close', { jobId: job.id, version: job.version })}
                  />
                ))
              )}
            </>
          )}
          {snapshot && tab === 'money' && (
            <>
              {enabled('money', 'money.expenses.submit') && (
                <ExpenseForm
                  key={snapshot.workspace.user.id}
                  jobs={snapshot.jobs}
                  saving={saving}
                  onSubmit={(input) => save('expense.submit', input)}
                />
              )}
              <View style={s.sectionHeading}>
                <Text style={s.sectionTitle}>Confirmed expenses</Text>
                <Text style={s.caption}>{snapshot.expenses.length} records</Text>
              </View>
              {!enabled('money', 'money.expenses.read') ? (
                <Text style={s.body}>Expense access is unavailable for this account.</Text>
              ) : snapshot.expenses.length === 0 ? (
                <Card>
                  <Text style={s.body}>
                    No confirmed expenses yet. Local submissions appear in Sync until the server
                    accepts them.
                  </Text>
                </Card>
              ) : (
                snapshot.expenses.map((expense) => (
                  <Card key={expense.id}>
                    <View style={s.row}>
                      <Text style={s.cardTitle}>{expense.description}</Text>
                      <Stamp tone={expenseTone(expense.status)}>
                        {statusLabel(expense.status)}
                      </Stamp>
                    </View>
                    <Text style={s.amount}>{formatMoney(expense.amountMinor)}</Text>
                    <Text style={s.body}>
                      {expense.jobId
                        ? (snapshot.jobs.find((job) => job.id === expense.jobId)?.title ??
                          'Linked job')
                        : 'General business expense'}
                    </Text>
                    <Text style={s.caption}>Missing receipt: {expense.missingReceiptReason}</Text>
                    {expense.reviewReason ? (
                      <Text style={s.caption}>Review note: {expense.reviewReason}</Text>
                    ) : null}
                    <Text style={s.caption}>
                      Expense status is separate from reimbursement or payment.
                    </Text>
                  </Card>
                ))
              )}
            </>
          )}
          {tab === 'sync' && (
            <>
              <Card>
                <Label>Saved on this device</Label>
                <Text style={s.syncTitle}>
                  {state.commands.length === 0
                    ? 'Nothing waiting to send'
                    : `${pendingCount} pending · ${issueCount} ${issueCount === 1 ? 'issue' : 'issues'}`}
                </Text>
                <Text style={s.body}>
                  Local entries are requests. Job completion and expense submission are confirmed
                  only after the server accepts them.
                </Text>
                <Text style={s.caption}>
                  Last server check: {formatDate(snapshot?.fetchedAt)}
                  {snapshot ? `\nAccount: ${snapshot.workspace.user.name}` : ''}
                </Text>
                <Button
                  onPress={() => void sync()}
                  disabled={syncing || saving || Boolean(state.blockedReason)}
                  testID="sync-now"
                >
                  {syncing ? 'Syncing…' : 'Sync now'}
                </Button>
              </Card>
              {state.blockedReason && (
                <Note notice={{ kind: 'error', text: state.blockedReason }} />
              )}
              {state.commands.map((command) => (
                <QueueCard
                  key={command.id}
                  command={command}
                  jobs={snapshot?.jobs ?? []}
                  disabled={syncing || saving}
                  onDiscard={() => discard(command)}
                />
              ))}
              <Card>
                <Text style={s.cardTitle}>About this preview</Text>
                <Text style={s.body}>
                  Switching fictional accounts keeps their local records and queues separate. Sync
                  runs when the app opens, returns to the foreground, reconnects, or when you choose
                  Sync now. Pending entries retry every 30 seconds while the app is open.
                </Text>
                <Text style={s.caption}>
                  Receipt uploads, expense approval, reimbursements, payments and real sign-in are
                  not available in this native slice. Use only fictional entries.
                </Text>
              </Card>
              <Card>
                <Text style={s.cardTitle}>Reset local demo data</Text>
                <Text style={s.body}>
                  A restarted demo server has a new session. Old pending entries stay here for
                  inspection and are never replayed into the new session.
                </Text>
                <Button
                  secondary
                  destructive
                  onPress={reset}
                  disabled={syncing || saving}
                  testID="reset-local-demo"
                >
                  Reset this account’s demo data
                </Button>
              </Card>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      <View style={s.tabs} accessibilityRole="tablist">
        {(['work', 'money', 'sync'] as Tab[]).map((item) => {
          const active = tab === item;
          const title = item === 'sync' ? 'Sync' : statusLabel(item);
          return (
            <Pressable
              key={item}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={
                item === 'sync' ? `Sync, ${pendingCount} pending, ${issueCount} issues` : title
              }
              onPress={() => setTab(item)}
              style={s.tab}
              testID={`tab-${item}`}
            >
              <View style={[s.tabGlyph, active && s.tabGlyphActive]}>
                <Text style={[s.tabGlyphText, active && s.activeTabText]}>
                  {item === 'work' ? 'W' : item === 'money' ? '$' : '↻'}
                </Text>
              </View>
              <Text style={[s.tabText, active && s.activeTabText]}>{title}</Text>
              {item === 'sync' && state.commands.length > 0 && (
                <View style={s.tabBadge}>
                  <Text style={s.tabBadgeText}>{state.commands.length}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function JobCard({
  job,
  pending,
  canClose,
  canSeePrice,
  saving,
  onClose,
}: {
  job: Job;
  pending?: PendingCommand;
  canClose: boolean;
  canSeePrice: boolean;
  saving: boolean;
  onClose: () => void;
}) {
  const { s } = useTheme();
  return (
    <Card>
      <View style={s.row}>
        <Stamp tone={job.status === 'completed' ? 'good' : 'neutral'}>
          {statusLabel(job.status)}
        </Stamp>
        {pending && (
          <Stamp tone={pending.status === 'queued' ? 'warning' : 'danger'}>
            {pending.status === 'queued' ? 'Completion pending' : 'Needs attention'}
          </Stamp>
        )}
      </View>
      <Text style={s.jobTitle}>{job.title}</Text>
      <Text style={s.body}>{job.customerName}</Text>
      {canSeePrice && job.agreedPriceMinor !== undefined ? (
        <Text style={s.caption}>Agreed price · {formatMoney(job.agreedPriceMinor)}</Text>
      ) : null}
      {pending ? (
        <Text style={s.pendingNote}>
          {pending.message ?? 'Saved locally. The status above is the last server-confirmed state.'}
        </Text>
      ) : null}
      {canClose && job.status !== 'completed' && (
        <Button
          onPress={onClose}
          disabled={saving || Boolean(pending)}
          testID={`close-job-${job.id}`}
          label={`Mark ${job.title} complete`}
        >
          {pending ? 'Completion saved on device' : saving ? 'Saving…' : 'Mark complete'}
        </Button>
      )}
    </Card>
  );
}

function ExpenseForm({
  jobs,
  saving,
  onSubmit,
}: {
  jobs: Job[];
  saving: boolean;
  onSubmit: (input: Record<string, unknown>) => Promise<boolean>;
}) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { s, c } = useTheme();
  const submit = async () => {
    try {
      setError(null);
      if (!description.trim()) throw new Error('Describe what you paid for.');
      if (!reason.trim()) throw new Error('Explain why the receipt is missing.');
      const saved = await onSubmit({
        description,
        amountMinor: parsePesos(amount),
        currency: 'MXN',
        missingReceiptReason: reason,
        ...(jobId ? { jobId } : {}),
      });
      if (saved) {
        setDescription('');
        setAmount('');
        setReason('');
        setJobId(null);
      }
    } catch (cause) {
      setError(messageOf(cause));
    }
  };
  return (
    <Card>
      <Text style={s.cardTitle}>Record expense</Text>
      <Text style={s.body}>
        Paid from your own money, without a receipt. It is reviewed after sync; saving does not
        reimburse you.
      </Text>
      <View style={s.field}>
        <Label>Description</Label>
        <TextInput
          accessibilityLabel="Expense description"
          testID="expense-description"
          value={description}
          onChangeText={setDescription}
          maxLength={240}
          editable={!saving}
          style={s.input}
          placeholder="For example, materials or parking"
          placeholderTextColor={c.text3}
        />
      </View>
      <View style={s.field}>
        <Label>Amount (MXN)</Label>
        <TextInput
          accessibilityLabel="Amount in MXN"
          testID="expense-amount"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          maxLength={16}
          editable={!saving}
          style={s.input}
          placeholder="0.00"
          placeholderTextColor={c.text3}
        />
      </View>
      <View style={s.field}>
        <Label>Related work</Label>
        <View style={s.choices}>
          {[{ id: null, title: 'General business expense' }, ...jobs].map((job) => (
            <Pressable
              key={job.id ?? 'general'}
              accessibilityRole="radio"
              accessibilityLabel={job.title}
              accessibilityState={{ selected: jobId === job.id, disabled: saving }}
              disabled={saving}
              onPress={() => setJobId(job.id)}
              style={[s.choice, jobId === job.id && s.choiceSelected]}
            >
              <View style={[s.radio, jobId === job.id && s.radioSelected]}>
                {jobId === job.id && <View style={s.radioDot} />}
              </View>
              <Text style={[s.choiceText, jobId === job.id && s.choiceSelectedText]}>
                {job.title}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={s.field}>
        <Label>Missing receipt reason</Label>
        <TextInput
          accessibilityLabel="Missing receipt reason"
          testID="expense-reason"
          value={reason}
          onChangeText={setReason}
          maxLength={500}
          editable={!saving}
          multiline
          numberOfLines={3}
          style={[s.input, s.textarea]}
          placeholder="A reason is required for review"
          placeholderTextColor={c.text3}
        />
      </View>
      {error && <Note notice={{ kind: 'error', text: error }} />}
      <Button onPress={() => void submit()} disabled={saving} testID="save-expense">
        {saving ? 'Saving…' : 'Save on this device'}
      </Button>
    </Card>
  );
}

function QueueCard({
  command,
  jobs,
  disabled,
  onDiscard,
}: {
  command: PendingCommand;
  jobs: Job[];
  disabled: boolean;
  onDiscard: () => void;
}) {
  const jobId = command.kind === 'job.close' ? command.path.split('/')[2] : command.body.jobId;
  const title =
    command.kind === 'expense.submit'
      ? String(command.body.description)
      : (jobs.find((job) => job.id === jobId)?.title ?? 'Job completion');
  const { s } = useTheme();
  return (
    <Card>
      <View style={s.row}>
        <Label>{command.kind === 'expense.submit' ? 'Expense submission' : 'Job completion'}</Label>
        <Stamp tone={command.status === 'queued' ? 'warning' : 'danger'}>
          {command.status === 'queued' ? 'Pending' : statusLabel(command.status)}
        </Stamp>
      </View>
      <Text style={s.cardTitle}>{title}</Text>
      {command.kind === 'expense.submit' && (
        <>
          <Text style={s.amount}>{formatMoney(Number(command.body.amountMinor))}</Text>
          <Text style={s.caption}>
            Missing receipt: {String(command.body.missingReceiptReason)}
          </Text>
        </>
      )}
      <Text style={s.caption}>Saved {formatDate(command.createdAt)}</Text>
      <Text style={s.body}>
        {command.message ?? 'Waiting for server confirmation. A retry uses the same saved request.'}
      </Text>
      {command.status !== 'queued' && (
        <>
          <Text style={s.caption}>
            Review the current record before entering a replacement. This entry is not retried
            automatically.
          </Text>
          <Button
            secondary
            onPress={onDiscard}
            disabled={disabled}
            testID={`discard-${command.id}`}
          >
            Remove this issue
          </Button>
        </>
      )}
    </Card>
  );
}
