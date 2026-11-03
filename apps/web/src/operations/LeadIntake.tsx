import { useEffect, useState } from 'react';
import { api, API } from './client';
import { Badge, Button, Panel, Table } from './components';
import type { PageProps } from './pages';

type IntakeKey = {
  id: string;
  name: string;
  prefix: string;
  source: string;
  origins: string[];
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

/** Keys for website forms and sales channels; each can only add leads to this workspace. */
export function LeadIntake(p: PageProps & { example: boolean }) {
  const [keys, setKeys] = useState<IntakeKey[]>([]);
  const [name, setName] = useState('');
  const [origins, setOrigins] = useState('');
  const [created, setCreated] = useState<{ name: string; key: string }>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const endpoint = new URL(`${API}/v2/intake/${p.ws.id}/leads`, location.href).href;
  const load = () =>
    api<{ keys: IntakeKey[] }>(`/workspaces/${p.ws.id}/intake-keys`)
      .then((r) => setKeys(r.keys))
      .catch((e: Error) => setError(e.message));
  useEffect(() => {
    if (!p.example) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.ws.id, p.example]);

  async function create() {
    setBusy(true);
    setError('');
    try {
      const result = await api<{ name: string; key: string }>(
        `/workspaces/${p.ws.id}/intake-keys`,
        {
          name: name.trim(),
          origins: origins
            .split(/[\s,]+/)
            .map((o) => o.trim().replace(/\/$/, ''))
            .filter(Boolean),
        },
      );
      setCreated(result);
      setName('');
      setOrigins('');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const key = created?.key ?? 'sik_YOUR_KEY';
  const form = `<form action="${endpoint}" method="post">
  <input type="hidden" name="_key" value="${key}">
  <input type="hidden" name="_redirect" value="https://www.your-site.com/thanks">
  <input name="name" placeholder="Name" required>
  <input name="email" type="email" placeholder="Email">
  <input name="phone" placeholder="Phone">
  <input name="company" placeholder="Company">
  <textarea name="message" placeholder="How can we help?"></textarea>
  <!-- Leave hidden: bots fill it and their posts are discarded. -->
  <input name="_gotcha" tabindex="-1" autocomplete="off" style="display:none">
  <button>Send</button>
</form>`;
  const json = `curl -X POST '${endpoint}' \\
  -H 'Authorization: Bearer ${key}' \\
  -H 'Content-Type: application/json' \\
  -H 'Idempotency-Key: <your channel's lead ID>' \\
  -d '{"fields":{"firstName":"Ana","lastName":"Ruiz","email":"ana@example.com",
       "phone":"+52 55 0000 0000","company":"Example SA","message":"Quote please"},
       "projectTitle":"Storefront sign","estimatedValueMinor":250000}'`;

  return (
    <Panel title="Lead intake (forms and sales channels)">
      <p className="op-caption">
        Website forms, landing pages and tools such as Zapier, Make, ad lead forms or chat
        integrations can add people and companies here. Each key can only add leads to this
        workspace: it cannot read records, and it never changes a person or company already here
        (their message is added as a note). Optional <code>projectTitle</code> also opens a project
        in the first pipeline stage.
      </p>
      {p.example ? (
        <p className="op-caption">
          Intake keys need the shared server. The example workspace can try imports from People.
        </p>
      ) : (
        <>
          {keys.length > 0 && (
            <Table headings={['Name', 'Key', 'Websites', 'Last used', 'Actions']}>
              {keys.map((k) => (
                <tr key={k.id}>
                  <td>
                    <strong>{k.name}</strong>
                    <small>Source: {k.source}</small>
                  </td>
                  <td>
                    <code>{k.prefix}…</code>
                    {k.revokedAt && <Badge tone="danger">Revoked</Badge>}
                  </td>
                  <td>
                    <small>
                      {k.origins.length ? k.origins.join(', ') : 'Server-to-server only'}
                    </small>
                  </td>
                  <td>{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : 'Never'}</td>
                  <td>
                    {!k.revokedAt && (
                      <div className="op-row-actions">
                        <button
                          onClick={() =>
                            p.form({
                              title: `Revoke ${k.name}`,
                              description:
                                'Forms and channels using this key stop adding leads immediately. Leads already added stay.',
                              fields: [],
                              submitLabel: 'Revoke key',
                              submit: async () => {
                                await api(`/workspaces/${p.ws.id}/intake-keys/${k.id}/revoke`, {});
                                await load();
                              },
                            })
                          }
                        >
                          Revoke
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          )}
          <div className="op-form-grid">
            <label>
              Form or channel name
              <input
                value={name}
                maxLength={80}
                placeholder="Website contact form"
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Websites allowed to post from a browser · optional
              <input
                value={origins}
                placeholder="https://www.example.com"
                onChange={(e) => setOrigins(e.target.value)}
              />
            </label>
          </div>
          <p className="op-caption">
            A key in a web page is visible to visitors; listing your websites stops other sites from
            using it in a browser. Leave websites empty for server-to-server channels and keep that
            key secret.
          </p>
          <Button onClick={() => void create()} disabled={busy || !name.trim()}>
            Create intake key
          </Button>
          {error && (
            <p className="op-error" role="alert">
              {error}
            </p>
          )}
          {created && (
            <p className="op-caption" role="status">
              <strong>Copy this key now; it is not shown again:</strong> <code>{created.key}</code>
            </p>
          )}
          <details className="op-role-details">
            <summary>HTML form example</summary>
            <pre>{form}</pre>
          </details>
          <details className="op-role-details">
            <summary>JSON example (Zapier, Make, your own back end)</summary>
            <pre>{json}</pre>
          </details>
          <p className="op-caption">
            Accepted names include name, first_name, last_name, email, phone, company, position,
            website, message and their Spanish equivalents. Retrying with the same Idempotency-Key
            never adds the lead twice.
          </p>
        </>
      )}
    </Panel>
  );
}
