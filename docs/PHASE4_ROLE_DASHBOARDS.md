# Phase 4 role dashboards (Agricare Liberia)

Official name: **Agricare Liberia** (visible branding, metadata, README and docs).

## What changed
- `RoleWorkspace` (src/components/workspace/RoleWorkspace.tsx): sidebar and compact header for the farmer, expert and administrator workspaces, inside the normal app chrome (sign-out, offline banner kept). Mobile uses a "Workspace menu" disclosure. Role comes from the URL prefix only; authorization stays in `ProtectedRoute` and on the server.
- `WorkspaceShell` now defaults to this layout; the Ministry scaffold and its routes are untouched.
- `useResource` hook: loading, error and retry are explicit; a failed request is never shown as zero.
- Farmer, Expert and Admin overviews: summary cards from existing endpoints, recent-items lists, sortable admin audit table, empty/offline/error states.
- New `/farmer/market` (My Marketplace): own listings with availability filter and search, inquiries received and sent. Phone numbers are never read or shown; edits and offline queues stay in the Marketplace.
- Presenter panel on `/demo`: connection, environment flag, role, journeys viewed on this device, quick launch links. No invented statistics.

## Not changed
Server routes, database, migrations, API contract golden, USSD, offline engine, Ministry workspace.
`server/seed.ts` now seeds `platform_name = "Agricare Liberia"` (the contract golden was updated for that single value). SMS/USSD short prefixes ("Agri-Advisory demo:") are also unchanged because tests and message-length rules depend on them.

## Verification
tsc, production build, and the ministry-workspace, ministry, phase2b, ussd-marketplace, offline, harvest, h1, h2, sms, api, harness, deploy, phase0, phase0b, triage, hardening, phase2a, contract (unchanged golden) and new role-dashboards suites all pass. 
Headless Chrome (disposable QA server on port 3555 and a throwaway database; sign-in through the simulated SMS inbox): 18 routes (6 farmer, 3 expert, 8 admin, presenter `/demo`) at 320, 375, 768 and 1280 px = 72 checks, 0 problems: no horizontal overflow, one h1 per page, sidebar visible at 1280 px, "Workspace menu" opens at narrower widths, no console errors or uncaught exceptions, no page stuck loading, no touch target under 40 px in the workspace chrome. Screenshots were reviewed but are not committed.
Not certified: physical phones, screen readers, installed-PWA behaviour, offline mode inside the new dashboards.
