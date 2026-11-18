import assert from 'node:assert/strict';
import test from 'node:test';
import {cookieShapes, deepDiff, headerShape, normalizeJson} from './normalize.ts';

test('masks ids, timestamps, hex secrets, data URLs and long strings; keeps business values and key order stable', () => {
  const out = normalizeJson({
    z: 1,
    id: 42,
    listing_id: 7,
    questionId: 9,
    price_lrd: 7000,
    created_at: '2026-11-18 12:34:56',
    updated_at: '2026-11-18T12:34:56.789Z',
    token: 'a'.repeat(64),
    photo: 'data:image/jpeg;base64,AAAA',
    long: 'x'.repeat(400),
    csrfToken: 'whatever',
    nested: [{id: 1, status: 'Answered'}],
  }) as Record<string, any>;
  assert.deepEqual(Object.keys(out), ['created_at', 'csrfToken', 'id', 'listing_id', 'long', 'nested', 'photo', 'price_lrd', 'questionId', 'token', 'updated_at', 'z']);
  assert.equal(out.id, '<id>');
  assert.equal(out.listing_id, '<id>');
  assert.equal(out.questionId, '<id>');
  assert.equal(out.price_lrd, 7000);
  assert.equal(out.created_at, '<timestamp>');
  assert.equal(out.updated_at, '<timestamp>');
  assert.equal(out.token, '<hex:64>');
  assert.equal(out.photo, '<data-url:image/jpeg>');
  assert.match(out.long, /^<string len=400 sha=[0-9a-f]{8}>$/);
  assert.equal(out.csrfToken, '<token>');
  assert.deepEqual(out.nested, [{id: '<id>', status: 'Answered'}]);
});

test('cookie shapes record attributes but never values', () => {
  const headers = new Headers();
  headers.append('Set-Cookie', 'agri_session=SECRETVALUE; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax');
  headers.append('Set-Cookie', 'agri_csrf=abc; Max-Age=604800; Path=/; SameSite=Lax');
  const shapes = cookieShapes(headers);
  assert.deepEqual(shapes.map((c) => c.name), ['agri_csrf', 'agri_session']);
  assert.equal(shapes[1].httpOnly, true);
  assert.equal(shapes[0].httpOnly, false);
  assert.equal(shapes[1].sameSite, 'Lax');
  assert.equal(JSON.stringify(shapes).includes('SECRETVALUE'), false);
});

test('header shape keeps only the contract headers', () => {
  const h = new Headers({'Content-Type': 'application/json; charset=utf-8', 'X-Powered-By': 'Express', 'Idempotent-Replay': 'true'});
  assert.deepEqual(headerShape(h), {'content-type': 'application/json', 'idempotent-replay': 'true'});
});

test('deepDiff reports differing paths, missing and extra keys, and array length', () => {
  const d = deepDiff({a: 1, b: {c: [1, 2]}, d: 'x'}, {a: 2, b: {c: [1]}, e: 'y'});
  const paths = d.map((x) => x.path).sort();
  assert.deepEqual(paths, ['$.a', '$.b.c.length', '$.d', '$.e']);
  assert.deepEqual(deepDiff({a: 1}, {a: 1}), []);
});
