import assert from 'node:assert/strict';
import test from 'node:test';
import {countByStatus, jsonBytes, unsentCount} from '../src/lib/offlineInventory.ts';

test('jsonBytes measures UTF-8 bytes of the stored JSON', () => {
  assert.equal(jsonBytes({a: 'x'}), 9);
  assert.equal(jsonBytes('é'), 4); // "é" is 2 bytes plus quotes
  assert.equal(jsonBytes(undefined), 0);
});

test('countByStatus counts every status', () => {
  assert.deepEqual(countByStatus([{status: 'draft'}, {status: 'draft'}, {status: 'pending'}, {status: 'published'}]), {
    draft: 2,
    pending: 1,
    failed: 0,
    published: 1,
  });
});

test('only items the server has not confirmed count as unsent', () => {
  const rec = (status: 'draft' | 'pending' | 'failed' | 'published') => ({status}) as never;
  const inv = {
    listings: {records: [rec('draft'), rec('pending'), rec('published')]},
    questions: {records: [rec('failed'), rec('published')]},
  } as never;
  assert.equal(unsentCount(inv), 3);
});
