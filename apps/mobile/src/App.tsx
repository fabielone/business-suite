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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondaryButton,
        destructive && styles.destructiveButton,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          secondary && styles.secondaryButtonText,
          destructive && styles.destructiveText,
        ]}
      >
        {children}
      </Text>
    </Pressable>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}
function Eyebrow({ children }: { children: ReactNode }) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}
function Stamp({ children, warning = false }: { children: ReactNode; warning?: boolean }) {
  return (
    <View style={[styles.stamp, warning && styles.warningStamp]}>
      <Text style={[styles.stampText, warning && styles.warningStampText]}>{children}</Text>
    </View>
  );
}
function Note({ notice }: { notice: Notice }) {
  return notice ? (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.notice, notice.kind === 'error' && styles.errorNotice]}
    >
      <Text style={[styles.noticeText, notice.kind === 'error' && styles.errorText]}>
        {notice.text}
      </Text>
    </View>
  ) : null;
}
function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : 'Not yet';
}
function statusLabel(value: string) {
  return value === 'in_progress' ? 'In progress' : value.charAt(0).toUpperCase() + value.slice(1);
}

export default function App() {
  const [role, setRole] = useState<DemoRole>('worker');
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <StatusBar barStyle="dark-content" />
        {simulatorDemoAllowed ? (
          <DemoApp key={role} role={role} onRoleChange={setRole} />
        ) : (
          <SetupScreen />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function SetupScreen() {
  return (
    <ScrollView contentContainerStyle={styles.setup}>
      <View style={styles.brandMark}>
        <Text style={styles.brandMarkText}>B</Text>
      </View>
      <Eyebrow>Business Suite · Native preview</Eyebrow>
      <Text style={styles.setupTitle}>Your work,\nready for the field.</Text>
      <Text style={styles.body}>
        {demoRequested
          ? 'This fictional demo is limited to an iOS simulator or Android emulator on your computer.'
          : 'Real business access needs setup before this app can connect.'}
      </Text>
      <Card>
        <Text style={styles.cardTitle}>Setup required</Text>
        <Text style={styles.body}>
          Secure sign-in and a configured business service are not available in this preview. No
          business records have been loaded.
        </Text>
      </Card>
      <Text style={styles.caption}>
        The local simulator demo is enabled explicitly by the development command. Physical devices
        and LAN demo access are disabled.
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
    <View style={styles.app}>
      <View style={styles.demoBanner}>
        <Text style={styles.demoBannerText}>FICTIONAL DEMO · Simulator only</Text>
        <Text style={styles.demoBannerDetail}>
          Server data is temporary. Local saves stay on this device.
        </Text>
      </View>
      <View style={styles.header}>
        <View style={styles.headerTitle}>
          <Eyebrow>Business Suite</Eyebrow>
          <Text style={styles.screenTitle}>
            {tab === 'work' ? 'Work' : tab === 'money' ? 'Money' : 'Sync & device'}
          </Text>
        </View>
        <View style={styles.roleGroup} accessibilityLabel="Fictional demo identity">
          {(['worker', 'manager'] as DemoRole[]).map((value) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityLabel={`Use fictional ${value}`}
              accessibilityState={{ selected: role === value, disabled: saving || syncing }}
              disabled={saving || syncing}
              onPress={() => onRoleChange(value)}
              testID={`role-${value}`}
              style={[styles.roleButton, role === value && styles.roleSelected]}
            >
              <Text style={[styles.roleText, role === value && styles.roleTextSelected]}>
                {statusLabel(value)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={styles.connectionBar}>
        <View
          style={[
            styles.dot,
            connection === 'connected' && !state.blockedReason && styles.dotConnected,
          ]}
        />
        <Text style={styles.connectionText}>{connectionText}</Text>
        <Text style={styles.queueCount}>
          {pendingCount} pending · {issueCount} issues
        </Text>
      </View>
      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <Note notice={notice} />
          {!loaded && (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.green} />
              <Text style={styles.body}>Opening your local workspace…</Text>
            </View>
          )}
          {loaded && !snapshot && tab !== 'sync' && (
            <Card>
              <Text style={styles.cardTitle}>
                {state.blockedReason ? 'Workspace locked' : 'Prepare this device online'}
              </Text>
              <Text style={styles.body}>
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
                Open Sync & device
              </Button>
            </Card>
          )}
          {snapshot && tab !== 'sync' && (
            <Text style={styles.caption}>
              Server-confirmed copy · Updated {formatDate(snapshot.fetchedAt)}
              {connection !== 'connected'
                ? '\nThis copy may be out of date. New actions are saved for checking.'
                : ''}
            </Text>
          )}
          {snapshot && tab === 'work' && (
            <>
              <View style={styles.sectionHeading}>
                <Text style={styles.sectionTitle}>
                  {role === 'worker' ? 'Your assigned jobs' : 'Business jobs'}
                </Text>
                <Text style={styles.caption}>{snapshot.jobs.length} records</Text>
              </View>
              {!enabled('work', 'work.jobs.read') ? (
                <Text style={styles.body}>Job access is unavailable for this account.</Text>
              ) : snapshot.jobs.length === 0 ? (
                <Card>
                  <Text style={styles.cardTitle}>No jobs here yet</Text>
                  <Text style={styles.body}>
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
              <View style={styles.sectionHeading}>
                <Text style={styles.sectionTitle}>Confirmed expenses</Text>
                <Text style={styles.caption}>{snapshot.expenses.length} records</Text>
              </View>
              {!enabled('money', 'money.expenses.read') ? (
                <Text style={styles.body}>Expense access is unavailable for this account.</Text>
              ) : snapshot.expenses.length === 0 ? (
                <Card>
                  <Text style={styles.body}>
                    No confirmed expenses yet. Local submissions appear in Sync until the server
                    accepts them.
                  </Text>
                </Card>
              ) : (
                snapshot.expenses.map((expense) => (
                  <Card key={expense.id}>
                    <View style={styles.row}>
                      <Text style={styles.cardTitle}>{expense.description}</Text>
                      <Stamp warning={expense.status === 'submitted'}>
                        {statusLabel(expense.status)}
                      </Stamp>
                    </View>
                    <Text style={styles.amount}>{formatMoney(expense.amountMinor)}</Text>
                    <Text style={styles.body}>
                      {expense.jobId
                        ? (snapshot.jobs.find((job) => job.id === expense.jobId)?.title ??
                          'Linked job')
                        : 'General business expense'}
                    </Text>
                    <Text style={styles.caption}>
                      Missing receipt: {expense.missingReceiptReason}
                    </Text>
                    {expense.reviewReason ? (
                      <Text style={styles.caption}>Review note: {expense.reviewReason}</Text>
                    ) : null}
                    <Text style={styles.caption}>
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
                <Eyebrow>Saved on this device</Eyebrow>
                <Text style={styles.syncTitle}>
                  {state.commands.length === 0
                    ? 'Nothing waiting to send.'
                    : `${pendingCount} pending · ${issueCount} issues`}
                </Text>
                <Text style={styles.body}>
                  Local entries are requests. Job completion and expense submission are confirmed
                  only after the server accepts them.
                </Text>
                <Text style={styles.caption}>
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
                <Text style={styles.cardTitle}>About this preview</Text>
                <Text style={styles.body}>
                  Switching fictional accounts keeps their local records and queues separate. Sync
                  runs when the app opens, returns to the foreground, reconnects, or when you choose
                  Sync now. Pending entries retry every 30 seconds while the app is open.
                </Text>
                <Text style={styles.caption}>
                  Receipt uploads, expense approval, reimbursements, payments and real sign-in are
                  not available in this native slice. Use only fictional entries.
                </Text>
              </Card>
              <Card>
                <Text style={styles.cardTitle}>Reset local demo data</Text>
                <Text style={styles.body}>
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
      <View style={styles.tabs} accessibilityRole="tablist">
        {(['work', 'money', 'sync'] as Tab[]).map((item) => (
          <Pressable
            key={item}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === item }}
            accessibilityLabel={
              item === 'sync'
                ? `Sync, ${pendingCount} pending, ${issueCount} issues`
                : statusLabel(item)
            }
            onPress={() => setTab(item)}
            style={[styles.tab, tab === item && styles.activeTab]}
            testID={`tab-${item}`}
          >
            <Text style={[styles.tabSymbol, tab === item && styles.activeTabText]}>
              {item === 'work' ? '▤' : item === 'money' ? '$' : '↻'}
            </Text>
            <Text style={[styles.tabText, tab === item && styles.activeTabText]}>
              {statusLabel(item)}
            </Text>
          </Pressable>
        ))}
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
  return (
    <Card>
      <View style={styles.row}>
        <Stamp>{statusLabel(job.status)}</Stamp>
        {pending && (
          <Stamp warning>
            {pending.status === 'queued' ? 'Completion pending' : 'Needs attention'}
          </Stamp>
        )}
      </View>
      <Text style={styles.jobTitle}>{job.title}</Text>
      <Text style={styles.body}>{job.customerName}</Text>
      {canSeePrice && job.agreedPriceMinor !== undefined ? (
        <Text style={styles.caption}>Agreed price · {formatMoney(job.agreedPriceMinor)}</Text>
      ) : null}
      {pending ? (
        <Text style={styles.pendingNote}>
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
      <Eyebrow>Paid from your own money</Eyebrow>
      <Text style={styles.cardTitle}>Record an expense</Text>
      <Text style={styles.body}>
        Save a fictional expense without a receipt. It will need review after sync; this does not
        reimburse you.
      </Text>
      <View style={styles.field}>
        <Text style={styles.label}>What did you pay for?</Text>
        <TextInput
          accessibilityLabel="Expense description"
          testID="expense-description"
          value={description}
          onChangeText={setDescription}
          maxLength={240}
          editable={!saving}
          style={styles.input}
          placeholder="For example, materials or parking"
          placeholderTextColor={colors.muted}
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Amount in MXN</Text>
        <TextInput
          accessibilityLabel="Amount in MXN"
          testID="expense-amount"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          maxLength={16}
          editable={!saving}
          style={styles.input}
          placeholder="0.00"
          placeholderTextColor={colors.muted}
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Related to</Text>
        <View style={styles.choices}>
          {[{ id: null, title: 'General business expense' }, ...jobs].map((job) => (
            <Pressable
              key={job.id ?? 'general'}
              accessibilityRole="radio"
              accessibilityLabel={job.title}
              accessibilityState={{ selected: jobId === job.id, disabled: saving }}
              disabled={saving}
              onPress={() => setJobId(job.id)}
              style={[styles.choice, jobId === job.id && styles.choiceSelected]}
            >
              <Text style={[styles.choiceText, jobId === job.id && styles.choiceSelectedText]}>
                {jobId === job.id ? '●  ' : '○  '}
                {job.title}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Why is the receipt missing?</Text>
        <TextInput
          accessibilityLabel="Missing receipt reason"
          testID="expense-reason"
          value={reason}
          onChangeText={setReason}
          maxLength={500}
          editable={!saving}
          multiline
          numberOfLines={3}
          style={[styles.input, styles.textarea]}
          placeholder="A reason is required for review"
          placeholderTextColor={colors.muted}
        />
      </View>
      {error && <Note notice={{ kind: 'error', text: error }} />}
      <Button onPress={() => void submit()} disabled={saving} testID="save-expense">
        {saving ? 'Saving on device…' : 'Save expense on device'}
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
  return (
    <Card>
      <View style={styles.row}>
        <Eyebrow>
          {command.kind === 'expense.submit' ? 'Expense submission' : 'Job completion'}
        </Eyebrow>
        <Stamp warning>
          {command.status === 'queued' ? 'Pending' : statusLabel(command.status)}
        </Stamp>
      </View>
      <Text style={styles.cardTitle}>{title}</Text>
      {command.kind === 'expense.submit' && (
        <>
          <Text style={styles.amount}>{formatMoney(Number(command.body.amountMinor))}</Text>
          <Text style={styles.caption}>
            Missing receipt: {String(command.body.missingReceiptReason)}
          </Text>
        </>
      )}
      <Text style={styles.caption}>Saved {formatDate(command.createdAt)}</Text>
      <Text style={styles.body}>
        {command.message ?? 'Waiting for server confirmation. A retry uses the same saved request.'}
      </Text>
      {command.status !== 'queued' && (
        <>
          <Text style={styles.caption}>
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

const colors = {
  background: '#F4F5EE',
  paper: '#FFFFFF',
  ink: '#21342E',
  muted: '#63736B',
  line: '#DCE3D9',
  green: '#285C48',
  paleGreen: '#E5EEDF',
  amber: '#79571B',
  paleAmber: '#F9EFCF',
  red: '#8E3D36',
  paleRed: '#F9E9E5',
};
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  app: { flex: 1 },
  content: { flex: 1 },
  demoBanner: {
    paddingHorizontal: 20,
    paddingVertical: 9,
    backgroundColor: colors.paleAmber,
    gap: 3,
  },
  demoBannerText: { color: colors.amber, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  demoBannerDetail: { color: colors.amber, fontSize: 12, lineHeight: 17 },
  header: {
    paddingHorizontal: 20,
    paddingTop: 19,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerTitle: { flexShrink: 1, gap: 5 },
  eyebrow: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
  screenTitle: { color: colors.ink, fontSize: 28, fontWeight: '700', letterSpacing: -0.8 },
  roleGroup: { flexDirection: 'row', backgroundColor: '#E9EDE4', padding: 3, borderRadius: 12 },
  roleButton: {
    minHeight: 44,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },
  roleSelected: { backgroundColor: colors.paper },
  roleText: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  roleTextSelected: { color: colors.green },
  connectionBar: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.amber },
  dotConnected: { backgroundColor: colors.green },
  connectionText: { flex: 1, fontSize: 12, color: colors.muted },
  queueCount: { fontSize: 12, color: colors.ink, fontWeight: '600' },
  scrollContent: {
    padding: 20,
    gap: 15,
    paddingBottom: 32,
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
  },
  loading: { padding: 30, gap: 12, alignItems: 'center' },
  card: {
    padding: 20,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 18,
    gap: 12,
  },
  cardTitle: { fontSize: 19, lineHeight: 25, fontWeight: '700', color: colors.ink, flexShrink: 1 },
  jobTitle: {
    color: colors.ink,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.5,
    fontWeight: '600',
  },
  body: { color: colors.muted, fontSize: 15, lineHeight: 23 },
  caption: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 6,
  },
  sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: '700', flexShrink: 1 },
  amount: {
    fontSize: 24,
    lineHeight: 30,
    color: colors.ink,
    fontWeight: '600',
    letterSpacing: -0.4,
  },
  stamp: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: colors.paleGreen,
    alignSelf: 'flex-start',
  },
  stampText: { color: colors.green, fontSize: 11, fontWeight: '700' },
  warningStamp: { backgroundColor: colors.paleAmber },
  warningStampText: { color: colors.amber },
  pendingNote: { fontSize: 13, lineHeight: 20, color: colors.amber },
  button: {
    minHeight: 48,
    paddingHorizontal: 15,
    paddingVertical: 13,
    backgroundColor: colors.green,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    color: colors.paper,
    textAlign: 'center',
  },
  secondaryButton: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.line },
  secondaryButtonText: { color: colors.green },
  destructiveButton: { borderColor: '#E6C5BE' },
  destructiveText: { color: colors.red },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
  notice: { borderRadius: 12, padding: 14, backgroundColor: colors.paleGreen },
  noticeText: { color: colors.green, fontSize: 13, lineHeight: 20 },
  errorNotice: { backgroundColor: colors.paleRed },
  errorText: { color: colors.red },
  field: { gap: 7 },
  label: { fontSize: 13, fontWeight: '600', color: colors.ink },
  input: {
    minHeight: 49,
    borderWidth: 1,
    borderColor: '#BAC9BC',
    borderRadius: 9,
    backgroundColor: '#FCFDF9',
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 16,
    color: colors.ink,
  },
  textarea: { minHeight: 88, textAlignVertical: 'top' },
  choices: { gap: 7 },
  choice: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
  },
  choiceSelected: { backgroundColor: colors.paleGreen, borderColor: '#A0B89F' },
  choiceText: { fontSize: 13, lineHeight: 20, color: colors.muted },
  choiceSelectedText: { color: colors.green, fontWeight: '600' },
  syncTitle: {
    fontSize: 25,
    lineHeight: 31,
    color: colors.ink,
    fontWeight: '600',
    letterSpacing: -0.5,
  },
  tabs: {
    borderTopWidth: 1,
    borderColor: colors.line,
    flexDirection: 'row',
    paddingHorizontal: 15,
    paddingVertical: 8,
    backgroundColor: colors.paper,
    gap: 7,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    minHeight: 55,
  },
  activeTab: { backgroundColor: colors.paleGreen },
  tabText: { fontSize: 12, fontWeight: '700', color: colors.muted },
  tabSymbol: { color: colors.muted, fontSize: 20, lineHeight: 24, fontWeight: '600' },
  activeTabText: { color: colors.green },
  setup: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 28,
    gap: 22,
    maxWidth: 640,
    width: '100%',
    alignSelf: 'center',
  },
  setupTitle: {
    fontSize: 40,
    lineHeight: 45,
    color: colors.ink,
    fontWeight: '600',
    letterSpacing: -1.4,
  },
  brandMark: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMarkText: { fontSize: 28, fontWeight: '700', color: colors.paper },
});
