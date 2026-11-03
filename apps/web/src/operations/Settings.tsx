import { useEffect, useState } from 'react';
import {
  PLANS,
  MODULES,
  PRESETS,
  ROLE_GRANTS,
  moneyInput,
  workspaceData,
  validateData,
  type Module,
  type Plan,
  type Stage,
  type SuiteData,
} from '@suite/core/operations';
import { api, download, updateSamples } from './client';
import { Badge, Button, PageTitle, Panel, Table, type FormSpec } from './components';
import type { PageProps } from './pages';
import { LeadIntake } from './LeadIntake';
import { TeamsSettings } from './TeamsSettings';

export function Settings(
  p: PageProps & {
    example: boolean;
    reload: () => Promise<void>;
    enableOffline: () => void;
    offlineReady: boolean;
    theme: 'system' | 'light' | 'dark';
    setTheme: (theme: 'system' | 'light' | 'dark') => void;
  },
) {
  const [name, setName] = useState(p.ws.name);
  const [plan, setPlan] = useState<Plan>(p.ws.plan);
  const [modules, setModules] = useState<Module[]>(p.ws.modules);
  const [budget, setBudget] = useState((p.ws.monthlyBudgetMinor / 100).toFixed(2));
  const [categories, setCategories] = useState(p.ws.categories.join('\n'));
  const [stages, setStages] = useState<Stage[]>(p.ws.stages);
  const [referralStages, setReferralStages] = useState(p.ws.referralStages.join('\n'));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [members, setMembers] = useState<
    { id: string; email: string; name: string; role: string; active: boolean }[]
  >([]);
  const [invite, setInvite] = useState('');
  const manage = p.grants.includes('workspace.manage');
  useEffect(() => {
    if (!p.example && p.grants.includes('members.manage'))
      void api<{ members: typeof members }>(`/workspaces/${p.ws.id}/members`)
        .then((r) => setMembers(r.members))
        .catch((e) => setError(e.message));
  }, [p.ws.id, p.example]);
  async function save() {
    setBusy(true);
    setError('');
    try {
      await p.run('workspace.settings', {
        name,
        plan,
        modules,
        monthlyBudgetMinor: moneyInput(budget),
        categories: categories
          .split('\n')
          .map((v) => v.trim())
          .filter(Boolean),
        stages,
        referralStages: referralStages
          .split('\n')
          .map((v) => v.trim())
          .filter(Boolean),
      });
      p.notify('Workspace settings saved. Existing records are preserved.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const newInvite = () =>
    p.form({
      title: 'Invite a member',
      description:
        'Creates a private, seven-day activation link for this email. Nothing is emailed automatically. Share the link only with the intended person.',
      fields: [
        { name: 'email', label: 'Email', type: 'email', required: true },
        {
          name: 'role',
          label: 'Role',
          type: 'select',
          options: Object.keys(ROLE_GRANTS)
            .filter((r) => r !== 'owner')
            .map((r) => ({ value: r, label: r })),
        },
      ],
      submit: async (values) => {
        const result = await api<{ token: string; activationUrl?: string }>(
          `/workspaces/${p.ws.id}/invitations`,
          values,
        );
        setInvite(
          result.activationUrl ??
            `${location.origin}${location.pathname}#activate=${encodeURIComponent(result.token)}`,
        );
      },
    });
  const exportBackup = async () => {
    try {
      const backup = p.example
        ? {
            format: 'business-suite-backup',
            version: 1,
            exportedAt: new Date().toISOString(),
            data: workspaceData(p.data, p.ws),
          }
        : await api(`/workspaces/${p.ws.id}/backup`);
      download(
        `${p.ws.name}-backup-${new Date().toISOString().slice(0, 10)}.json`,
        JSON.stringify(backup, null, 2),
        'application/json',
      );
      p.notify('Backup downloaded. Keep it private; it contains workspace records and receipts.');
    } catch (e) {
      setError((e as Error).message);
    }
  };
  async function restore(file?: File) {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      if (file.size > 30 * 1024 * 1024) throw new Error('Choose a Suite backup under 30 MB.');
      const parsed = JSON.parse(await file.text());
      if (parsed.format !== 'business-suite-backup' || parsed.version !== 1)
        throw new Error('This is not a supported Business Suite backup.');
      const data = validateData(parsed.data);
      if (data.workspaces.length !== 1) throw new Error('Restore one workspace at a time.');
      p.form({
        title: 'Restore as a separate workspace',
        description: `Restore “${data.workspaces[0]!.name}” with ${data.contacts.length} contacts, ${data.expenses.length} expenses and ${data.payments.length} payments. Existing workspaces will not be changed. Account invitations are not restored.`,
        fields: [],
        submitLabel: 'Restore copy',
        submit: async () => {
          const newId = crypto.randomUUID();
          if (p.example) {
            await updateSamples((current) => {
              const ids = new Map<string, string>();
              for (const key of [
                'contacts',
                'deals',
                'projects',
                'expenses',
                'payments',
                'tasks',
                'referrals',
                'templates',
                'drafts',
              ] as const)
                for (const row of data[key]) ids.set(row.id, crypto.randomUUID());
              const rewrite = (value: unknown): unknown => {
                if (Array.isArray(value)) return value.map(rewrite);
                if (value && typeof value === 'object')
                  return Object.fromEntries(
                    Object.entries(value).map(([k, v]) => [
                      k,
                      k === 'workspaceId' ? newId : rewrite(v),
                    ]),
                  );
                if (typeof value === 'string') return ids.get(value) ?? value;
                return value;
              };
              const imported = rewrite(data) as SuiteData;
              imported.workspaces[0] = {
                ...data.workspaces[0]!,
                id: newId,
                name: data.workspaces[0]!.name + ' (restored)',
                sample: true,
              };
              const next = {
                ...current,
                revision: current.revision + 1,
                workspaces: [...current.workspaces, ...imported.workspaces],
              };
              for (const key of [
                'contacts',
                'deals',
                'projects',
                'expenses',
                'payments',
                'tasks',
                'referrals',
                'templates',
                'drafts',
              ] as const)
                (next[key] as unknown[]) = [...current[key], ...imported[key]];
              return validateData(next);
            });
          } else await api('/workspaces/restore', { data, id: newId });
          await p.reload();
          p.notify('Backup restored into a separate workspace.');
        },
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        title="Settings"
        description="Workspace name, modules, labels, members and this device. Existing records are preserved when settings change."
      />
      <Panel title="Appearance">
        <div className="op-theme-options" role="group" aria-label="Theme">
          {(['system', 'light', 'dark'] as const).map((t) => (
            <button key={t} aria-pressed={p.theme === t} onClick={() => p.setTheme(t)}>
              {t === 'system' ? 'Match device' : t === 'light' ? 'Light' : 'Dark'}
            </button>
          ))}
        </div>
        <p className="op-caption">Applies to this device only.</p>
      </Panel>
      <Panel title="Workspace">
        <div className="op-form-grid">
          <label>
            Workspace name
            <input
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
              disabled={!manage}
            />
          </label>
          <label>
            Template
            <input value={PRESETS[p.ws.preset].name} readOnly />
            <small>
              Templates set defaults. This workspace’s financial model stays fixed to protect
              existing records.
            </small>
          </label>
          <label>
            Plan configuration
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value as Plan)}
              disabled={!manage || (!p.example && !p.grants.includes('members.manage'))}
            >
              {Object.entries(PLANS).map(([key, value]) => (
                <option value={key} key={key}>
                  {value.name}
                </option>
              ))}
            </select>
            <small>
              Entitlement configuration only. No subscription charge or paid billing is active.
            </small>
          </label>
          <label>
            Currency
            <input value={p.ws.currency} readOnly />
            <small>
              Create a separate workspace for another currency; recorded amounts are never silently
              converted.
            </small>
          </label>
        </div>
        <div className="op-module-options">
          {MODULES.map((m) => (
            <label key={m}>
              <input
                type="checkbox"
                checked={modules.includes(m)}
                disabled={!manage || (!PLANS[plan].modules.includes(m) && !modules.includes(m))}
                onChange={(e) =>
                  setModules((v) => (e.target.checked ? [...v, m] : v.filter((x) => x !== m)))
                }
              />
              <span>
                <strong>
                  {m === 'chores'
                    ? 'Tasks and chores'
                    : m === 'crm'
                      ? 'CRM'
                      : m[0]!.toUpperCase() + m.slice(1)}
                </strong>
                <small>
                  {PLANS[plan].modules.includes(m)
                    ? 'Available in this plan'
                    : 'Not included in selected plan'}
                </small>
              </span>
            </label>
          ))}
        </div>
        <p className="op-caption">
          Disabling a module hides its screens and prevents new changes. Its records remain in the
          workspace and reappear when re-enabled. Downgrades refuse incompatible enabled modules.
        </p>
      </Panel>
      {p.ws.preset === 'household' && (
        <Panel title="Household contributions">
          <label className="op-field">
            Monthly shared budget ({p.ws.currency})
            <input
              inputMode="decimal"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              disabled={!manage}
            />
          </label>
          <p className="op-caption">
            Contribution targets use each member’s weight in People. Set all weights to 1 for equal
            targets. An expense can use equal or weighted shares independently. Historical splits
            never change when weights change.
          </p>
        </Panel>
      )}
      {p.ws.preset !== 'household' && p.ws.modules.includes('chores') && <TeamsSettings {...p} />}
      <Panel title="Labels and stages">
        <div className="op-form-grid">
          <label>
            Expense categories · one per line
            <textarea
              value={categories}
              rows={7}
              onChange={(e) => setCategories(e.target.value)}
              disabled={!manage}
            />
          </label>
          <label>
            Referral stages · one per line
            <textarea
              value={referralStages}
              rows={7}
              onChange={(e) => setReferralStages(e.target.value)}
              disabled={!manage}
            />
          </label>
        </div>
        <h3 className="op-section-label">CRM pipeline</h3>
        <div className="op-stage-settings">
          {stages.map((s, i) => (
            <div key={s.id}>
              <label>
                <span className="sr-only">Stage {i + 1} name</span>
                <input
                  value={s.name}
                  disabled={!manage}
                  onChange={(e) =>
                    setStages((v) =>
                      v.map((x) => (x.id === s.id ? { ...x, name: e.target.value } : x)),
                    )
                  }
                />
              </label>
              <label>
                <span className="sr-only">Stage {i + 1} outcome</span>
                <select
                  value={s.outcome}
                  disabled={!manage}
                  onChange={(e) =>
                    setStages((v) =>
                      v.map((x) =>
                        x.id === s.id
                          ? {
                              ...x,
                              outcome: e.target.value as Stage['outcome'],
                            }
                          : x,
                      ),
                    )
                  }
                >
                  <option value="open">Open</option>
                  <option value="won">Won</option>
                  <option value="lost">Lost</option>
                </select>
              </label>
              {manage && (
                <button
                  type="button"
                  className="op-text-button"
                  onClick={() => setStages((v) => v.filter((x) => x.id !== s.id))}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
        {manage && (
          <Button
            secondary
            onClick={() =>
              setStages((v) => [
                ...v,
                { id: crypto.randomUUID(), name: 'New stage', outcome: 'open' },
              ])
            }
          >
            Add stage
          </Button>
        )}
        <p className="op-caption">
          Move existing records before removing a stage. Renaming a CRM stage preserves its stable
          ID and existing projects.
        </p>
      </Panel>
      {error && (
        <p role="alert" className="op-error">
          {error}
        </p>
      )}
      {manage && (
        <div className="op-save-settings">
          <Button onClick={() => void save()} disabled={busy}>
            {busy ? 'Saving…' : 'Save settings'}
          </Button>
        </div>
      )}
      <Panel
        title="Accounts & access"
        action={
          !p.example &&
          p.grants.includes('members.manage') && (
            <Button secondary onClick={newInvite}>
              Invite member
            </Button>
          )
        }
      >
        {p.example ? (
          <p className="op-caption">
            Example workspaces are local to this browser. Sign in to create shared workspaces and
            invite real accounts.
          </p>
        ) : !p.grants.includes('members.manage') ? (
          <p className="op-caption">The workspace owner manages invitations and roles.</p>
        ) : (
          <>
            {invite && (
              <label className="op-field">
                Private invitation link · not emailed
                <textarea readOnly value={invite} rows={3} />
                <small>Expires in seven days. Share only with the invited person.</small>
              </label>
            )}
            <Table headings={['Person', 'Email', 'Role', 'Access']}>
              {members.map((m) => (
                <tr key={m.id}>
                  <td>{m.name}</td>
                  <td>{m.email}</td>
                  <td>
                    {m.role === 'owner' ? (
                      'Owner'
                    ) : (
                      <select
                        aria-label={`Role for ${m.name}`}
                        value={m.role}
                        onChange={async (e) => {
                          try {
                            const role = e.target.value;
                            await api(`/workspaces/${p.ws.id}/members`, {
                              id: m.id,
                              role,
                              active: m.active,
                            });
                            setMembers((v) => v.map((x) => (x.id === m.id ? { ...x, role } : x)));
                          } catch (e) {
                            setError((e as Error).message);
                          }
                        }}
                      >
                        {Object.keys(ROLE_GRANTS)
                          .filter((r) => r !== 'owner')
                          .map((r) => (
                            <option value={r} key={r}>
                              {r}
                            </option>
                          ))}
                      </select>
                    )}
                  </td>
                  <td>
                    {m.role === 'owner' ? (
                      <Badge tone="good">Owner</Badge>
                    ) : (
                      <button
                        className={m.active ? 'op-text-button danger' : 'op-text-button'}
                        onClick={async () => {
                          try {
                            await api(`/workspaces/${p.ws.id}/members`, {
                              id: m.id,
                              role: m.role,
                              active: !m.active,
                            });
                            setMembers((v) =>
                              v.map((x) => (x.id === m.id ? { ...x, active: !x.active } : x)),
                            );
                          } catch (e) {
                            setError((e as Error).message);
                          }
                        }}
                      >
                        {m.active ? 'Revoke access' : 'Restore access'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          </>
        )}
        <details className="op-role-details">
          <summary>What each role can do</summary>
          <dl>
            {Object.entries(ROLE_GRANTS).map(([role, grants]) => (
              <div key={role}>
                <dt>{role}</dt>
                <dd>{grants.join(', ')}</dd>
              </div>
            ))}
          </dl>
        </details>
      </Panel>
      {manage && p.ws.preset !== 'household' && <LeadIntake {...p} />}
      <Panel title="Archived records">
        <p className="op-caption">
          Restore archived people, work, tasks and referral records. Enable their module first if it
          is disabled.
        </p>
        <div className="op-list">
          {(
            [
              'contacts',
              'companies',
              'deals',
              'projects',
              'tasks',
              'referrals',
              'templates',
              'drafts',
            ] as const
          ).flatMap((collection) =>
            (p.data[collection] ?? [])
              .filter((row) => row.workspaceId === p.ws.id && row.archived)
              .map((row) => (
                <div key={row.id}>
                  <span>
                    <strong>
                      {'name' in row
                        ? row.name
                        : 'title' in row
                          ? row.title
                          : 'subject' in row
                            ? row.subject
                            : row.role}
                    </strong>
                    <small>{collection}</small>
                  </span>
                  <Button
                    secondary
                    onClick={() =>
                      p.form({
                        title: 'Restore archived record',
                        fields: [],
                        submitLabel: 'Restore record',
                        submit: (_values, key) =>
                          p.run('record.restore', { collection, id: row.id }, key),
                      })
                    }
                  >
                    Restore
                  </Button>
                </div>
              )),
          )}
        </div>
      </Panel>
      <Panel title="Offline access and backups">
        <p className="op-caption">
          Offline access keeps an encrypted copy of this workspace and any pending changes on this
          device, protected by a separate device passphrase. If that passphrase is lost, unsynced
          work cannot be recovered. Signing out locks the local copy.
        </p>
        {!p.example && (
          <Button secondary onClick={p.enableOffline}>
            {p.offlineReady ? 'Offline storage is unlocked' : 'Enable or unlock offline storage'}
          </Button>
        )}
        <div className="op-backup-actions">
          {p.grants.includes('backup.export') && (
            <Button secondary onClick={() => void exportBackup()}>
              Download workspace backup
            </Button>
          )}
          {p.grants.includes('workspace.manage') && (
            <label className="op-upload">
              Restore backup as a new workspace
              <input
                type="file"
                accept="application/json,.json"
                onChange={(e) => {
                  void restore(e.target.files?.[0]);
                  e.target.value = '';
                }}
                disabled={busy}
              />
            </label>
          )}
        </div>
        <p className="op-caption">
          Backups contain private records and receipt files. Keep them in protected storage.
          Restoring creates a new workspace and never overwrites the original.
        </p>
      </Panel>
    </>
  );
}
