import {
  Children,
  Fragment,
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { moneyInput, type Attachment } from '@suite/core/operations';

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const formatMoney = (amount: number, currency = 'MXN') =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount / 100);
export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    overview: (
      <>
        <path d="M3 11 12 3l9 8v10h-6v-7H9v7H3z" />
      </>
    ),
    crm: (
      <>
        <rect x="3" y="4" width="5" height="16" rx="1" />
        <rect x="10" y="4" width="5" height="10" rx="1" />
        <rect x="17" y="4" width="4" height="13" rx="1" />
      </>
    ),
    work: (
      <>
        <rect x="3" y="7" width="18" height="14" rx="2" />
        <path d="M8 7V3h8v4M3 12h18m-11 0v3h4v-3" />
      </>
    ),
    money: (
      <>
        <rect x="2" y="5" width="20" height="15" rx="2" />
        <path d="M2 9h20m-6 5h3" />
      </>
    ),
    contacts: (
      <>
        <circle cx="9" cy="7" r="4" />
        <path d="M2 21v-3a7 7 0 0 1 14 0v3m1-18a4 4 0 0 1 0 8m2 3a7 7 0 0 1 3 7" />
      </>
    ),
    chores: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="m7 8 2 2 4-4M7 16h10" />
      </>
    ),
    referrals: (
      <>
        <circle cx="5" cy="6" r="3" />
        <circle cx="19" cy="12" r="3" />
        <circle cx="5" cy="20" r="2" />
        <path d="m8 7 8 4m-9 8 9-6" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2" />
      </>
    ),
    plus: <path d="M12 4v16M4 12h16" />,
    companies: (
      <>
        <rect x="4" y="3" width="11" height="18" rx="1" />
        <path d="M15 9h5v12h-5M8 7h3m-3 4h3m-3 4h3m-4 6v-3h5v3" />
      </>
    ),
    upload: <path d="M12 16V4m-5 5 5-5 5 5M4 16v4h16v-4" />,
    search: (
      <>
        <circle cx="10" cy="10" r="6" />
        <path d="m15 15 6 6" />
      </>
    ),
    mail: (
      <>
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="m2 6 10 7L22 6" />
      </>
    ),
    close: <path d="m5 5 14 14M5 19 19 5" />,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    sync: (
      <>
        <path d="M20 7a9 9 0 0 0-15-2L2 8m0-5v5h5M4 17a9 9 0 0 0 15 2l3-3m0 5v-5h-5" />
      </>
    ),
    check: <path d="m4 12 5 5L20 6" />,
    download: (
      <>
        <path d="M12 2v13m-5-5 5 5 5-5M3 17v5h18v-5" />
      </>
    ),
    activity: (
      <>
        <path d="M3 12h4l3-8 4 16 3-8h4" />
      </>
    ),
    automations: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />,
    more: (
      <>
        <circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
        <circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </>
    ),
    moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />,
    monitor: (
      <>
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8m-4-4v4" />
      </>
    ),
    chevron: <path d="m9 6 6 6-6 6" />,
    logout: (
      <>
        <path d="M10 4H5v16h5m4-4 5-4-5-4m5 4H9" />
      </>
    ),
    edit: (
      <>
        <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
        <path d="m13 7 4 4" />
      </>
    ),
    suite: (
      <>
        <rect x="3" y="3" width="8" height="8" rx="2" />
        <rect x="13" y="3" width="8" height="8" rx="2" />
        <rect x="3" y="13" width="8" height="8" rx="2" />
        <rect x="13" y="13" width="8" height="8" rx="2" fill="currentColor" stroke="none" />
      </>
    ),
    lock: (
      <>
        <rect x="4" y="10" width="16" height="12" rx="2" />
        <path d="M7 10V6a5 5 0 0 1 10 0v4m-5 5v3" />
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
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.overview}
    </svg>
  );
}
export function Button({
  children,
  onClick,
  secondary,
  variant,
  disabled,
  type = 'button',
  icon,
  className = '',
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  secondary?: boolean;
  variant?: 'primary' | 'secondary' | 'text' | 'danger';
  disabled?: boolean;
  type?: 'button' | 'submit';
  icon?: string;
  className?: string;
  title?: string;
}) {
  const kind = variant ?? (secondary ? 'secondary' : 'primary');
  return (
    <button
      type={type}
      className={`op-button ${kind === 'primary' ? '' : kind} ${className}`.trim()}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {icon && <Icon name={icon} size={16} />}
      {children}
    </button>
  );
}
export type Tone = '' | 'good' | 'attention' | 'danger' | 'info' | 'plain';
export function Badge({ children, tone = '' }: { children: ReactNode; tone?: Tone | string }) {
  const label =
    typeof children === 'string' ? children.charAt(0).toUpperCase() + children.slice(1) : children;
  return <span className={`op-badge ${tone}`}>{label}</span>;
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="op-empty">
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function PageTitle({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="op-page-title">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
export function Panel({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="op-panel">
      <div className="op-panel-heading">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
export function Stats({
  values,
}: {
  values: { label: string; value: string | number; detail?: string }[];
}) {
  return (
    <dl className="op-stats">
      {values.map((v) => (
        <div key={v.label}>
          <dt>{v.label}</dt>
          <dd>{v.value}</dd>
          {v.detail && <small>{v.detail}</small>}
        </div>
      ))}
    </dl>
  );
}
export type Field = {
  name: string;
  label: string;
  type?:
    | 'text'
    | 'password'
    | 'email'
    | 'url'
    | 'date'
    | 'number'
    | 'amount'
    | 'textarea'
    | 'select'
    | 'file';
  required?: boolean;
  options?: { value: string; label: string }[];
  hint?: string;
  wide?: boolean;
  min?: number;
};
export type FormSpec = {
  title: string;
  description?: string;
  fields: Field[];
  initial?: Record<string, unknown>;
  submit: (values: Record<string, unknown>, key: string) => Promise<void>;
  submitLabel?: string;
};
export function Editor({ spec, close }: { spec: FormSpec; close: () => void }) {
  const key = useRef(crypto.randomUUID());
  const instance = useId();
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(
      spec.fields.map((f) => [
        f.name,
        spec.initial?.[f.name] ??
          (f.type === 'date' ? today() : f.type === 'select' ? (f.options?.[0]?.value ?? '') : ''),
      ]),
    ),
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const output = { ...spec.initial, ...values };
      for (const f of spec.fields) {
        if (f.type === 'file' && !values[f.name]) delete output[f.name];
        if (f.type === 'amount') output[f.name] = moneyInput(String(values[f.name] || '0'));
        if (f.type === 'number') output[f.name] = Number(values[f.name]);
      }
      await spec.submit(output, key.current);
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Your entries are preserved.');
    } finally {
      setBusy(false);
    }
  }
  async function readFile(file?: File) {
    if (!file) {
      setValues((v) => ({ ...v, receipt: undefined }));
      return;
    }
    if (
      file.size > 3 * 1024 * 1024 ||
      !['image/jpeg', 'image/png', 'application/pdf'].includes(file.type)
    ) {
      setError('Choose a PNG, JPEG or PDF receipt up to 3 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setError('The file could not be read.');
    reader.onload = () =>
      setValues((v) => ({
        ...v,
        receipt: {
          name: file.name,
          mime: file.type,
          size: file.size,
          base64: String(reader.result).split(',')[1],
        } as Attachment,
      }));
    reader.readAsDataURL(file);
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) close();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [busy, close]);
  const titleId = instance + 'title';
  return (
    <div
      className="op-dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) close();
      }}
    >
      <section
        className={spec.fields.length > 6 ? 'op-editor wide-form' : 'op-editor'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="op-panel-heading">
          <div>
            <h2 id={titleId}>{spec.title}</h2>
            {spec.description && <p>{spec.description}</p>}
          </div>
          <button
            className="op-icon-button"
            aria-label="Close form"
            onClick={close}
            disabled={busy}
          >
            <Icon name="close" />
          </button>
        </div>
        <form onSubmit={submit}>
          <div className="op-form-grid">
            {spec.fields.map((f, i) => (
              <label
                className={f.wide || f.type === 'textarea' ? 'wide' : ''}
                key={f.name}
                htmlFor={instance + f.name}
              >
                <span>
                  {f.label}
                  {f.required ? ' *' : ''}
                </span>
                {f.type === 'textarea' ? (
                  <textarea
                    id={instance + f.name}
                    value={String(values[f.name] ?? '')}
                    required={f.required}
                    maxLength={20000}
                    rows={5}
                    onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                  />
                ) : f.type === 'select' ? (
                  <select
                    id={instance + f.name}
                    value={String(values[f.name] ?? '')}
                    onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                  >
                    {f.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : f.type === 'file' ? (
                  <input
                    id={instance + f.name}
                    type="file"
                    accept="image/png,image/jpeg,application/pdf"
                    onChange={(e) => void readFile(e.target.files?.[0])}
                  />
                ) : (
                  <input
                    id={instance + f.name}
                    autoFocus={i === 0}
                    type={f.type === 'amount' ? 'text' : (f.type ?? 'text')}
                    inputMode={f.type === 'amount' ? 'decimal' : undefined}
                    value={String(values[f.name] ?? '')}
                    required={f.required}
                    min={f.min}
                    maxLength={f.type === 'url' ? 2000 : 1000}
                    onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                  />
                )}{' '}
                {f.hint && <small>{f.hint}</small>}
              </label>
            ))}
          </div>
          {error && (
            <p role="alert" className="op-error">
              {error}
            </p>
          )}
          <div className="op-form-actions">
            <Button secondary onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={busy}
              variant={/discard|void|archive/i.test(spec.submitLabel ?? '') ? 'danger' : 'primary'}
            >
              {busy ? 'Saving…' : (spec.submitLabel ?? 'Save')}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
export function Search({
  value,
  set,
  placeholder = 'Search this workspace',
}: {
  value: string;
  set: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="op-search">
      <Icon name="search" size={18} />
      <span className="sr-only">{placeholder}</span>
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(e) => set(e.target.value)}
      />
    </label>
  );
}
function labelCells(row: ReactNode, headings: string[]): ReactNode {
  if (!isValidElement(row)) return row;
  const element = row as ReactElement<{ children?: ReactNode }>;
  const cells: ReactNode[] = [];
  const flatten = (node: ReactNode) => {
    Children.forEach(node, (child) => {
      if (isValidElement(child) && child.type === Fragment)
        flatten((child as ReactElement<{ children?: ReactNode }>).props.children);
      else if (child !== null && child !== false && child !== undefined && child !== '')
        cells.push(child);
    });
  };
  flatten(element.props.children);
  return cloneElement(
    element,
    {},
    cells.map((cell, i) =>
      isValidElement(cell)
        ? cloneElement(cell as ReactElement<Record<string, unknown>>, {
            'data-label': headings[i] ?? '',
            key: i,
          })
        : cell,
    ),
  );
}
/** Semantic table on wide screens; each row becomes a labelled card below 640px. */
export function Table({ headings, children }: { headings: string[]; children: ReactNode }) {
  return (
    <div className="op-table-scroll">
      <table className="op-table">
        <thead>
          <tr>
            {headings.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{Children.map(children, (row) => labelCells(row, headings))}</tbody>
      </table>
    </div>
  );
}
