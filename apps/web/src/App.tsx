import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  ApiError,
  errorMessage,
  formatMoney,
  parseMinor,
  request,
  type DemoRole,
  type Expense,
  type Job,
  type Workspace,
} from './api';

type View = 'overview' | 'work' | 'money';
type Collection<T> = { items: T[]; error: string | null; loaded: boolean };
type Modal = 'job' | 'expense' | { expense: Expense; decision: 'approve' | 'reject' } | null;
const blank = <T,>(): Collection<T> => ({ items: [], error: null, loaded: false });
const labels: Record<string, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  completed: 'Completed',
  submitted: 'Needs review',
  approved: 'Approved',
  rejected: 'Rejected',
};

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </>
    ),
    work: (
      <>
        <rect x="3" y="7" width="18" height="14" rx="2" />
        <path d="M8 7V4h8v3M3 12c5 3 13 3 18 0M10 13v3h4v-3" />
      </>
    ),
    money: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 8h18M15 12h6v5h-6a2.5 2.5 0 0 1 0-5Z" />
        <path d="M15.5 14.5h.01" />
      </>
    ),
    people: (
      <>
        <circle cx="9" cy="7" r="3" />
        <path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4v3" />
      </>
    ),
    contacts: (
      <>
        <rect x="5" y="3" width="15" height="18" rx="2" />
        <path d="M3 7h4M3 12h4M3 17h4" />
        <circle cx="13" cy="9" r="2" />
        <path d="M9 17v-1a4 4 0 0 1 8 0v1" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    arrow: <path d="m9 5 7 7-7 7" />,
    back: <path d="m15 5-7 7 7 7" />,
    check: <path d="m5 12 4 4L19 6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    receipt: (
      <>
        <path d="M5 3h14v18l-3-2-4 2-4-2-3 2V3Z" />
        <path d="M9 8h6M9 12h6" />
      </>
    ),
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 5 5" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 7v5h-5M4 17v-5h5" />
        <path d="M19 10a7.5 7.5 0 0 0-13-5L4 7M5 14a7.5 7.5 0 0 0 13 5l2-2" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6M12 7h.01" />
      </>
    ),
    flag: (
      <>
        <path d="M5 21V3M5 4c5-4 8 4 14 0v10c-6 4-9-4-14 0" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.info}
    </svg>
  );
}

function Status({ status }: { status: string }) {
  return (
    <span className={`status status-${status}`}>
      <span />
      {labels[status] ?? status}
    </span>
  );
}

function Problem({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="problem" role="alert">
      <Icon name="info" />
      <div>
        <p>{message}</p>
        {onRetry && (
          <button className="text-button" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

function Empty({
  title,
  children,
  icon = 'work',
}: {
  title: string;
  children: ReactNode;
  icon?: string;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name={icon} size={26} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

function useCommand(role: DemoRole, businessId: string) {
  const keys = useRef(new Map<string, string>());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  async function run<T>(path: string, body: unknown): Promise<T | null> {
    const signature = JSON.stringify([role, businessId, path, body]);
    let key = keys.current.get(signature);
    if (!key) {
      key = crypto.randomUUID();
      keys.current.set(signature, key);
    }
    setPending(true);
    setError(null);
    setConflict(false);
    try {
      const result = await request<T>(path, role, { businessId, body, idempotencyKey: key });
      keys.current.delete(signature);
      return result;
    } catch (err) {
      setError(errorMessage(err));
      setConflict(err instanceof ApiError && err.status === 409);
      return null;
    } finally {
      setPending(false);
    }
  }
  return {
    run,
    pending,
    error,
    conflict,
    clear: () => {
      setError(null);
      setConflict(false);
    },
  };
}

export function App() {
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(window.location.hostname);
  if (import.meta.env.MODE !== 'demo' || !loopback)
    return (
      <div className="setup-page">
        <div className="brand-mark" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <p className="eyebrow">Business Suite / Setup</p>
        <h1>A foundation for your business.</h1>
        <p>
          This build needs a verified identity connection before it can access business data.
          Sign-in is not part of this first slice.
        </p>
        <div className="setup-card">
          <h2>Local demo available</h2>
          <p>
            Run the documented demo command on this computer to explore Work and Money with
            temporary example data.
          </p>
          <code>npm run demo</code>
          <p className="muted">
            Demo identity is restricted to the explicit loopback demo mode. No live credentials are
            stored in this frontend.
          </p>
        </div>
      </div>
    );
  return <DemoApp />;
}

function DemoApp() {
  const [role, setRole] = useState<DemoRole>('manager');
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [jobs, setJobs] = useState<Collection<Job>>(blank);
  const [expenses, setExpenses] = useState<Collection<Expense>>(blank);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);
  const [view, setView] = useState<View>('overview');
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [notice, setNotice] = useState('');
  const refresh = useCallback(() => setRefreshCount((n) => n + 1), []);
  const can = (permission: string) => workspace?.permissions.includes(permission) ?? false;
  const workEnabled = workspace?.modules.includes('work') ?? false;
  const moneyEnabled = workspace?.modules.includes('money') ?? false;
  const command = useCommand(role, workspace?.business.id ?? '');

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setLoadError(null);
    async function load() {
      try {
        const next = await request<Workspace>('/workspace', role, { signal: controller.signal });
        if (!next.demo)
          throw new ApiError(
            403,
            'demo_required',
            'This frontend is a local demo. The connected API is not in demo mode; live access requires a verified sign-in setup.',
          );
        if (!active) return;
        setWorkspace(next);
        const options = { businessId: next.business.id, signal: controller.signal };
        const [jobResult, expenseResult] = await Promise.allSettled([
          next.modules.includes('work') && next.permissions.includes('work.jobs.read')
            ? request<{ jobs: Job[] }>('/jobs', role, options)
            : Promise.resolve({ jobs: [] }),
          next.modules.includes('money') && next.permissions.includes('money.expenses.read')
            ? request<{ expenses: Expense[] }>('/expenses', role, options)
            : Promise.resolve({ expenses: [] }),
        ]);
        if (!active) return;
        setJobs(
          jobResult.status === 'fulfilled'
            ? { items: jobResult.value.jobs, loaded: true, error: null }
            : { items: [], loaded: true, error: errorMessage(jobResult.reason) },
        );
        setExpenses(
          expenseResult.status === 'fulfilled'
            ? { items: expenseResult.value.expenses, loaded: true, error: null }
            : { items: [], loaded: true, error: errorMessage(expenseResult.reason) },
        );
      } catch (err) {
        if (active) {
          setWorkspace(null);
          setJobs(blank());
          setExpenses(blank());
          setLoadError(errorMessage(err));
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [role, refreshCount]);

  function navigate(next: View) {
    setView(next);
    setSelectedJob(null);
    command.clear();
  }
  function switchRole(next: DemoRole) {
    setWorkspace(null);
    setJobs(blank());
    setExpenses(blank());
    setSelectedJob(null);
    setModal(null);
    setNotice('');
    setView('overview');
    command.clear();
    setRole(next);
  }
  function saved(message: string) {
    setModal(null);
    setNotice(message);
    refresh();
  }
  async function closeJob(job: Job) {
    const result = await command.run<{ job: Job }>(`/jobs/${job.id}/close`, {
      version: job.version,
    });
    if (result) {
      setNotice('Job completed. Expenses and payment balances remain separate.');
      refresh();
    }
  }
  const job = jobs.items.find((item) => item.id === selectedJob);

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="demo-banner" role="note">
        <span className="demo-label">
          <span />
          LOCAL DEMO
        </span>
        <span>
          Temporary example data resets when the API restarts. No real uploads or payments.
        </span>
      </div>
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
            <div>
              Business Suite<small>Work, together.</small>
            </div>
          </div>
          <div className="workspace-badge">
            <span className="workspace-initial">{workspace?.business.name.charAt(0) ?? 'B'}</span>
            <div>
              <strong>{workspace?.business.name ?? 'Connecting…'}</strong>
              <small>Demo business</small>
            </div>
          </div>
          <nav aria-label="Main navigation">
            <p className="nav-label">WORKSPACE</p>
            <button
              className={`nav-item ${view === 'overview' ? 'active' : ''}`}
              aria-current={view === 'overview' ? 'page' : undefined}
              onClick={() => navigate('overview')}
            >
              <Icon name="grid" />
              Overview
            </button>
            {workEnabled && can('work.jobs.read') && (
              <button
                className={`nav-item ${view === 'work' ? 'active' : ''}`}
                aria-current={view === 'work' ? 'page' : undefined}
                onClick={() => navigate('work')}
              >
                <Icon name="work" />
                Work
                <span className="nav-count">
                  {jobs.loaded && !jobs.error
                    ? jobs.items.filter((j) => j.status !== 'completed').length
                    : '—'}
                </span>
              </button>
            )}
            {moneyEnabled && can('money.expenses.read') && (
              <button
                className={`nav-item ${view === 'money' ? 'active' : ''}`}
                aria-current={view === 'money' ? 'page' : undefined}
                onClick={() => navigate('money')}
              >
                <Icon name="money" />
                Money
              </button>
            )}
            <p className="nav-label future-label">PLANNED MODULES</p>
            <span className="nav-item future">
              <Icon name="people" />
              Resources<span className="future-tag">Planned</span>
            </span>
            <span className="nav-item future">
              <Icon name="contacts" />
              CRM<span className="future-tag">Planned</span>
            </span>
          </nav>
          <div className="sidebar-note">
            <Icon name="flag" size={18} />
            <p>
              A small beginning.
              <br />
              <span>One connected place for jobs and expense review.</span>
            </p>
          </div>
          <div className="sidebar-foot">
            <span className="connection-dot" />
            Local development preview
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <div className="breadcrumb">
              Workspace<span>/</span>
              <strong>
                {view === 'overview' ? 'Overview' : view === 'work' ? 'Work' : 'Money'}
              </strong>
            </div>
            <div className="identity-control">
              <span className="avatar" aria-hidden="true">
                {role === 'manager' ? 'M' : 'W'}
              </span>
              <label htmlFor="demo-role">
                Demo identity
                <select
                  id="demo-role"
                  aria-label="Demo identity"
                  value={role}
                  disabled={modal !== null || command.pending}
                  onChange={(e) => switchRole(e.target.value as DemoRole)}
                >
                  <option value="manager">Manager</option>
                  <option value="worker">Worker</option>
                </select>
              </label>
            </div>
          </header>
          <main id="main" tabIndex={-1}>
            {!workspace ? (
              <div className="connection-state">
                {loading ? (
                  <>
                    <span className="spinner" />
                    <h1>Opening your workspace</h1>
                    <p>Connecting to the local demo API…</p>
                  </>
                ) : (
                  <>
                    <h1>Let’s get connected.</h1>
                    <Problem
                      message={loadError ?? 'The workspace is unavailable.'}
                      onRetry={refresh}
                    />
                    <p className="muted">
                      This screen uses the API. It will never replace an unavailable connection with
                      sample data in the browser.
                    </p>
                  </>
                )}
              </div>
            ) : (
              <>
                {loadError && <Problem message={loadError} onRetry={refresh} />}
                {notice && (
                  <div className="notice" role="status">
                    <Icon name="check" />
                    <span>{notice}</span>
                    <button aria-label="Dismiss message" onClick={() => setNotice('')}>
                      <Icon name="close" size={16} />
                    </button>
                  </div>
                )}
                <div className="page-heading">
                  <div>
                    <p className="eyebrow">
                      {view === 'overview'
                        ? 'YOUR BUSINESS, AT A GLANCE'
                        : view === 'work'
                          ? 'WORK / JOBS'
                          : 'MONEY / EXPENSES'}
                    </p>
                    <h1>
                      {view === 'overview'
                        ? 'A clearer view of the day.'
                        : view === 'work'
                          ? selectedJob
                            ? 'Job details'
                            : 'Keep work moving.'
                          : 'Every expense, accounted for.'}
                    </h1>
                    <p>
                      {view === 'overview'
                        ? `Welcome, ${workspace.user.name}. Here is what is happening in your workspace.`
                        : view === 'work'
                          ? 'The work to do, the people responsible, and what is complete.'
                          : can('money.expenses.review')
                            ? 'Review business expenses and keep a clear record of who paid.'
                            : 'Record what you paid for work and follow its review.'}
                    </p>
                  </div>
                  <div className="page-actions">
                    <button
                      className="icon-button"
                      aria-label="Refresh data"
                      title="Refresh data"
                      disabled={loading}
                      onClick={refresh}
                    >
                      <Icon name="refresh" />
                    </button>
                    {view === 'work' && can('work.jobs.create') && (
                      <button
                        className="button primary"
                        disabled={loading || !!loadError}
                        onClick={() => setModal('job')}
                      >
                        <Icon name="plus" size={18} />
                        New job
                      </button>
                    )}
                    {view === 'money' && can('money.expenses.submit') && (
                      <button
                        className="button primary"
                        disabled={loading || !!loadError}
                        onClick={() => setModal('expense')}
                      >
                        <Icon name="plus" size={18} />
                        Add expense
                      </button>
                    )}
                  </div>
                </div>
                {loading && (
                  <div className="loading-line" role="status">
                    Refreshing workspace data…
                  </div>
                )}
                {view === 'overview' && (
                  <Overview
                    workspace={workspace}
                    jobs={jobs}
                    expenses={expenses}
                    onNavigate={navigate}
                    onJob={(id) => {
                      setView('work');
                      setSelectedJob(id);
                    }}
                    onNewJob={() => setModal('job')}
                    onExpense={() => setModal('expense')}
                    onRetry={refresh}
                    disabled={loading || !!loadError}
                  />
                )}
                {view === 'work' &&
                  (selectedJob ? (
                    jobs.error ? (
                      <Problem message={jobs.error} onRetry={refresh} />
                    ) : job ? (
                      <JobDetail
                        job={job}
                        workspace={workspace}
                        expenses={expenses}
                        onBack={() => {
                          setSelectedJob(null);
                          command.clear();
                        }}
                        onClose={() => void closeJob(job)}
                        pending={command.pending || loading || !!loadError}
                        error={command.error}
                      />
                    ) : (
                      !loading && (
                        <Empty title="Job unavailable">
                          This job may have changed or be outside your access.{' '}
                          <button className="text-button" onClick={() => setSelectedJob(null)}>
                            Back to jobs
                          </button>
                        </Empty>
                      )
                    )
                  ) : (
                    <JobList
                      jobs={jobs}
                      workspace={workspace}
                      onSelect={setSelectedJob}
                      onRetry={refresh}
                    />
                  ))}
                {view === 'money' && (
                  <ExpenseList
                    expenses={expenses}
                    jobs={jobs.items}
                    workspace={workspace}
                    onReview={(expense, decision) => setModal({ expense, decision })}
                    onRetry={refresh}
                    disabled={loading || !!loadError}
                  />
                )}
                <footer className="page-footer">
                  <span>Business Suite · First local slice</span>
                  <span>English starter copy · Product name provisional</span>
                </footer>
              </>
            )}
          </main>
        </div>
      </div>
      {workspace && modal === 'job' && (
        <JobForm
          role={role}
          workspace={workspace}
          onClose={() => setModal(null)}
          onSaved={() => saved('Job created with its agreed price.')}
        />
      )}
      {workspace && modal === 'expense' && (
        <ExpenseForm
          role={role}
          workspace={workspace}
          jobs={jobs.error ? [] : jobs.items}
          onClose={() => setModal(null)}
          onSaved={() =>
            saved('Expense submitted for review. No reimbursement or payment has been recorded.')
          }
        />
      )}
      {workspace && modal && typeof modal === 'object' && (
        <ReviewForm
          role={role}
          workspace={workspace}
          expense={modal.expense}
          decision={modal.decision}
          onRefreshed={refresh}
          onClose={() => setModal(null)}
          onSaved={() =>
            saved(
              modal.decision === 'approve'
                ? 'Expense approved. Approval does not record a payment.'
                : 'Expense rejected. The original submission remains in the record.',
            )
          }
        />
      )}
    </>
  );
}

function Overview({
  workspace,
  jobs,
  expenses,
  onNavigate,
  onJob,
  onNewJob,
  onExpense,
  onRetry,
  disabled,
}: {
  workspace: Workspace;
  jobs: Collection<Job>;
  expenses: Collection<Expense>;
  onNavigate: (view: View) => void;
  onJob: (id: string) => void;
  onNewJob: () => void;
  onExpense: () => void;
  onRetry: () => void;
  disabled: boolean;
}) {
  const visibleJobs =
    workspace.modules.includes('work') && workspace.permissions.includes('work.jobs.read');
  const visibleExpenses =
    workspace.modules.includes('money') && workspace.permissions.includes('money.expenses.read');
  const reviewing = workspace.permissions.includes('money.expenses.review');
  const active = jobs.items.filter((j) => j.status !== 'completed');
  const waiting = expenses.items.filter((e) => e.status === 'submitted');
  const stats = [
    {
      label: 'Open jobs',
      value: visibleJobs && jobs.loaded && !jobs.error ? active.length : '—',
      detail: 'Ready for the next step',
      icon: 'work',
      tone: 'green',
    },
    {
      label: reviewing ? 'Expenses to review' : 'Your expenses in review',
      value: visibleExpenses && expenses.loaded && !expenses.error ? waiting.length : '—',
      detail: 'Submitted, awaiting a decision',
      icon: 'receipt',
      tone: 'gold',
    },
    {
      label: 'Completed jobs',
      value: visibleJobs && jobs.loaded && !jobs.error ? jobs.items.length - active.length : '—',
      detail: 'Work marked complete',
      icon: 'check',
      tone: 'neutral',
    },
  ];
  return (
    <>
      <div className="stats-grid">
        {stats.map((stat) => (
          <section className={`stat-card ${stat.tone}`} key={stat.label}>
            <div className="stat-top">
              <h2>{stat.label}</h2>
              <span className="stat-icon">
                <Icon name={stat.icon} />
              </span>
            </div>
            <p className="stat-value">{stat.value}</p>
            <p className="stat-detail">{stat.detail}</p>
          </section>
        ))}
      </div>
      <div className="overview-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">NEXT UP</p>
              <h2>Work in motion</h2>
            </div>
            {visibleJobs && (
              <button className="text-button" onClick={() => onNavigate('work')}>
                All jobs <Icon name="arrow" size={14} />
              </button>
            )}
          </div>
          {!visibleJobs ? (
            <Empty title="Work is not available">
              This module is not enabled for your current access.
            </Empty>
          ) : jobs.error ? (
            <Problem message={jobs.error} onRetry={onRetry} />
          ) : !jobs.loaded ? (
            <p className="panel-loading" role="status">
              Loading jobs…
            </p>
          ) : !active.length ? (
            <Empty title="A little room to breathe">
              There are no open jobs in your current view.
            </Empty>
          ) : (
            <ul className="compact-job-list">
              {active.slice(0, 4).map((job, i) => (
                <li key={job.id}>
                  <button className="compact-job" onClick={() => onJob(job.id)}>
                    <span className="job-index">{String(i + 1).padStart(2, '0')}</span>
                    <span className="job-title-block">
                      <strong>{job.title}</strong>
                      <span>{job.customerName}</span>
                    </span>
                    <Status status={job.status} />
                    <Icon name="arrow" size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="action-panel">
          <span className="action-art" aria-hidden="true">
            <Icon name="flag" size={36} />
          </span>
          <p className="eyebrow">THE NEXT SMALL STEP</p>
          <h2>
            Keep the details <br />
            close to the work.
          </h2>
          <p>Start a job or capture an expense while it is still fresh.</p>
          <div className="quick-actions">
            {visibleJobs && workspace.permissions.includes('work.jobs.create') && (
              <button className="button primary" disabled={disabled} onClick={onNewJob}>
                <Icon name="plus" size={18} />
                Create a job
              </button>
            )}
            {visibleExpenses && workspace.permissions.includes('money.expenses.submit') && (
              <button className="button secondary" disabled={disabled} onClick={onExpense}>
                <Icon name="receipt" size={18} />
                Record an expense
              </button>
            )}
          </div>
        </section>
      </div>
      {visibleExpenses && (
        <section className="review-summary">
          <span className="review-summary-icon">
            <Icon name="receipt" size={24} />
          </span>
          <div>
            <h2>{reviewing ? 'A clear review trail.' : 'Your expenses stay visible.'}</h2>
            <p>
              {reviewing
                ? 'Review submissions with a missing receipt. Approval and actual reimbursement are separate steps.'
                : 'See whether each submission needs review, is approved, or is rejected. Approval is not reimbursement.'}
            </p>
          </div>
          <button className="button secondary" onClick={() => onNavigate('money')}>
            Open expenses
            <Icon name="arrow" size={16} />
          </button>
        </section>
      )}
      <div className="scope-note">
        <Icon name="info" size={18} />
        <p>
          <strong>This first slice covers jobs and expense review.</strong> Trips, time tracking,
          income, amounts due, reimbursements, receipts with uploads, Resources and CRM are recorded
          as future work.
        </p>
      </div>
    </>
  );
}

function JobList({
  jobs,
  workspace,
  onSelect,
  onRetry,
}: {
  jobs: Collection<Job>;
  workspace: Workspace;
  onSelect: (id: string) => void;
  onRetry: () => void;
}) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const rows = jobs.items.filter(
    (job) =>
      (filter === 'all' ||
        (filter === 'active' ? job.status !== 'completed' : job.status === 'completed')) &&
      `${job.title} ${job.customerName}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <section className="panel job-panel">
      <div className="list-toolbar">
        <div className="segmented" aria-label="Filter jobs">
          {[
            ['all', 'All jobs'],
            ['active', 'Open'],
            ['completed', 'Completed'],
          ].map(([value, label]) => (
            <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>
              {label}
            </button>
          ))}
        </div>
        <label className="search-field">
          <Icon name="search" size={18} />
          <span className="sr-only">Search jobs</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a job or customer"
          />
        </label>
      </div>
      {jobs.error ? (
        <Problem message={jobs.error} onRetry={onRetry} />
      ) : !jobs.loaded ? (
        <p className="panel-loading" role="status">
          Loading jobs…
        </p>
      ) : !rows.length ? (
        <Empty title={search || filter !== 'all' ? 'No matching jobs' : 'Your work starts here'}>
          {search || filter !== 'all'
            ? 'Try another search or choose All jobs.'
            : 'New jobs will appear here when they are created and assigned.'}
        </Empty>
      ) : (
        <>
          <div
            className={`job-table-head ${workspace.permissions.includes('work.prices.read') ? 'with-price' : ''}`}
            aria-hidden="true"
          >
            <span>JOB / CUSTOMER</span>
            <span>STATUS</span>
            {workspace.permissions.includes('work.prices.read') && <span>AGREED PRICE</span>}
            <span />
          </div>
          <ul className="job-list">
            {rows.map((job) => (
              <li key={job.id}>
                <button
                  className={`job-row ${workspace.permissions.includes('work.prices.read') ? 'with-price' : ''}`}
                  onClick={() => onSelect(job.id)}
                  data-testid="job-row"
                >
                  <span className="job-title-block">
                    <strong>{job.title}</strong>
                    <span>{job.customerName}</span>
                  </span>
                  <Status status={job.status} />
                  {workspace.permissions.includes('work.prices.read') && (
                    <span className="job-price">
                      {job.agreedPriceMinor === undefined
                        ? 'Not available'
                        : formatMoney(job.agreedPriceMinor, job.currency)}
                    </span>
                  )}
                  <Icon name="arrow" size={16} />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="panel-foot">
        {workspace.permissions.includes('work.jobs.create')
          ? 'Jobs visible to your business permissions.'
          : 'Showing jobs within your assigned access.'}
      </div>
    </section>
  );
}

function JobDetail({
  job,
  workspace,
  expenses,
  onBack,
  onClose,
  pending,
  error,
}: {
  job: Job;
  workspace: Workspace;
  expenses: Collection<Expense>;
  onBack: () => void;
  onClose: () => void;
  pending: boolean;
  error: string | null;
}) {
  const associated = expenses.items.filter((expense) => expense.jobId === job.id);
  const names = job.assignedUserIds.map((id) =>
    id === workspace.user.id
      ? `${workspace.user.name} (you)`
      : (workspace.members?.find((member) => member.id === id)?.name ?? 'Assigned team member'),
  );
  return (
    <>
      <button className="back-button" onClick={onBack}>
        <Icon name="back" size={16} />
        Back to jobs
      </button>
      <div className="detail-grid">
        <section className="panel detail-panel">
          <div className="detail-heading">
            <span className="detail-icon">
              <Icon name="work" size={28} />
            </span>
            <Status status={job.status} />
          </div>
          <h2>{job.title}</h2>
          <p className="detail-customer">{job.customerName}</p>
          <dl className="details">
            <div>
              <dt>Assigned to</dt>
              <dd>{names.length ? names.join(', ') : 'Unassigned'}</dd>
            </div>
            {workspace.permissions.includes('work.prices.read') && (
              <div>
                <dt>Agreed customer price</dt>
                <dd>
                  {job.agreedPriceMinor === undefined
                    ? 'Not available'
                    : formatMoney(job.agreedPriceMinor, job.currency)}
                </dd>
              </div>
            )}
          </dl>
          {error && <Problem message={error} />}
          {job.status === 'completed' ? (
            <div className="completion-note">
              <Icon name="check" />
              <p>
                This job is complete.
                <span>Expense review and payment records are handled separately.</span>
              </p>
            </div>
          ) : workspace.permissions.includes('work.jobs.close') ? (
            <div className="close-job">
              <p>Mark the assigned work complete when it is finished.</p>
              <button className="button primary" onClick={onClose} disabled={pending}>
                <Icon name="check" size={18} />
                {pending ? 'Saving…' : 'Complete job'}
              </button>
            </div>
          ) : (
            <p className="muted">Your current access does not include completing this job.</p>
          )}
        </section>
        <section className="panel detail-expenses">
          <div className="panel-heading">
            <h2>Related expenses</h2>
            <Icon name="receipt" />
          </div>
          {!workspace.permissions.includes('money.expenses.read') ? (
            <Empty title="Expenses are restricted" icon="receipt">
              Your current access does not include expense records.
            </Empty>
          ) : expenses.error ? (
            <Problem message={expenses.error} />
          ) : !associated.length ? (
            <Empty title="No visible expenses yet" icon="receipt">
              Linked expenses within your access will appear here.
            </Empty>
          ) : (
            <ul className="related-list">
              {associated.map((expense) => (
                <li key={expense.id}>
                  <div>
                    <strong>{expense.description}</strong>
                    <Status status={expense.status} />
                  </div>
                  <span>{formatMoney(expense.amountMinor, expense.currency)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="panel-foot">An approved expense is not a payment.</div>
        </section>
      </div>
    </>
  );
}

function ExpenseList({
  expenses,
  jobs,
  workspace,
  onReview,
  onRetry,
  disabled,
}: {
  expenses: Collection<Expense>;
  jobs: Job[];
  workspace: Workspace;
  onReview: (expense: Expense, decision: 'approve' | 'reject') => void;
  onRetry: () => void;
  disabled: boolean;
}) {
  const [filter, setFilter] = useState('all');
  const rows = expenses.items.filter((expense) => filter === 'all' || expense.status === filter);
  const reviewer = workspace.permissions.includes('money.expenses.review');
  return (
    <>
      <div className="money-explainer">
        <Icon name="info" />
        <p>
          <strong>Expense review, with a clear boundary.</strong> These submissions have no receipt
          attached. A reason and review are required. Approval does not reimburse the person who
          paid.
        </p>
      </div>
      <section className="panel">
        <div className="list-toolbar">
          <div className="segmented" aria-label="Filter expenses">
            {[
              ['all', 'All expenses'],
              ['submitted', 'Needs review'],
              ['approved', 'Approved'],
              ['rejected', 'Rejected'],
            ].map(([value, label]) => (
              <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>
                {label}
              </button>
            ))}
          </div>
          <span className="list-count">
            {expenses.loaded && !expenses.error
              ? `${rows.length} ${rows.length === 1 ? 'expense' : 'expenses'}`
              : ''}
          </span>
        </div>
        {expenses.error ? (
          <Problem message={expenses.error} onRetry={onRetry} />
        ) : !expenses.loaded ? (
          <p className="panel-loading" role="status">
            Loading expenses…
          </p>
        ) : !rows.length ? (
          <Empty
            title={filter === 'all' ? 'A clean start for your records' : 'Nothing in this view'}
            icon="receipt"
          >
            {filter === 'all'
              ? 'Capture a business expense and its missing-receipt reason to start the review trail.'
              : 'Choose another filter to see your expense records.'}
          </Empty>
        ) : (
          <ul className="expense-list">
            {rows.map((expense) => {
              const own = expense.payerUserId === workspace.user.id;
              const payerName = own
                ? `${workspace.user.name} (you)`
                : (workspace.members?.find((member) => member.id === expense.payerUserId)?.name ??
                  'Team member');
              return (
                <li key={expense.id} className="expense-card" data-testid="expense-row">
                  <div className="expense-main">
                    <span className="expense-icon">
                      <Icon name="receipt" size={22} />
                    </span>
                    <div className="expense-description">
                      <div className="expense-title">
                        <h2>{expense.description}</h2>
                        <Status status={expense.status} />
                      </div>
                      <p>
                        {expense.jobId
                          ? (jobs.find((job) => job.id === expense.jobId)?.title ?? 'Linked job')
                          : 'General business expense'}
                        <span className="separator">·</span>Paid by {payerName}
                      </p>
                    </div>
                    <strong className="expense-amount">
                      {formatMoney(expense.amountMinor, expense.currency)}
                    </strong>
                  </div>
                  <div className="receipt-reason">
                    <span>Missing receipt</span>
                    <p>{expense.missingReceiptReason || 'No reason returned by the API.'}</p>
                  </div>
                  {expense.reviewReason && (
                    <div className="review-note">
                      <strong>Review note</strong>
                      <p>{expense.reviewReason}</p>
                    </div>
                  )}
                  {reviewer &&
                    expense.status === 'submitted' &&
                    (own ? (
                      <p className="self-review-note">
                        Another authorized reviewer must review your submission.
                      </p>
                    ) : (
                      <div className="review-actions">
                        <span>Review the expense; no money will be sent.</span>
                        <button
                          className="button small secondary"
                          disabled={disabled}
                          onClick={() => onReview(expense, 'reject')}
                        >
                          Reject
                        </button>
                        <button
                          className="button small primary"
                          disabled={disabled}
                          onClick={() => onReview(expense, 'approve')}
                        >
                          <Icon name="check" size={16} />
                          Approve
                        </button>
                      </div>
                    ))}
                </li>
              );
            })}
          </ul>
        )}
        <div className="panel-foot">
          {reviewer
            ? 'Business submissions within your review permissions.'
            : 'Only your expense records are shown.'}
        </div>
      </section>
    </>
  );
}

function Dialog({
  title,
  subtitle,
  pending,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  pending: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="dialog-title"
      aria-describedby="dialog-description"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onClose();
      }}
    >
      <div className="dialog-heading">
        <div>
          <p className="eyebrow">BUSINESS SUITE / LOCAL DEMO</p>
          <h2 id="dialog-title">{title}</h2>
          <p id="dialog-description">{subtitle}</p>
        </div>
        <button
          className="icon-button"
          aria-label="Close dialog"
          disabled={pending}
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}

function JobForm({
  role,
  workspace,
  onClose,
  onSaved,
}: {
  role: DemoRole;
  workspace: Workspace;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState('');
  const [customer, setCustomer] = useState('');
  const [price, setPrice] = useState('');
  const [assigned, setAssigned] = useState<string[]>([]);
  const [validation, setValidation] = useState('');
  const command = useCommand(role, workspace.business.id);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (command.pending) return;
    const amount = parseMinor(price);
    if (!title.trim() || !customer.trim() || amount === null) {
      setValidation('Add a job title, customer and valid price with up to two decimal places.');
      return;
    }
    setValidation('');
    if (
      await command.run('/jobs', {
        title: title.trim(),
        customerName: customer.trim(),
        agreedPriceMinor: amount,
        currency: 'MXN',
        assignedUserIds: assigned,
      })
    )
      onSaved();
  }
  return (
    <Dialog
      title="Create a job"
      subtitle="Record the work and the amount agreed with the customer."
      pending={command.pending}
      onClose={onClose}
    >
      <form onSubmit={(event) => void submit(event)}>
        <div className="form-body">
          <label className="field">
            Job title
            <input
              autoFocus
              required
              maxLength={160}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Install storefront lettering"
            />
          </label>
          <label className="field">
            Customer name
            <input
              required
              maxLength={160}
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              placeholder="Business or customer"
            />
          </label>
          <label className="field">
            Agreed price (MXN)
            <input
              required
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
            />
            <span className="field-help">
              The agreed price stays separate from actual job costs.
            </span>
          </label>
          <fieldset>
            <legend>
              Assign people <span className="optional">optional</span>
            </legend>
            {workspace.members?.length ? (
              <div className="member-options">
                {workspace.members.map((member) => (
                  <label key={member.id} className="checkbox-option">
                    <input
                      type="checkbox"
                      checked={assigned.includes(member.id)}
                      onChange={(e) =>
                        setAssigned((current) =>
                          e.target.checked
                            ? [...current, member.id]
                            : current.filter((id) => id !== member.id),
                        )
                      }
                    />
                    <span>
                      {member.name}
                      {member.id === workspace.user.id ? ' (you)' : ''}
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="field-help">
                No assignable people were returned. The job will start unassigned.
              </p>
            )}
          </fieldset>
          {validation && <Problem message={validation} />}
          {command.error && <Problem message={command.error} />}
        </div>
        <div className="dialog-actions">
          <button
            type="button"
            className="button secondary"
            onClick={onClose}
            disabled={command.pending}
          >
            Cancel
          </button>
          <button className="button primary" disabled={command.pending}>
            {command.pending ? 'Creating…' : 'Create job'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function ExpenseForm({
  role,
  workspace,
  jobs,
  onClose,
  onSaved,
}: {
  role: DemoRole;
  workspace: Workspace;
  jobs: Job[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [jobId, setJobId] = useState('');
  const [reason, setReason] = useState('');
  const [validation, setValidation] = useState('');
  const command = useCommand(role, workspace.business.id);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (command.pending) return;
    const minor = parseMinor(amount);
    if (!description.trim() || minor === null || minor <= 0 || !reason.trim()) {
      setValidation(
        'Add a description, a business amount greater than zero, and the reason the receipt is missing.',
      );
      return;
    }
    setValidation('');
    if (
      await command.run('/expenses', {
        ...(jobId ? { jobId } : {}),
        description: description.trim(),
        amountMinor: minor,
        currency: 'MXN',
        missingReceiptReason: reason.trim(),
      })
    )
      onSaved();
  }
  return (
    <Dialog
      title="Record an expense"
      subtitle="Capture the business expense you paid. This submission will need review."
      pending={command.pending}
      onClose={onClose}
    >
      <form onSubmit={(event) => void submit(event)}>
        <div className="form-body">
          <div className="form-callout">
            <Icon name="info" size={18} />
            <p>
              Receipt uploads are not available in this slice. Use example information only; this
              demo does not record payments.
            </p>
          </div>
          <label className="field">
            Description
            <input
              autoFocus
              required
              maxLength={240}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Materials for installation"
            />
          </label>
          <div className="form-columns">
            <label className="field">
              Business amount (MXN)
              <input
                required
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
              <span className="field-help">Exclude personal portions.</span>
            </label>
            <div className="field">
              <span>Paid by</span>
              <div className="readonly-field">{workspace.user.name}</div>
              <span className="field-help">Set by your demo identity.</span>
            </div>
          </div>
          <label className="field">
            Related job <span className="optional">optional</span>
            <select value={jobId} onChange={(e) => setJobId(e.target.value)}>
              <option value="">General business expense</option>
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.title}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Why is the receipt missing?
            <textarea
              required
              rows={3}
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Add the context a reviewer will need."
            />
            <span className="field-help">
              A reason and manager review are always required without a receipt.
            </span>
          </label>
          {validation && <Problem message={validation} />}
          {command.error && <Problem message={command.error} />}
        </div>
        <div className="dialog-actions">
          <button
            type="button"
            className="button secondary"
            onClick={onClose}
            disabled={command.pending}
          >
            Cancel
          </button>
          <button className="button primary" disabled={command.pending}>
            {command.pending ? 'Submitting…' : 'Submit for review'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function ReviewForm({
  role,
  workspace,
  expense,
  decision,
  onClose,
  onSaved,
  onRefreshed,
}: {
  role: DemoRole;
  workspace: Workspace;
  expense: Expense;
  decision: 'approve' | 'reject';
  onClose: () => void;
  onSaved: () => void;
  onRefreshed: () => void;
}) {
  const [reason, setReason] = useState('');
  const [current, setCurrent] = useState<Expense | null>(expense);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshed, setRefreshed] = useState(false);
  const command = useCommand(role, workspace.business.id);
  const pending = command.pending || refreshing;
  const reviewable = current?.status === 'submitted';
  async function refreshExpense() {
    setRefreshing(true);
    setRefreshError(null);
    try {
      const response = await request<{ expenses: Expense[] }>('/expenses', role, {
        businessId: workspace.business.id,
      });
      const latest = response.expenses.find((item) => item.id === expense.id);
      setCurrent(latest ?? null);
      setRefreshed(true);
      command.clear();
      if (!latest)
        setRefreshError(
          'This expense is no longer available within your access. Your draft note is kept below.',
        );
      onRefreshed();
    } catch (error) {
      setRefreshError(errorMessage(error));
      if (error instanceof ApiError && [401, 403, 404].includes(error.status)) setCurrent(null);
    } finally {
      setRefreshing(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending || !current || !reviewable || command.conflict) return;
    if (
      await command.run(`/expenses/${current.id}/review`, {
        version: current.version,
        decision,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      })
    )
      onSaved();
  }
  return (
    <Dialog
      title={decision === 'approve' ? 'Approve this expense' : 'Reject this expense'}
      subtitle="Your decision updates the review record. It does not make a payment."
      pending={pending}
      onClose={onClose}
    >
      <form onSubmit={(event) => void submit(event)}>
        <div className="form-body">
          {current && (
            <>
              <div className="review-preview">
                <strong>{current.description}</strong>
                <span>{formatMoney(current.amountMinor, current.currency)}</span>
              </div>
              <div className="receipt-reason">
                <span>Missing receipt reason</span>
                <p>{current.missingReceiptReason}</p>
              </div>
            </>
          )}
          {refreshed && current && (
            <div className="form-callout" role="status">
              <Icon name="info" size={18} />
              <div>
                <Status status={current.status} />
                <p>
                  {reviewable
                    ? 'Latest details loaded. Review them before submitting your decision. Your draft note has been preserved.'
                    : `This expense is already ${labels[current.status].toLowerCase()}. Your draft note is kept below; another decision cannot be submitted.`}
                </p>
                {current.reviewReason && (
                  <p>
                    <strong>Recorded review note:</strong> {current.reviewReason}
                  </p>
                )}
              </div>
            </div>
          )}
          <label className="field">
            Review note <span className="optional">optional</span>
            <textarea
              autoFocus
              rows={3}
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Record any useful context for this decision."
            />
          </label>
          {command.error && <Problem message={command.error} />}
          {refreshError && <Problem message={refreshError} />}
          {(command.conflict || refreshError || refreshing) && (
            <button
              type="button"
              className="button secondary"
              disabled={pending}
              onClick={() => void refreshExpense()}
            >
              {refreshing ? 'Refreshing expense…' : 'Refresh expense'}
            </button>
          )}
        </div>
        <div className="dialog-actions">
          <button type="button" className="button secondary" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button
            className={`button ${decision === 'approve' ? 'primary' : 'danger'}`}
            disabled={pending || !reviewable || command.conflict}
          >
            {command.pending
              ? 'Saving decision…'
              : decision === 'approve'
                ? 'Approve expense'
                : 'Reject expense'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
