import assert from 'node:assert/strict';
import test from 'node:test';
import {passwordProblem} from '../server/authSecurity.ts';

test('very common passwords are refused even with digits or symbols added', () => {
  for (const p of ['password1234', 'Password!2026', 'Qwerty-9876', 'iloveyou2026', 'Welcome#2026', 'Agricare2026!', 'liberia-2026', 'Letmein!!99']) assert.ok(passwordProblem(p), `${p} should be refused`);
});
test('ordinary strong passwords and the private demo passwords are still accepted', () => {
  for (const p of ['Maize-Harvest-2026!', 'Kpelle#River42plant', 'Bong.County.Cassava7', 'Qa-4f9c1a2b7d-x9!', 'FarmerKollie-77-Tea']) assert.equal(passwordProblem(p), null, `${p} should be accepted`);
});
test('length, repeated characters, phone digits and name rules still apply', () => {
  assert.ok(passwordProblem('short1!')); assert.ok(passwordProblem('aaaaaaaaaaaa'));
  assert.ok(passwordProblem('Zz0770001234q!', {phone: '+231770001234'})); assert.ok(passwordProblem('Martha-Kollie-1!', {displayName: 'Martha Kollie'}));
});
