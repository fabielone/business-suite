import { useMemo, useState } from 'react';
import {
  IMPORT_BATCH,
  csvCell,
  guessRecordMapping,
  mapRecordRows,
  parseCsv,
  previewRecordImport,
  recordImportFields,
  recordImportLabels,
  type DateOrder,
  type RecordImportField,
  type RecordImportKind,
} from '@suite/core/operations';
import { Badge, Button, Panel, Stats, Table, formatMoney } from './components';
import { download } from './client';
import { decode } from './Import';
import type { PageProps } from './pages';

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 10000;
type Loaded = { name: string; headers: string[]; table: string[][] };
const TEMPLATE: Record<RecordImportKind, string> = {
  deals:
    'Project title,Estimated value,Pipeline stage,Next follow-up date,Customer name,Customer email,Customer phone,Company name,Notes\r\n' +
    'Lobby sign,12500.00,,2026-12-01,Ana Ruiz,ana@example.com,+52 55 0000 0000,Example Signs SA,Asked for a quote\r\n',
  orders:
    'Order title,Agreed price,Due date,Customer name,Customer email,Customer phone,Company name,Notes\r\n' +
    'Storefront letters,48000.00,2026-12-15,Ana Ruiz,ana@example.com,+52 55 0000 0000,Example Signs SA,Carried over from the old list\r\n',
};

/** Imports pipeline Projects (`deals`) or Orders from a CSV file, with a preview first. */
export function RecordImport(p: PageProps & { kind: RecordImportKind; close: () => void }) {
  const { kind } = p;
  const noun = kind === 'deals' ? 'projects' : 'orders';
  const labels = recordImportLabels(kind);
  const fields = recordImportFields(kind);
  const [file, setFile] = useState<Loaded>();
  const [mapping, setMapping] = useState<(RecordImportField | '')[]>([]);
  const [order, setOrder] = useState<DateOrder>('dmy');
  const [source, setSource] = useState('');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [busy, setBusy] = useState(false);

  const preview = useMemo(
    () =>
      file
        ? previewRecordImport(p.data, p.ws, kind, mapRecordRows(file.table, mapping), order)
        : [],
    [p.data, p.ws, kind, file, mapping, order],
  );
  const problems = preview.filter((r) => r.error);
  const fresh = preview.filter((r) => !r.error && r.status === 'new');
  const here = preview.filter((r) => !r.error && r.status !== 'new');
  const newCustomers = new Set(
    fresh
      .filter((r) => r.customer === 'new')
      .map(
        (r) =>
          r.record.customerEmail ||
          r.record.customerPhone ||
          r.record.customerName.toLowerCase() ||
          r.record.company.toLowerCase(),
      ),
  ).size;
  const total = fresh.reduce((sum, r) => sum + r.record.amountMinor, 0);
  const hasTitle = mapping.includes('title');

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
    const [headers = [], ...table] = parseCsv(await decode(f));
    if (!table.length)
      return setError('No rows were found. The first line must contain column names.');
    if (table.length > MAX_ROWS) return setError(`Import at most ${MAX_ROWS} rows per file.`);
    setFile({ name: f.name, headers, table });
    setMapping(guessRecordMapping(headers, kind));
    setSource(f.name.replace(/\.[^.]+$/, '').slice(0, 120));
  }

  async function submit() {
    setBusy(true);
    setError('');
    let done = 0;
    try {
      for (let start = 0; start < fresh.length; start += IMPORT_BATCH) {
        const batch = fresh.slice(start, start + IMPORT_BATCH);
        setProgress(`Importing rows ${start + 1}–${start + batch.length} of ${fresh.length}…`);
        await p.run(kind === 'deals' ? 'deal.import' : 'project.import', {
          rows: batch.map((r) => ({ ...r.record, row: r.row + 1 })),
          source: source.trim() || 'Import',
        });
        done += batch.length;
      }
      p.notify(`Imported ${fresh.length} ${noun} from ${file!.name}.`);
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
      title={kind === 'deals' ? 'Import projects into the pipeline' : 'Import orders'}
      action={
        <Button secondary icon="close" onClick={p.close}>
          Close
        </Button>
      }
    >
      <p className="op-caption">
        {kind === 'deals'
          ? 'One row per project, from a CSV or TSV file. Rows land in the pipeline stage named in the file, or in the first stage when none is given.'
          : 'One row per order, from a CSV or TSV file. Every imported order starts awaiting release; importing never records a deposit, a payment or a release.'}{' '}
        Amounts are read as {p.ws.currency}. Customers are matched by email, then phone, then exact
        name; a customer who is not here yet is added. Rows that are already here are left
        unchanged.
      </p>
      <div className="op-backup-actions">
        <label className="op-upload">
          Choose file
          <input
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
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
          onClick={() => download(`${noun}-import-template.csv`, TEMPLATE[kind], 'text/csv')}
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
            <strong>{file.name}</strong> · {file.table.length} rows
          </p>
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
                      aria-label={`Import ${h || `column ${i + 1}`} as`}
                      value={mapping[i] ?? ''}
                      onChange={(e) =>
                        setMapping((m) =>
                          m.map((v, j) =>
                            j === i
                              ? (e.target.value as RecordImportField | '')
                              : // One column per field; a newly chosen field moves here.
                                v === e.target.value && e.target.value !== 'notes'
                                ? ''
                                : v,
                          ),
                        )
                      }
                    >
                      <option value="">Ignore</option>
                      {fields.map((f) => (
                        <option key={f} value={f}>
                          {labels[f]}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </Table>
          </details>
          <div className="op-form-grid">
            <label>
              Dates written like 03/04/2026 mean
              <select value={order} onChange={(e) => setOrder(e.target.value as DateOrder)}>
                <option value="dmy">Day first (3 April)</option>
                <option value="mdy">Month first (4 March)</option>
              </select>
            </label>
            <label>
              Source
              <input value={source} maxLength={120} onChange={(e) => setSource(e.target.value)} />
            </label>
          </div>
          {!hasTitle && (
            <p className="op-error" role="alert">
              Choose which column holds the {labels.title.toLowerCase()}.
            </p>
          )}
          <Stats
            values={[
              { label: `New ${noun}`, value: fresh.length },
              { label: 'Their total value', value: formatMoney(total, p.ws.currency) },
              { label: 'New customers', value: newCustomers },
              { label: 'Already here or repeated', value: here.length },
              { label: 'Rows with problems', value: problems.length },
            ]}
          />
          {problems.length > 0 && hasTitle && (
            <details className="op-role-details">
              <summary>{problems.length} rows will be left out</summary>
              <ul>
                {problems.slice(0, 100).map((r) => (
                  <li key={r.row}>
                    Row {r.row + 1}: {r.error}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <Table
            headings={[
              'Row',
              kind === 'deals' ? 'Project' : 'Order',
              'Customer',
              labels.amount,
              kind === 'deals' ? 'Stage' : 'Due',
              'Status',
            ]}
          >
            {preview.slice(0, 25).map((r) => (
              <tr key={r.row}>
                <td>{r.row + 1}</td>
                <td>
                  {r.record.title || '—'}
                  {kind === 'deals' && r.record.due && <small>Follow up {r.record.due}</small>}
                </td>
                <td>
                  {r.record.customerName || r.record.company || r.record.customerEmail || '—'}
                  <small>
                    {r.customer === 'new'
                      ? 'Will be added'
                      : r.customer === 'existing'
                        ? 'Already here'
                        : ''}
                  </small>
                </td>
                <td>{formatMoney(r.record.amountMinor, p.ws.currency)}</td>
                <td>{kind === 'deals' ? r.stageName || '—' : r.record.due || '—'}</td>
                <td>
                  {r.error ? (
                    <>
                      <Badge tone="danger">Left out</Badge>
                      <small>{r.error}</small>
                    </>
                  ) : r.status === 'new' ? (
                    <Badge tone="good">New</Badge>
                  ) : (
                    <Badge tone="plain">
                      {r.status === 'repeated' ? 'Repeated in file' : 'Already here'}
                    </Badge>
                  )}
                </td>
              </tr>
            ))}
          </Table>
          {preview.length > 25 && (
            <p className="op-caption">Showing the first 25 of {preview.length} rows.</p>
          )}
          <p className="op-caption">
            Row numbers match the file, counting the heading line as row 1. Imports do not start
            automations. {progress}
          </p>
          <Button icon="upload" onClick={() => void submit()} disabled={busy || !fresh.length}>
            {busy ? 'Importing…' : `Import ${fresh.length} ${noun}`}
          </Button>
        </>
      )}
    </Panel>
  );
}
