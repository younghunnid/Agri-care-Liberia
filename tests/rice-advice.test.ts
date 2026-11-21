import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {RECORDING_MATCHES_YELLOW_LEAVES, RICE_RECORDING, RICE_YELLOW_LEAVES, recordingLabel} from '../src/data/riceAdvice.ts';

const root = process.cwd(); const read = (f: string) => fs.readFileSync(path.join(root, f), 'utf8');
const sha = (f: string) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const ORIGINAL_SHA = 'b29406bf989407d8c61c89c29911a9d06ff4f0902ed60b3c8d35c6b7f8c5abd4'; // vie.m4a as received

test('the question and the English answer are exactly as supplied', () => {
  assert.equal(RICE_YELLOW_LEAVES.crop, 'Rice');
  assert.equal(RICE_YELLOW_LEAVES.question, 'My rice leaves are turning yellow. What could be the problem?');
  assert.equal(RICE_YELLOW_LEAVES.answerEn, 'Yellow leaves may be caused by pests, diseases, lack of nutrients, or too much water. Check the plants carefully and contact an agricultural extension officer for proper advice.');
});

test('source and review status are honest: supplied by the team, not reviewed, no approval claimed', () => {
  const t = `${RICE_YELLOW_LEAVES.source} ${RICE_YELLOW_LEAVES.reviewStatus}`;
  assert.match(RICE_YELLOW_LEAVES.reviewStatus, /^Not reviewed/); assert.match(RICE_YELLOW_LEAVES.source, /project team/);
  assert.ok(!/approved|verified by|endorsed|certified/i.test(t), t); assert.match(RICE_YELLOW_LEAVES.offline, /without internet/);
});

test('the recording is a byte-for-byte copy of the original; its facts match the file; nothing about language or topic is claimed', () => {
  const copy = path.join(root, 'public/audio/rice/rice-recorded-advice.m4a');
  assert.ok(fs.existsSync(copy)); assert.equal(fs.statSync(copy).size, RICE_RECORDING.bytes); assert.equal(sha(copy), RICE_RECORDING.sha256); assert.equal(RICE_RECORDING.sha256, ORIGINAL_SHA, 'the copy is identical to the received vie.m4a');
  const original = path.join(root, 'vie.m4a'); if (fs.existsSync(original)) assert.equal(sha(original), ORIGINAL_SHA, 'the original vie.m4a is unchanged');
  const head = fs.readFileSync(copy).subarray(0, 12); assert.equal(head.subarray(4, 8).toString('latin1'), 'ftyp'); assert.equal(head.subarray(8, 12).toString('latin1'), 'M4A ');
  assert.equal(RICE_RECORDING.mimeType, 'audio/mp4'); assert.ok(RICE_RECORDING.durationSec > 120 && RICE_RECORDING.durationSec < 140);
  assert.equal(RICE_RECORDING.language, null); assert.equal(RICE_RECORDING.languageVerified, false); assert.equal(RICE_RECORDING.topicVerified, false);
  assert.ok(!/english|kpelle|bassa|mano|liberian english/i.test(recordingLabel()), 'no language is named in the label');
});

test('the recording is NOT attached to the yellow-leaves question until a listener confirms it, and nothing plays by itself', () => {
  assert.equal(RECORDING_MATCHES_YELLOW_LEAVES, false);
  const card = read('src/components/RiceAdviceCard.tsx'); const player = read('src/components/RecordedAdvicePlayer.tsx');
  assert.match(card, /recordingMatches = RECORDING_MATCHES_YELLOW_LEAVES/); assert.match(card, /data-testid="rice-no-audio-here"/);
  assert.ok(!/autoPlay|autoplay/i.test(player.replace(/no autoplay|never autoplay|nothing plays by itself/gi, '')), 'no autoplay attribute');
  assert.match(player, /preload="none"/); assert.match(player, /playsInline/); assert.match(player, /new Blob\(\[buf\]/, 'played from a Blob (Safari needs byte ranges that a service worker would not give)');
  assert.ok(!/speechSynthesis|SpeechSynthesisUtterance/.test(player), 'the recording is never replaced by generated speech');
});

test('the card is reachable from Knowledge & Guides (Rice) and from the Rice crop page; the audio is in the offline precache', () => {
  assert.match(read('src/pages/public/GuidesLibraryPage.tsx'), /data-testid="cq-rice"/); assert.match(read('src/pages/public/GuidesLibraryPage.tsx'), /<RiceAdviceCard \/>/);
  assert.match(read('src/pages/public/CropsLibraryPage.tsx'), /selectedCrop\.slug === 'rice'/);
  assert.match(read('vite.config.ts'), /globPatterns: \['\*\*\/\*\.\{[^']*\bm4a\b/);
  const sw = path.join(root, 'dist/sw.js'); if (fs.existsSync(sw)) assert.match(fs.readFileSync(sw, 'utf8'), /audio\/rice\/rice-recorded-advice\.m4a/, 'precached by the service worker');
});
