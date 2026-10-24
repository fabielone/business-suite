import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_MONEY_MINOR } from '@suite/core';
import { parsePesos } from '../src/money';

test('peso input preserves centavos without floating point multiplication errors', () => {
  assert.equal(parsePesos('1.01'), 101);
  assert.equal(parsePesos(' 125.5 '), 12550);
  assert.equal(parsePesos('0,29'), 29);
  assert.equal(parsePesos('10000000000.00'), MAX_MONEY_MINOR);
});

test('unsupported precision, grouped amounts and unsafe or nonpositive values do not become expenses', () => {
  for (const input of [
    '',
    '0',
    '-10',
    '1.001',
    '1,234.56',
    '1e3',
    'NaN',
    '10000000000.01',
    '999999999999999999999',
  ]) {
    assert.throws(() => parsePesos(input), Error, input);
  }
});
