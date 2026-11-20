import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router-dom';
import {AppProvider} from '../src/context/AppContext.tsx';
import {RoleWorkspace, workspaceRoleFor} from '../src/components/workspace/RoleWorkspace.tsx';
import {FARMER_NAV} from '../src/pages/farmer/FarmerDashboardPage.tsx';
import {EXPERT_NAV} from '../src/pages/expert/ExpertDashboardPage.tsx';
import {ADMIN_NAV} from '../src/pages/admin/AdminOverviewPage.tsx';

const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const render = (path: string, nav: {to: string; label: string; end?: boolean}[]) => renderToStaticMarkup(
  <AppProvider><MemoryRouter initialEntries={[path]}><RoleWorkspace title="Overview" subtitle="Sub" navItems={nav}><p>content</p></RoleWorkspace></MemoryRouter></AppProvider>,
);

test('workspace role comes from the URL prefix and defaults to the least privileged workspace', () => {
  assert.equal(workspaceRoleFor('/admin'), 'admin'); assert.equal(workspaceRoleFor('/admin/reports'), 'admin');
  assert.equal(workspaceRoleFor('/expert/questions/3'), 'expert'); assert.equal(workspaceRoleFor('/farmer/market'), 'farmer');
  assert.equal(workspaceRoleFor('/administrator'), 'farmer'); assert.equal(workspaceRoleFor('/expertise'), 'farmer');
});

test('each role workspace renders one h1, a labelled sidebar navigation, current-page state and a mobile menu button', () => {
  for (const [path, nav, label] of [['/farmer', FARMER_NAV, 'Farmer workspace'], ['/expert', EXPERT_NAV, 'Expert workspace'], ['/admin', ADMIN_NAV, 'Administrator console']] as const) {
    const h = render(path, [...nav]);
    assert.equal((h.match(/<h1/g) ?? []).length, 1, path);
    assert.match(h, new RegExp(`aria-label="${label} navigation"`)); assert.match(h, /aria-current="page"/);
    assert.match(h, /aria-expanded="false"/); assert.match(h, /Workspace menu/); assert.match(h, /<p>content<\/p>/);
    for (const item of nav) assert.ok(h.includes(item.label.replace(/&/g, '&amp;')), item.label);
  }
});

test('role navigation never offers another role\'s workspace links', () => {
  assert.ok(!render('/farmer', [...FARMER_NAV]).includes('href="/admin'));
  assert.ok(!render('/expert', [...EXPERT_NAV]).includes('href="/admin'));
  assert.ok(render('/admin', [...ADMIN_NAV]).includes('href="/management"'));
});

test('routes stay guarded: admin and expert by role, farmer pages by sign-in, including the new marketplace page', () => {
  const app = read('src/App.tsx');
  assert.match(app, /path="\/farmer\/market" element=\{<ProtectedRoute><MyMarketplacePage/);
  for (const r of ['/admin', '/admin/farmers', '/admin/settings']) assert.match(app, new RegExp(`path="${r}" element=\\{<ProtectedRoute requiredRoles=\\{\\['admin'\\]\\}>`));
  assert.match(app, /path="\/expert" element=\{<ProtectedRoute requiredRoles=\{\['expert', 'admin'\]\}>/);
});

test('dashboards show loading, error and empty states and never invent figures', () => {
  for (const f of ['src/pages/farmer/FarmerDashboardPage.tsx', 'src/pages/expert/ExpertDashboardPage.tsx', 'src/pages/admin/AdminOverviewPage.tsx', 'src/pages/farmer/MyMarketplacePage.tsx']) {
    const s = read(f);
    assert.match(s, /useResource/, f); assert.match(s, /kind="error"/, f); assert.match(s, /kind="empty"/, f); assert.match(s, /loading/, f);
    assert.ok(!/\.catch\(\(\) => undefined\)/.test(s), `${f} must not swallow load failures as zero`);
    assert.ok(!/Math\.random|toFixed\(\d\)\s*\+\s*['"]%/.test(s), f);
  }
});

test('marketplace dashboard reads only the allow-listed inquiry fields and never renders a phone number', () => {
  const s = read('src/pages/farmer/MyMarketplacePage.tsx');
  assert.ok(!/buyer_phone|seller_phone|\.phone\b/.test(s.replace(/\/\*\*[\s\S]*?\*\//g, '')), 'no phone fields');
  assert.match(s, /hasListingKey/);
});

test('official name is Agriccare Liberia in visible branding and metadata', () => {
  assert.equal(JSON.parse(read('metadata.json')).name, 'Agriccare Liberia');
  for (const f of ['index.html', 'src/lib/i18n.ts', 'src/components/Layout.tsx', 'src/components/workspace/WorkspaceScaffold.tsx']) assert.ok(/Agriccare/.test(read(f)), f);
  for (const f of ['index.html', 'src/lib/i18n.ts', 'src/components/Layout.tsx', 'src/components/PageBoundary.tsx']) assert.ok(!/Agri-Advisory Liberia|Agri-Care/.test(read(f)), f);
});
