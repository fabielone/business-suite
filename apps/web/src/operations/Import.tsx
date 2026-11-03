import { useMemo, useState } from 'react';
import {
  IMPORT_BATCH,
  IMPORT_FIELDS,
  IMPORT_FIELD_LABELS,
  guessMapping,
  mapRows,
  previewImport,
  readContactFile,
  csvCell,
  type Contact,
  type ImportField,
  type LeadInput,
} from '@suite/core/operations';
import { Badge, Button, Panel, Stats, Table } from './components';
import { download } from './client';
import type { PageProps } from './pages';

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 10000;
const TEMPLATE_FIELDS: ImportField[] = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'position',
  'company',
  'companyUrl',
  'companyPhone',
  'address',
  'city',
  'kind',
  'notes',
];
type Loaded = {
  name: string;
  format: 'CSV' | 'vCard';
  headers: string[];
  table: string[][];
  vcards: LeadInput[];
};

/** Excel on Windows still saves "CSV" as Windows-1252; UTF-8 decoding then shows �. */
async function decode(file: File) {
  const bytes = await file.arrayBuffer();
  const utf8 = new TextDecoder('utf-8').decode(bytes);
  return utf8.includes('�') ? new TextDecoder('windows-1252').decode(bytes) : utf8;
}

export function ContactImport(p: PageProps & { close: () => void }) {
  const [file, setFile] = useState<Loaded>();
  const [mapping, setMapping] = useState<(ImportField | '')[]>([]);
  const [kind, setKind] = useState<Contact['kind']>(
    p.ws.preset === 'referrals' ? 'candidate' : 'customer',
  );
  const [existing, setExisting] = useState<'skip' | 'update'>('skip');
  const [source, setSource] = useState('');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [busy, setBusy] = useState(false);

  const rows = useMemo(
    () => (file ? (file.format === 'vCard' ? file.vcards : mapRows(file.table, mapping)) : []),
    [file, mapping],
  );
  const preview = useMemo(
    () => previewImport(p.data, p.ws.id, rows, kind),
    [p.data, p.ws.id, rows, kind],
  );
  const valid = preview.filter((r) => !r.error);
  const errors = preview.filter((r) => r.error);
  const count = (f: (r: (typeof preview)[number]) => boolean) => valid.filter(f).length;

  async function load(f?: File) {
    setError('');
    setProgress('');
    if (!f) return;
    if (f.size > MAX_BYTES)
      return setError('Files up to 5 MB can be imported. Split larger lists.');
    if (/\.(xlsx?|numbers|ods)$/i.test(f.name))
      return setError(
        'Spreadsheet files cannot be read directly. In Excel, Google Sheets or Numbers choose File → Save as / Download → CSV, then import that file.',
      );
    const content = await decode(f);
    const read = readContactFile(f.name, content);
    const total = read.format === 'vCard' ? read.rows.length : read.table.length;
    if (!total) return setError('No rows were found. The first line must contain column names.');
    if (total > MAX_ROWS) return setError(`Import at most ${MAX_ROWS} rows per file.`);
    setFile({
      name: f.name,
      format: read.format,
      headers: read.headers,
      table: read.table,
      vcards: read.rows,
    });
    setMapping(guessMapping(read.headers));
    setSource(f.name.replace(/\.[^.]+$/, '').slice(0, 120));
  }

  async function submit() {
    setBusy(true);
    setError('');
    let done = 0;
    try {
      for (let start = 0; start < valid.length; start += IMPORT_BATCH) {
        const batch = valid.slice(start, start + IMPORT_BATCH);
        setProgress(`Importing rows ${start + 1}–${start + batch.length} of ${valid.length}…`);
        await p.run('contact.import', {
          rows: batch.map((r) => ({ ...rows[r.row - 1], row: r.row })),
          kind,
          existing,
          source: source.trim() || 'Import',
        });
        done += batch.length;
      }
      p.notify(`Imported ${valid.length} rows from ${file!.name}.`);
      p.close();
    } catch (e) {
      // Earlier batches are saved; say exactly how far it got.
      setError(
        `${(e as Error).message}${done ? ` The first ${done} rows were imported; importing the file again skips them.` : ''}`,
      );
      setProgress('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title="Import people and companies"
      action={
        <Button secondary icon="close" onClick={p.close}>
          Close
        </Button>
      }
    >
      <p className="op-caption">
        CSV or TSV from Excel, Google Sheets, HubSpot, Salesforce, Pipedrive, Zoho, Mailchimp,
        Google or Outlook Contacts, and vCard (.vcf) from phones, iCloud and Outlook. Columns are
        matched by name in English or Spanish; check them below. Rows with a company name create or
        link that company. People are matched by email, or by phone when there is no email.
      </p>
      <div className="op-backup-actions">
        <label className="op-upload">
          Choose file
          <input
            type="file"
            accept=".csv,.tsv,.txt,.vcf,.vcard,text/csv,text/tab-separated-values,text/vcard"
            onChange={(e) => {
              void load(e.target.files?.[0]);
              e.target.value = '';
            }}
            disabled={busy}
          />
        </label>
        <Button
          secondary
          icon="download"
          onClick={() =>
            download(
              'people-import-template.csv',
              TEMPLATE_FIELDS.map((f) => csvCell(IMPORT_FIELD_LABELS[f])).join(',') +
                '\r\nAna,Ruiz,ana@example.com,+52 55 0000 0000,Owner,Example Signs SA,example.com,,Calle 1,CDMX,customer,Met at expo\r\n',
              'text/csv',
            )
          }
        >
          CSV template
        </Button>
      </div>
      {error && (
        <p className="op-error" role="alert">
          {error}
        </p>
      )}
      {file && (
        <>
          <p className="op-caption">
            <strong>{file.name}</strong> · {file.format} · {rows.length} rows
          </p>
          {file.format === 'CSV' && (
            <details className="op-role-details" open>
              <summary>Columns</summary>
              <Table headings={['Column in file', 'Example', 'Import as']}>
                {file.headers.map((h, i) => (
                  <tr key={i}>
                    <td>
                      <strong>{h || `Column ${i + 1}`}</strong>
                    </td>
                    <td>
                      <small className="op-truncate">
                        {file.table.find((r) => r[i]?.trim())?.[i] ?? '—'}
                      </small>
                    </td>
                    <td>
                      <select
                        aria-label={`Import ${h} as`}
                        value={mapping[i] ?? ''}
                        onChange={(e) =>
                          setMapping((m) =>
                            m.map((v, j) =>
                              j === i
                                ? (e.target.value as ImportField | '')
                                : // One column per field; a newly chosen field moves here.
                                  v === e.target.value && e.target.value !== 'notes'
                                  ? ''
                                  : v,
                            ),
                          )
                        }
                      >
                        <option value="">Ignore</option>
                        {IMPORT_FIELDS.map((f) => (
                          <option key={f} value={f}>
                            {IMPORT_FIELD_LABELS[f]}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </Table>
            </details>
          )}
          <div className="op-form-grid">
            <label>
              Type for rows without one
              <select value={kind} onChange={(e) => setKind(e.target.value as Contact['kind'])}>
                {(['customer', 'supplier', 'candidate', 'employer', 'member'] as const).map((k) => (
                  <option key={k} value={k}>
                    {k[0]!.toUpperCase() + k.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              People and companies already here
              <select
                value={existing}
                onChange={(e) => setExisting(e.target.value as 'skip' | 'update')}
              >
                <option value="skip">Keep them unchanged</option>
                <option value="update">Update them with the file’s non-empty values</option>
              </select>
            </label>
            <label>
              Source
              <input value={source} maxLength={120} onChange={(e) => setSource(e.target.value)} />
            </label>
          </div>
          <Stats
            values={[
              { label: 'New people', value: count((r) => r.person === 'new' && !r.repeated) },
              {
                label: 'New companies',
                value: new Set(
                  valid
                    .filter((r) => r.company === 'new')
                    .map((r) => r.lead.company!.name.toLowerCase()),
                ).size,
              },
              {
                label: existing === 'skip' ? 'Already here (kept)' : 'Already here (updated)',
                value: count(
                  (r) =>
                    r.person === 'existing' ||
                    r.repeated ||
                    (r.person === 'none' && r.company === 'existing'),
                ),
              },
              { label: 'Rows with problems', value: errors.length },
            ]}
          />
          {errors.length > 0 && (
            <details className="op-role-details">
              <summary>{errors.length} rows will be left out</summary>
              <ul>
                {errors.slice(0, 100).map((r) => (
                  <li key={r.row}>
                    Row {r.row}: {r.error}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <Table headings={['Row', 'Person', 'Company', 'Contact', 'Status']}>
            {preview.slice(0, 25).map((r) => (
              <tr key={r.row}>
                <td>{r.row}</td>
                <td>
                  {r.lead.person?.name ?? '—'}
                  {r.lead.person?.position && <small>{r.lead.person.position}</small>}
                </td>
                <td>{r.lead.company?.name ?? '—'}</td>
                <td>
                  {r.lead.person?.email || r.lead.company?.email || '—'}
                  <small>{r.lead.person?.phone || r.lead.company?.phone}</small>
                </td>
                <td>
                  {r.error ? (
                    <Badge tone="danger">{r.error}</Badge>
                  ) : r.person === 'existing' || r.repeated ? (
                    <Badge tone="plain">{existing === 'skip' ? 'Already here' : 'Update'}</Badge>
                  ) : (
                    <Badge tone="good">New</Badge>
                  )}
                </td>
              </tr>
            ))}
          </Table>
          {preview.length > 25 && (
            <p className="op-caption">Showing the first 25 of {preview.length} rows.</p>
          )}
          <p className="op-caption">
            Imports do not start automations, so “person added” rules will not create tasks for
            every row. {progress}
          </p>
          <Button icon="upload" onClick={() => void submit()} disabled={busy || !valid.length}>
            {busy ? 'Importing…' : `Import ${valid.length} rows`}
          </Button>
        </>
      )}
    </Panel>
  );
}
