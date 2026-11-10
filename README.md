# FOC Support

Beerlao Gold mobile redesign: compact live-data dashboard, five bottom navigation tabs, responsive budget filters and forms, duplicate-save protection, and Beerlao branding throughout the app and PWA icons. Supabase integration and authorization rules are preserved.
FOC Support React/Vite application with customers, annual contract budgets, expenses, reports, user management and shared Supabase storage.

Source version: **2026.11.10.10**. Settings is now an Admin-only view. Team users have four evenly spaced bottom tabs and no Settings item in the drawer. App routing redirects unauthorized Settings/User-management state to Home, and the Settings component also refuses non-Admin rendering. Personal profile/photo/password editing and logout remain available through the header profile menu; app installation remains in the drawer footer. Matches Super MDE’s compact phone fullscreen toolbar by capping its top safe-area padding at 12px in fullscreen display mode. Browser tabs, standalone/iOS and wider screens retain their full top safe area; side cutouts, the bottom gesture area and dialogs remain protected. Fullscreen document backgrounds use the app gold, avoiding a different-colored edge outside the shell. Removes the fullscreen button from both the header and navigation menu. Installed PWAs prefer fullscreen on launch with a standalone fallback; the app identity, start URL and scope remain unchanged. The Android installation guide explains launching from the home-screen icon. Ordinary browser tabs keep their browser UI, and older Android installations may need a manifest update or reinstall before their launch mode changes. Moves employee and profile dialogs into a body portal with focus trapping and an inert background, preventing scrolling pages and app bars from covering forms. Mobile employee records use aligned label/value rows with complete names and touch-friendly actions. Employee photos support head-and-chest crop previews, zoom and positioning, bounded JPEG uploads and authenticated private downloads using the existing refreshed user session. Private portrait storage uses a JPEG-only, 256 KB bucket with server-enforced access for active Admin accounts and each employee’s own image. Storage setup was explicitly approved by the owner. No business data tables or backend APIs are changed. Uses a bounded dynamic viewport with a dedicated content scroller, compact mobile gutters and app bars that do not cover content. Reserves display cutouts and home-indicator space, resets scrolling when changing views, and retains normal print flow. Installed PWAs request fullscreen display automatically on launch. Reports show full financial values and stacked record cards on phones while retaining desktop/print tables and CSV exports. Report headers use the app identity and Gregorian dates without legacy spreadsheet metadata. Full-bleed gold launcher artwork and versioned maskable icons remove the inset white frame while preserving the app ID. Fixes sign-in contrast and keeps an installation action visible before login and in navigation, with manual Android/iOS/desktop guidance when the browser cannot offer native installation. The install prompt persists across sign-in and screen changes. Moves installation and installed status into the navigation footer for all users, keeping mobile headers clear. The iPhone guide opens above the drawer with keyboard focus and dismissal support. Shows a dismissible success popup for four seconds after an acknowledged store, expense, contract, budget, account, shared-settings or Excel save. Pending, failed and background-read requests do not display save success. Uses a Supabase backend with native Auth, normalized PostgreSQL tables, team permissions, atomic writes, revision conflict handling and retained operation receipts. Customer deletions archive data before removing the working rows. Excel imports and shared settings remain Admin-only. Annual allowances follow each contract’s commencement anniversary. Open devices refresh every 15 seconds. The previous Google Sheet is retained as the pre-migration backup; new Supabase writes do not mirror back to it.

See [Supabase setup and validation](supabase/README.md). The production endpoint is deployment-controlled; the browser contains only the public project URL and publishable API key. Privileged keys and imported credentials remain server-side. Legacy Apps Script support remains available for local development and rollback.

## Run locally

Use Node.js 22.12+ or Node.js 24 and npm.

```sh
npm ci
npm run dev
```

Open the Vite URL shown in the terminal (default port 3000). Use npm/package-lock.json for reproducible installs.

## Checks and production build

```sh
npm run lint
node scripts/build-supabase-domain.mjs
node tests/supabase-domain.test.mjs
node --import tsx tests/supabase-transport.test.ts
node tests/gas-sync.test.cjs
node --import tsx tests/remote-accounts.test.ts
node --import tsx tests/customer-delete.test.ts
node --import tsx tests/deployment-backend.test.ts
node --import tsx tests/sheet-business-read.test.ts
node --import tsx tests/admin-policy.test.ts
node --import tsx tests/business-writes.test.ts
node --import tsx tests/legacy-recovery.test.ts
node --import tsx tests/deployment-write-migration.test.ts
TZ=Asia/Bangkok node --import tsx tests/annual-budgets.test.ts
TZ=America/Los_Angeles node --import tsx tests/annual-budgets.test.ts
TZ=Asia/Bangkok node --import tsx tests/excel-calendar-date.test.ts
TZ=America/Los_Angeles node --import tsx tests/excel-calendar-date.test.ts
node --import tsx tests/gas-service.test.ts
node --import tsx tests/app-updates.test.ts
npm run build
npm run preview
```

The build creates `dist/` and copies it to `docs/`. Preview serves the last production build; rerun the build after source edits. Generated output and node_modules are excluded from Git.

## Permissions and shared data

Production uses one deployment-controlled Supabase database on every device. Native Auth handles login; PostgreSQL checks the current active profile, role, team and native session on every protected request. Admin manages Excel imports, shared settings, prices, contract renewals and annual allowances. Team users manage their assigned stores and expenses. Customers, conditions, contracts, annual budgets, transactions, user profiles, settings and logs share the same backend. Visible tabs refresh every 15 seconds and on focus or reconnection.

Budgets reset on each contract anniversary in the Lao calendar day (UTC+7). Previous years retain their spending; backdated receipts and cancellations affect their original annual period. Customer deletion backs up linked financial rows before physically removing the working records. Deleted customer codes remain reserved.

Writes wait for backend acknowledgement. Pending operations and Excel uploads survive reloads and network failures. A revision check rejects stale full uploads, and stable operation IDs prevent duplicates after a lost response. Existing browser drafts are retained in a recovery backup before replacing the cache with authoritative data.

## Migration and validation

See [Supabase setup, permissions and verification](supabase/README.md). Do not publish the production switch until source data, native Auth accounts, financial totals and scoped access have been verified. Private migration data and password hashes are excluded from this repository. The old Sheet remains the pre-migration backup; Supabase writes do not mirror back to it.

The test suite covers frontend services, domain rules, annual budgets, timezones, lost-response retries, physical deletion with backups and Admin/team boundaries. `supabase/tests-runtime.sql` additionally verifies permissions and atomic writes against PostgreSQL using rolled-back synthetic fixtures. The Pages workflow builds and verifies the exact published assets on pushes to main. A draft migration branch does not change the live site.

## Legacy Apps Script

The previous backend and its installation documents remain in [gas](gas/) for rollback and local development. They are not required for the Supabase production backend. Local development may select an explicit Apps Script URL or run the separate demo mode.
