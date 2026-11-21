import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router-dom';
import {AppProvider} from '../src/context/AppContext.tsx';
import {HomePage} from '../src/pages/public/HomePage.tsx';
import {KnowledgeResources} from '../src/components/knowledge/KnowledgeResources.tsx';
import {COMMON_AGRICULTURAL_PROBLEMS} from '../src/data/knowledgeCenter.ts';

const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const page = (node: React.ReactNode) => renderToStaticMarkup(<AppProvider><MemoryRouter>{node}</MemoryRouter></AppProvider>);
const unescape = (s: string) => s.replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"');
const links = (h: string) => [...h.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);

test('hero has the approved headline, supporting text and three buttons wired to existing routes', () => {
  const h = unescape(page(<HomePage />));
  assert.equal((h.match(/<h1/g) ?? []).length, 1);
  assert.match(h, /Practical Farming Help, <span[^>]*>Online or Offline<\/span>/);
  assert.match(h, /Get simple, practical advice, step-by-step guides, and market support for everyday farming in Liberia\./);
  for (const [label, to] of [['Get Farming Advice', '/advisor'], ['Explore Knowledge & Guides', '/guides'], ['Try USSD', '/ussd-demo']]) {
    assert.match(h, new RegExp(`href="${to}"[^>]*>(?:(?!</a>).)*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), label);
  }
});

test('five service cards link to existing routes', () => {
  const h = unescape(page(<HomePage />));
  const section = h.slice(h.indexOf('home-services-heading'), h.indexOf('home-offline-heading'));
  for (const to of ['/today', '/advisor', '/guides', '/harvest', '/ussd-demo']) assert.ok(section.includes(`href="${to}"`), to);
  assert.equal((section.match(/<li/g) ?? []).length, 5);
  const app = read('src/App.tsx');
  for (const to of ['/today', '/advisor', '/guides', '/harvest', '/ussd-demo', '/offline']) assert.ok(app.includes(`path="${to}"`), `route ${to}`);
});

test('all 11 questions are on the homepage with their original text, Listen buttons and a link to all solutions', () => {
  assert.equal(COMMON_AGRICULTURAL_PROBLEMS.length, 11);
  const h = unescape(page(<HomePage />));
  for (const p of COMMON_AGRICULTURAL_PROBLEMS) assert.ok(h.includes(p.question), p.question);
  assert.equal((h.match(/data-testid="home-question"/g) ?? []).length, 11);
  assert.ok(h.includes('href="/guides?tab=problems"') && h.includes('See All 11 Solutions'));
  const q = read('src/components/home/CommonQuestions.tsx');
  assert.match(q, /aria-expanded=\{isOpen\}/); assert.match(q, /SpeakButton compact/); assert.match(q, /md:grid-cols-2/); assert.match(q, /grid-cols-1/);
  assert.ok(q.includes('prob.steps.join') && q.includes('prob.safetyDisclaimer'));
});

test('offline section is accurate: no whole-site claim, simulator is not a live shortcode, links to the offline library', () => {
  const h = unescape(page(<HomePage />));
  const s = h.slice(h.indexOf('home-offline-heading'));
  assert.match(s, /downloaded or saved on your phone/); assert.match(s, /not a live Orange or MTN shortcode/); assert.match(s, /need a connection/);
  assert.ok(s.includes('href="/offline"'));
  assert.ok(!/entire (website|site)|everything works offline|\*\d{3}#/i.test(h), 'no unsupported claims or shortcode');
});

test('homepage no longer carries the large educational sections and shows no invented statistics', () => {
  const h = unescape(page(<HomePage />));
  for (const gone of ['16 Agricultural Knowledge Categories', 'Eight Liberian Agricultural Problem Statements', 'Language access: English now', 'What do you need today?']) assert.ok(!h.includes(gone), gone);
  assert.ok(!/\b\d[\d,]*\+?\s*(farmers|users|downloads)\b/i.test(h));
  assert.ok(h.includes('Get Full Crop &amp; Plant Guidance in') || h.includes('Get Full Crop & Plant Guidance in'));
});

test('moved content lives in Farming Knowledge & Guides: modules, language access, directory and learning tools', () => {
  const g = read('src/pages/public/GuidesLibraryPage.tsx'); assert.match(g, /<KnowledgeResources \/>/);
  const h = unescape(page(<KnowledgeResources />));
  assert.ok(h.includes('Eight Liberian Agricultural Problem Statements') && h.includes('Language access: English now'));
  for (const to of ['/crops', '/livestock', '/soil', '/pests', '/weather', '/guidance', '/learn', '/advice-cards', '/language-lab', '/marketplace']) assert.ok(links(h).includes(to), to);
  assert.ok(h.includes('What do you need today?'));
});

test('header: guest Login/Register and signed-in Dashboard/Logout use existing routes and the existing session handler', () => {
  const l = read('src/components/Layout.tsx');
  assert.match(l, /to="\/login"[\s\S]{0,600}<span>Login<\/span>/); assert.match(l, /to="\/register"[\s\S]{0,600}<span>Register<\/span>/);
  assert.match(l, /\{user \? \(/); assert.match(l, /<span>Logout<\/span>/); assert.match(l, /void handleLogout\(\)/);
  assert.match(l, /to="\/ussd-demo" className=\{navLinkClass\}/); assert.match(l, /Find Harvest/); assert.match(l, /Knowledge &amp; Guides/);
  const app = read('src/App.tsx'); for (const r of ['/login', '/register', '/farmer', '/admin', '/expert']) assert.ok(app.includes(`path="${r}"`), r);
});

test('hero uses the project photograph through Vite (hashed imports, responsive WebP set) and stays replaceable from one place', () => {
  const cfg = read('src/data/homeHero.ts'); assert.match(cfg, /HERO_IMAGE/); assert.match(cfg, /from '\.\.\/assets\/brand\/hero-1600\.webp'/);
  for (const w of [640, 960, 1280, 1600]) assert.ok(fs.statSync(new URL(`../src/assets/brand/hero-${w}.webp`, import.meta.url)).size < 260_000, `hero-${w}`);
  assert.match(read('src/components/home/HeroSection.tsx'), /srcSet=\{HERO_IMAGE\.srcSet\}/);
  assert.ok(fs.existsSync(new URL('../assets-source/brand/hero.JPG', import.meta.url)), 'original kept');
});
