/**
 * Lead intake and contact import: turns loosely shaped form posts, CSV/TSV exports and vCards
 * into Person and Company fields. Parsing is pure; the commands still validate every value.
 */
import type { Company, Contact, SuiteData } from './types.js';

export const IMPORT_FIELDS = [
  'name',
  'firstName',
  'lastName',
  'email',
  'phone',
  'position',
  'kind',
  'url',
  'notes',
  'source',
  'company',
  'companyEmail',
  'companyPhone',
  'companyUrl',
  'address',
  'city',
  'state',
  'postalCode',
  'country',
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  name: 'Full name',
  firstName: 'First name',
  lastName: 'Last name',
  email: 'Email',
  phone: 'Phone',
  position: 'Position',
  kind: 'Type',
  url: 'Person website / profile',
  notes: 'Notes / message',
  source: 'Source',
  company: 'Company name',
  companyEmail: 'Company email',
  companyPhone: 'Company phone',
  companyUrl: 'Company website',
  address: 'Company address',
  city: 'City',
  state: 'State / region',
  postalCode: 'Postal code',
  country: 'Country',
};
/** One mapped row: field → raw text. Unknown keys are ignored. */
export type LeadInput = Partial<Record<ImportField, string>>;
/** What `lead.capture` and `contact.import` store; `person` is absent for company-only rows. */
export type NormalizedLead = {
  person?: {
    name: string;
    email: string;
    phone: string;
    position: string;
    url: string;
    kind: Contact['kind'];
  };
  company?: {
    name: string;
    email: string;
    phone: string;
    url: string;
    address: string;
  };
  notes: string;
  source: string;
};

const key = (header: string) =>
  header
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
/**
 * Column names used by common exports: HubSpot, Salesforce, Pipedrive, Zoho, Google Contacts,
 * Outlook, Mailchimp, Typeform/Google Forms and Spanish-language spreadsheets.
 */
const ALIASES: Record<ImportField, string[]> = {
  name: [
    'name',
    'fullname',
    'contactname',
    'displayname',
    'contact',
    'person',
    'nombrecompleto',
    'leadname',
  ],
  firstName: ['firstname', 'givenname', 'first', 'fname', 'nombre', 'nombres'],
  lastName: ['lastname', 'familyname', 'surname', 'last', 'lname', 'apellido', 'apellidos'],
  email: [
    'email',
    'emailaddress',
    'email1value',
    'email1',
    'emailaddress1',
    'primaryemail',
    'workemail',
    'businessemail',
    'mail',
    'correo',
    'correoelectronico',
    'personemail',
  ],
  phone: [
    'phone',
    'phonenumber',
    'telephone',
    'tel',
    'mobile',
    'mobilephone',
    'mobilephonenumber',
    'cellphone',
    'cell',
    'phone1value',
    'primaryphone',
    'workphone',
    'businessphone',
    'whatsapp',
    'telefono',
    'celular',
    'movil',
    'personphone',
  ],
  position: ['title', 'jobtitle', 'position', 'role', 'organization1title', 'puesto', 'cargo'],
  kind: ['type', 'contacttype', 'kind', 'category', 'tipo', 'lifecyclestage'],
  url: ['linkedin', 'linkedinurl', 'profile', 'profileurl', 'personalwebsite', 'personurl'],
  notes: [
    'notes',
    'note',
    'comments',
    'comment',
    'message',
    'description',
    'mensaje',
    'comentarios',
    'notas',
  ],
  source: [
    'source',
    'leadsource',
    'origin',
    'originalsource',
    'channel',
    'fuente',
    'origen',
    'canal',
  ],
  company: [
    'company',
    'companyname',
    'account',
    'accountname',
    'organization',
    'organisation',
    'organizationname',
    'organization1name',
    'org',
    'business',
    'businessname',
    'empresa',
    'razonsocial',
    'compania',
  ],
  companyEmail: ['companyemail', 'accountemail', 'correoempresa'],
  companyPhone: ['companyphone', 'accountphone', 'mainphone', 'officephone', 'telefonoempresa'],
  companyUrl: [
    'website',
    'websiteurl',
    'companywebsite',
    'companydomainname',
    'domain',
    'web',
    'url',
    'sitioweb',
    'paginaweb',
  ],
  address: [
    'address',
    'streetaddress',
    'street',
    'businessstreet',
    'address1',
    'address1street',
    'address1formatted',
    'billingstreet',
    'mailingstreet',
    'direccion',
    'calle',
  ],
  city: [
    'city',
    'businesscity',
    'address1city',
    'billingcity',
    'mailingcity',
    'ciudad',
    'municipio',
  ],
  state: [
    'state',
    'region',
    'province',
    'businessstate',
    'address1region',
    'billingstate',
    'estado',
  ],
  postalCode: [
    'postalcode',
    'zip',
    'zipcode',
    'postcode',
    'businesspostalcode',
    'address1postalcode',
    'billingpostalcode',
    'codigopostal',
    'cp',
  ],
  country: [
    'country',
    'businesscountry',
    'address1country',
    'billingcountry',
    'pais',
    'countryregion',
  ],
};
const LOOKUP = new Map<string, ImportField>(
  (Object.entries(ALIASES) as [ImportField, string[]][]).flatMap(([field, names]) =>
    names.map((n) => [n, field] as const),
  ),
);
/** Suggests a field for each column; '' means ignore. Each field is used once. */
export function guessMapping(headers: string[]): (ImportField | '')[] {
  const used = new Set<ImportField>();
  return headers.map((h) => {
    const field =
      LOOKUP.get(key(h)) ?? (IMPORT_FIELDS as readonly string[]).find((f) => key(f) === key(h));
    if (!field || used.has(field as ImportField)) return '';
    used.add(field as ImportField);
    return field as ImportField;
  });
}

/** RFC 4180 CSV with comma, semicolon or tab detected from the header line. */
export function parseCsv(input: string): string[][] {
  const textValue = input.replace(/^﻿/, '');
  const firstLine = textValue.slice(0, textValue.search(/\r?\n|$/));
  const outside = firstLine.replace(/"[^"]*"/g, '');
  const delimiter = ['\t', ';', ','].reduce((best, d) =>
    outside.split(d).length > outside.split(best).length ? d : best,
  );
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < textValue.length; i++) {
    const ch = textValue[i]!;
    if (quoted) {
      if (ch === '"' && textValue[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && textValue[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** vCard 2.1/3.0/4.0 (phone address books, Google, Outlook, iCloud) as mapped rows. */
export function parseVCards(input: string): LeadInput[] {
  const lines = input
    .replace(/^﻿/, '')
    .replace(/\r?\n[ \t]/g, '')
    .split(/\r?\n/);
  const unescape = (v: string) =>
    v
      .replace(/\\n/gi, '\n')
      .replace(/\\([,;\\])/g, '$1')
      .trim();
  const cards: LeadInput[] = [];
  let card: LeadInput | undefined;
  for (const line of lines) {
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const [rawName] = line.slice(0, colon).split(';');
    const name = rawName!.replace(/^item\d+\./i, '').toUpperCase();
    const value = line.slice(colon + 1);
    if (name === 'BEGIN' && value.toUpperCase() === 'VCARD') card = {};
    else if (name === 'END' && card) {
      cards.push(card);
      card = undefined;
    } else if (card) {
      const parts = value.split(/(?<!\\);/).map(unescape);
      if (name === 'FN') card.name ??= unescape(value);
      else if (name === 'N') {
        card.lastName ??= parts[0];
        card.firstName ??= [parts[1], parts[2]].filter(Boolean).join(' ');
      } else if (name === 'EMAIL') card.email ??= unescape(value);
      else if (name === 'TEL') card.phone ??= unescape(value).replace(/^tel:/i, '');
      else if (name === 'ORG') card.company ??= parts[0];
      else if (name === 'TITLE') card.position ??= unescape(value);
      else if (name === 'URL') card.companyUrl ??= unescape(value);
      else if (name === 'NOTE') card.notes ??= unescape(value);
      else if (name === 'ADR') {
        // PO box; extended; street; city; region; postal code; country
        card.address ??= [parts[0], parts[1], parts[2]].filter(Boolean).join(' ');
        card.city ??= parts[3];
        card.state ??= parts[4];
        card.postalCode ??= parts[5];
        card.country ??= parts[6];
      }
    }
  }
  return cards;
}

/** Reads CSV, TSV or vCard text into column headers and mapped rows. */
export function readContactFile(fileName: string, content: string) {
  if (/\.vcf$|\.vcard$/i.test(fileName) || /^\s*BEGIN:VCARD/i.test(content.replace(/^﻿/, ''))) {
    const rows = parseVCards(content);
    return { format: 'vCard' as const, headers: [] as string[], table: [] as string[][], rows };
  }
  const [headers = [], ...table] = parseCsv(content);
  return { format: 'CSV' as const, headers, table, rows: [] as LeadInput[] };
}
export function mapRows(table: string[][], mapping: (ImportField | '')[]): LeadInput[] {
  return table.map((cells) => {
    const row: LeadInput = {};
    mapping.forEach((field, i) => {
      const value = cells[i]?.trim();
      if (field && value) row[field] = row[field] ? `${row[field]} ${value}` : value;
    });
    return row;
  });
}

const KINDS: Record<string, Contact['kind']> = {
  customer: 'customer',
  client: 'customer',
  cliente: 'customer',
  lead: 'lead',
  prospect: 'lead',
  prospecto: 'lead',
  subscriber: 'customer',
  opportunity: 'customer',
  supplier: 'supplier',
  vendor: 'supplier',
  proveedor: 'supplier',
  member: 'member',
  miembro: 'member',
  team: 'member',
  candidate: 'candidate',
  candidato: 'candidate',
  employer: 'employer',
  empleador: 'employer',
};
const clean = (v: unknown, max: number) =>
  typeof v === 'string' || typeof v === 'number'
    ? String(v)
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
        .trim()
        .slice(0, max)
    : '';
/** Adds https:// to bare domains such as "example.com" from forms and exports. */
const link = (v: string) =>
  v && !/^[a-z]+:/i.test(v) && /\.[a-z]{2,}/i.test(v) ? `https://${v}` : v;

/** Accepts both the import field names and the loose names forms send (fullName, message…). */
export function normalizeLead(
  raw: Record<string, unknown>,
  fallbackKind: Contact['kind'] = 'customer',
): NormalizedLead {
  const mapped: LeadInput = {};
  for (const [k, v] of Object.entries(raw)) {
    const field = (IMPORT_FIELDS as readonly string[]).find((f) => f === k) ?? LOOKUP.get(key(k));
    const value = clean(v, 10000);
    if (field && value && !mapped[field as ImportField]) mapped[field as ImportField] = value;
  }
  const name =
    clean(mapped.name, 150) ||
    clean([mapped.firstName, mapped.lastName].filter(Boolean).join(' '), 150);
  const companyName = clean(mapped.company, 200);
  const address = [mapped.address, mapped.city, mapped.state, mapped.postalCode, mapped.country]
    .map((v) => clean(v, 200))
    .filter(Boolean)
    .join(', ')
    .slice(0, 500);
  const email = clean(mapped.email, 254).toLowerCase();
  const phone = clean(mapped.phone, 50);
  const lead: NormalizedLead = {
    notes: clean(mapped.notes, 5000),
    source: clean(mapped.source, 120),
  };
  // Without a name, contact details belong to the company if there is one, else to a person.
  if (name || (!companyName && (email || phone)))
    lead.person = {
      name: name || email || phone,
      email,
      phone,
      position: clean(mapped.position, 120),
      url: link(clean(mapped.url, 2000)),
      kind: KINDS[key(mapped.kind ?? '')] ?? fallbackKind,
    };
  if (companyName)
    lead.company = {
      name: companyName,
      email: clean(mapped.companyEmail, 254).toLowerCase() || (lead.person ? '' : email),
      phone: clean(mapped.companyPhone, 50) || (lead.person ? '' : phone),
      url: link(clean(mapped.companyUrl, 2000)),
      address,
    };
  else if (lead.person && !lead.person.url && mapped.companyUrl)
    lead.person.url = link(clean(mapped.companyUrl, 2000));
  return lead;
}

const digits = (phone: string) => phone.replace(/\D/g, '').slice(-10);
const lower = (s: string) => s.trim().toLowerCase();
/** Same person: matching email, or matching last 10 phone digits when there is no email. */
export function findPerson(
  data: SuiteData,
  workspaceId: string,
  person: { email: string; phone: string },
): Contact | undefined {
  const active = data.contacts.filter((c) => c.workspaceId === workspaceId && !c.archived);
  if (person.email) return active.find((c) => c.email && lower(c.email) === lower(person.email));
  const d = digits(person.phone);
  return d.length >= 7 ? active.find((c) => digits(c.phone) === d) : undefined;
}
/** Same company: matching name, ignoring case, accents and punctuation. */
export function findCompany(
  data: SuiteData,
  workspaceId: string,
  name: string,
): Company | undefined {
  const k = key(name);
  return (data.companies ?? []).find(
    (c) => c.workspaceId === workspaceId && !c.archived && key(c.name) === k,
  );
}

export type ImportPreview = {
  row: number;
  lead: NormalizedLead;
  /** What will happen with the person and company of this row. */
  person: 'new' | 'existing' | 'none';
  company: 'new' | 'existing' | 'none';
  /** Duplicate of an earlier row in the same file. */
  repeated: boolean;
  error: string;
};
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
/** Same checks the import command applies, so the preview shows problems before sending. */
export function leadError(lead: NormalizedLead): string {
  if (!lead.person && !lead.company) return 'Needs a name, company, email or phone.';
  if (lead.person?.email && !EMAIL.test(lead.person.email)) return 'Email is not valid.';
  if (lead.company?.email && !EMAIL.test(lead.company.email)) return 'Company email is not valid.';
  for (const u of [lead.person?.url, lead.company?.url])
    if (u && !/^https?:\/\/[^\s@]+$/i.test(u)) return 'Website must be an http(s) link.';
  return '';
}
export function previewImport(
  data: SuiteData,
  workspaceId: string,
  rows: LeadInput[],
  fallbackKind: Contact['kind'] = 'customer',
): ImportPreview[] {
  const seenPeople = new Set<string>();
  return rows.map((raw, index) => {
    const lead = normalizeLead(raw, fallbackKind);
    const id = lead.person ? lead.person.email || digits(lead.person.phone) : '';
    const repeated = !!id && seenPeople.has(id);
    if (id) seenPeople.add(id);
    return {
      row: index + 1,
      lead,
      person: !lead.person
        ? 'none'
        : findPerson(data, workspaceId, lead.person)
          ? 'existing'
          : 'new',
      company: !lead.company
        ? 'none'
        : findCompany(data, workspaceId, lead.company.name)
          ? 'existing'
          : 'new',
      repeated,
      error: leadError(lead),
    };
  });
}
/** Rows per `contact.import` command; larger files are sent in several commands. */
export const IMPORT_BATCH = 500;
