/**
 * Import of pipeline Projects (stored as `deals`) and Orders (stored as `projects`) from
 * spreadsheet files. Parsing and preview are pure; `deal.import` and `project.import`
 * validate every value again. An import never records a payment, an approval or a release.
 */
import type { Company, Contact, Stage, SuiteData, Workspace } from './types.js';
import {
  findCompany,
  findPerson,
  importKey,
  normalizeLead,
  type NormalizedLead,
} from './intake.js';

export type RecordImportKind = 'deals' | 'orders';
export const RECORD_IMPORT_FIELDS = [
  'title',
  'amount',
  'stage',
  'due',
  'notes',
  'customerName',
  'customerEmail',
  'customerPhone',
  'company',
] as const;
export type RecordImportField = (typeof RECORD_IMPORT_FIELDS)[number];
/** Orders are always created awaiting release, so they have no stage column. */
export const recordImportFields = (kind: RecordImportKind): RecordImportField[] =>
  RECORD_IMPORT_FIELDS.filter((f) => kind === 'deals' || f !== 'stage');
export const recordImportLabels = (kind: RecordImportKind): Record<RecordImportField, string> => ({
  title: kind === 'deals' ? 'Project title' : 'Order title',
  amount: kind === 'deals' ? 'Estimated value' : 'Agreed price',
  stage: 'Pipeline stage',
  due: kind === 'deals' ? 'Next follow-up date' : 'Due date',
  notes: 'Notes',
  customerName: 'Customer name',
  customerEmail: 'Customer email',
  customerPhone: 'Customer phone',
  company: 'Company name',
});

const ALIASES: Record<RecordImportField, string[]> = {
  title: [
    'title',
    'name',
    'dealname',
    'deal',
    'dealtitle',
    'opportunity',
    'opportunityname',
    'project',
    'projectname',
    'projecttitle',
    'order',
    'ordername',
    'ordertitle',
    'job',
    'jobname',
    'subject',
    'description',
    'titulo',
    'proyecto',
    'pedido',
    'orden',
    'trabajo',
    'descripcion',
    'concepto',
  ],
  amount: [
    'amount',
    'value',
    'dealvalue',
    'dealamount',
    'estimatedvalue',
    'price',
    'agreedprice',
    'agreedvalue',
    'total',
    'ordertotal',
    'grandtotal',
    'revenue',
    'budget',
    'monto',
    'importe',
    'valor',
    'precio',
    'presupuesto',
  ],
  stage: [
    'stage',
    'dealstage',
    'pipelinestage',
    'salesstage',
    'status',
    'etapa',
    'estado',
    'estatus',
    'fase',
  ],
  due: [
    'due',
    'duedate',
    'closedate',
    'expectedclosedate',
    'expectedclose',
    'followup',
    'followupdate',
    'nextfollowup',
    'deliverydate',
    'deadline',
    'date',
    'fecha',
    'fechadeentrega',
    'fechadecierre',
    'fechalimite',
    'entrega',
    'seguimiento',
  ],
  notes: ['notes', 'note', 'comments', 'comment', 'details', 'notas', 'nota', 'comentarios'],
  customerName: [
    'customername',
    'customer',
    'client',
    'clientname',
    'contact',
    'contactname',
    'contactperson',
    'person',
    'fullname',
    'cliente',
    'nombredelcliente',
    'contacto',
    'nombrecompleto',
  ],
  customerEmail: [
    'customeremail',
    'email',
    'emailaddress',
    'contactemail',
    'clientemail',
    'correo',
    'correoelectronico',
    'emaildelcliente',
  ],
  customerPhone: [
    'customerphone',
    'phone',
    'phonenumber',
    'mobile',
    'mobilephone',
    'contactphone',
    'clientphone',
    'telefono',
    'celular',
    'movil',
    'whatsapp',
  ],
  company: [
    'company',
    'companyname',
    'organization',
    'organizationname',
    'organisation',
    'account',
    'accountname',
    'business',
    'empresa',
    'compania',
    'organizacion',
    'razonsocial',
    'negocio',
  ],
};
const LOOKUP = new Map<string, RecordImportField>(
  (Object.entries(ALIASES) as [RecordImportField, string[]][]).flatMap(([field, names]) =>
    names.map((n) => [n, field] as const),
  ),
);
/** Suggests a field for each column; '' means ignore. Each field is used once. */
export function guessRecordMapping(
  headers: string[],
  kind: RecordImportKind,
): (RecordImportField | '')[] {
  const allowed = recordImportFields(kind);
  const used = new Set<RecordImportField>();
  return headers.map((h) => {
    const field =
      LOOKUP.get(importKey(h)) ?? RECORD_IMPORT_FIELDS.find((f) => importKey(f) === importKey(h));
    if (!field || used.has(field) || !allowed.includes(field)) return '';
    used.add(field);
    return field;
  });
}
/** One mapped row: field → raw text from the file. */
export type RecordInput = Partial<Record<RecordImportField, string>>;
export function mapRecordRows(
  table: string[][],
  mapping: (RecordImportField | '')[],
): RecordInput[] {
  return table.map((cells) => {
    const row: RecordInput = {};
    mapping.forEach((field, i) => {
      const value = cells[i]?.trim();
      if (field && value) row[field] = row[field] ? `${row[field]} ${value}` : value;
    });
    return row;
  });
}

const MAX_MINOR = 999999999999;
/**
 * Money text to integer minor units without floating point: "12500", "12,500.50",
 * "$1,200", "1200,5". Empty text is 0. Returns null for anything ambiguous or negative,
 * so a misread amount is reported instead of stored.
 */
export function parseImportAmount(input: string): number | null {
  const s = input
    .replace(/[\s ]/g, '')
    .replace(/^(mxn|usd|eur|mx\$|us\$|\$|€)/i, '')
    .replace(/(mxn|usd|eur|\$|€)$/i, '');
  if (!s) return input.trim() ? null : 0;
  const grouped = /^(\d{1,3}(?:,\d{3})+)(?:\.(\d{1,2}))?$/.exec(s);
  const plain = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  const decimalComma = /^(\d+),(\d{1,2})$/.exec(s);
  const match = grouped ?? plain ?? decimalComma;
  if (!match) return null;
  const whole = match[1]!.replaceAll(',', '');
  if (whole.length > 12) return null;
  const minor = Number(whole) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(minor) && minor <= MAX_MINOR ? minor : null;
}
export type DateOrder = 'dmy' | 'mdy';
/**
 * Calendar date to YYYY-MM-DD. ISO dates are always understood; 03/04/2026 is read with
 * the order the person chose, because the file cannot say which it means.
 */
export function parseImportDate(input: string, order: DateOrder = 'dmy'): string | null {
  const s = input.trim();
  if (!s) return '';
  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(s);
  const slashed = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (slashed) {
    y = Number(slashed[3]);
    [d, m] =
      order === 'dmy'
        ? [Number(slashed[1]), Number(slashed[2])]
        : [Number(slashed[2]), Number(slashed[1])];
  } else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d)
    return null;
  return date.toISOString().slice(0, 10);
}

/** What the import commands accept for one row. Amounts are integer minor units. */
export type RecordImportRow = {
  title: string;
  amountMinor: number;
  stage: string;
  due: string;
  notes: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  company: string;
};
const cut = (v: string | undefined, max: number) => (v ?? '').trim().slice(0, max);
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
export function normalizeRecordRow(
  raw: RecordInput,
  order: DateOrder = 'dmy',
): { record: RecordImportRow; error: string } {
  const amount = parseImportAmount(raw.amount ?? '');
  const due = parseImportDate(raw.due ?? '', order);
  const record: RecordImportRow = {
    title: cut(raw.title, 200),
    amountMinor: amount ?? 0,
    stage: cut(raw.stage, 120),
    due: due ?? '',
    notes: cut(raw.notes, 9000),
    customerName: cut(raw.customerName, 150),
    customerEmail: cut(raw.customerEmail, 254).toLowerCase(),
    customerPhone: cut(raw.customerPhone, 50),
    company: cut(raw.company, 200),
  };
  const error = !record.title
    ? 'Needs a title.'
    : amount === null
      ? `Amount "${cut(raw.amount, 30)}" is not a plain number such as 12500.50.`
      : due === null
        ? `Date "${cut(raw.due, 30)}" is not a calendar date.`
        : record.customerEmail && !EMAIL.test(record.customerEmail)
          ? 'Customer email is not valid.'
          : '';
  return { record, error };
}

/** Empty text means the first stage; otherwise the stage is matched by name or id. */
export function resolveImportStage(ws: Workspace, stage: string): Stage | undefined {
  if (!stage.trim()) return ws.stages[0];
  const k = importKey(stage);
  return ws.stages.find((s) => importKey(s.name) === k || s.id === stage.trim());
}
/**
 * Who a row's customer is. A person is matched by email, else by phone, else by exact
 * name, so importing the same file twice finds the same people. `contactId` is empty
 * when the customer does not exist yet or the row names only a company without a
 * primary contact.
 */
export function importCustomer(
  data: SuiteData,
  workspaceId: string,
  row: Pick<RecordImportRow, 'customerName' | 'customerEmail' | 'customerPhone' | 'company'>,
  kind: Contact['kind'],
): { status: 'none' | 'existing' | 'new'; contactId: string; lead: NormalizedLead } {
  const lead = normalizeLead(
    {
      name: row.customerName,
      email: row.customerEmail,
      phone: row.customerPhone,
      company: row.company,
    },
    kind,
  );
  if (!lead.person && !lead.company) return { status: 'none', contactId: '', lead };
  if (lead.person) {
    const hasDetails = !!lead.person.email || lead.person.phone.replace(/\D/g, '').length >= 7;
    const nameKey = importKey(lead.person.name);
    const known: Contact | undefined = hasDetails
      ? findPerson(data, workspaceId, lead.person)
      : data.contacts.find(
          (c) =>
            c.workspaceId === workspaceId &&
            !c.archived &&
            !!nameKey &&
            importKey(c.name) === nameKey,
        );
    return known
      ? { status: 'existing', contactId: known.id, lead }
      : { status: 'new', contactId: '', lead };
  }
  const company: Company | undefined = findCompany(data, workspaceId, lead.company!.name);
  return company
    ? { status: 'existing', contactId: company.primaryContactId || '', lead }
    : { status: 'new', contactId: '', lead };
}
/** The note kept on a record whose row named a company but no person. */
export const importCompanyNote = (name: string) => `Company: ${name}`;
/**
 * Same title for the same customer: the row is already here and is skipped. A row that
 * names only a company has no contact, so its company note tells such records apart.
 */
export function findImportedRecord<
  T extends {
    workspaceId: string;
    archived: boolean;
    title: string;
    contactId: string;
    notes: string;
  },
>(
  rows: T[],
  workspaceId: string,
  title: string,
  contactId: string,
  companyName = '',
): T | undefined {
  const k = importKey(title);
  const note = !contactId && companyName ? importCompanyNote(companyName) : '';
  return rows.find(
    (r) =>
      r.workspaceId === workspaceId &&
      !r.archived &&
      r.contactId === contactId &&
      importKey(r.title) === k &&
      (!note || r.notes.split('\n').includes(note)),
  );
}

export type RecordPreview = {
  row: number;
  record: RecordImportRow;
  status: 'new' | 'existing' | 'repeated';
  customer: 'none' | 'existing' | 'new';
  /** Deals only: the stage the row will land in. */
  stageName: string;
  error: string;
};
/** The same checks the import commands apply, so problems show before anything is sent. */
export function previewRecordImport(
  data: SuiteData,
  ws: Workspace,
  kind: RecordImportKind,
  rows: RecordInput[],
  order: DateOrder = 'dmy',
): RecordPreview[] {
  const seen = new Set<string>();
  const existing: {
    workspaceId: string;
    archived: boolean;
    title: string;
    contactId: string;
    notes: string;
  }[] = kind === 'deals' ? data.deals : data.projects;
  return rows.map((raw, index) => {
    const normalized = normalizeRecordRow(raw, order);
    const { record } = normalized;
    let { error } = normalized;
    const stage = kind === 'deals' ? resolveImportStage(ws, record.stage) : undefined;
    if (!error && kind === 'deals' && !stage)
      error = `Stage "${record.stage}" is not in this pipeline.`;
    const who = importCustomer(data, ws.id, record, kind === 'deals' ? 'lead' : 'customer');
    const identity = [
      importKey(record.title),
      record.customerEmail ||
        record.customerPhone.replace(/\D/g, '').slice(-10) ||
        importKey(record.customerName) ||
        importKey(record.company),
    ].join('|');
    const repeated = seen.has(identity);
    seen.add(identity);
    const here =
      who.status !== 'new' &&
      !!findImportedRecord(existing, ws.id, record.title, who.contactId, who.lead.company?.name);
    return {
      row: index + 1,
      record,
      status: here ? 'existing' : repeated ? 'repeated' : 'new',
      customer: who.status,
      stageName: stage?.name ?? '',
      error,
    };
  });
}
