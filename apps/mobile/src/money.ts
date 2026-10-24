import { MAX_MONEY_MINOR } from '@suite/core';

export function parsePesos(value: string): number {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized))
    throw new Error('Enter an amount with up to two decimal places, such as 125.50.');
  const [pesos, cents = ''] = normalized.split('.');
  const amount = Number(pesos) * 100 + Number(cents.padEnd(2, '0'));
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > MAX_MONEY_MINOR)
    throw new Error('Enter a positive amount within the supported range.');
  return amount;
}

export function formatMoney(amountMinor: number): string {
  return (
    new Intl.NumberFormat('en-MX', { style: 'currency', currency: 'MXN' }).format(
      amountMinor / 100,
    ) + ' MXN'
  );
}
