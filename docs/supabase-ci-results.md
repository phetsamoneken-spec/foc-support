# CI evidence — 2026-11-02

[Review checks run 41384685515](https://github.com/phetsamoneken-spec/foc-support/actions/runs/41384685515) completed **successfully** for feature-branch commit `145ae9e277afb694984b92ed0860d484c8af308d`. Job `review` / ID `125082811718` ran on ubuntu-24.04 with Node 22 and read-only repository permissions. Logs were inspected, not inferred from configuration.

| Check | Observed result |
|---|---|
| Locked application and test-tool installation | PASS |
| TypeScript lint; 31 GAS tests; all 15 TypeScript entrypoints | PASS |
| Annual budget/date regressions in two timezones | PASS |
| In-memory migration/replay, 136 regression + 27 workflow assertions, both rollback checks | PASS |
| Native PostgreSQL version | 17.11 |
| Native migration apply and replay | PASS |
| Same 163 SQL assertions on native PostgreSQL | PASS |
| Competing budget edits | PASS: actual lock wait then stale-version rejection |
| Competing expense writes and retry | PASS: stale-version rejection; retry cannot overspend |
| Simultaneous identical operation | PASS: one transaction and one audit; same response |
| Changed actor/payload replay | PASS: operation receipt rejects mismatch |
| Concurrent cancellations | PASS: spending removed exactly once |
| Profile disable vs in-flight write | PASS: disable waits for profile lock; subsequent unchanged claims rejected |
| Deleted session with unchanged claims | PASS: subsequent sensitive write denied |
| Native summary | 9 checks PASS, including migration/regression checks above |
| Production build | PASS; existing chunk-size warning |

The native process starts a new loopback-only temporary cluster, uses generated throwaway credentials and synthetic customer/Auth fixtures, then stops/removes it. It never connects to the owner's Supabase project. Both Auth tables and JWT accessor functions remain test stubs. **Real Supabase Auth, gateway JWT verification, PostgREST/GraphQL exposure and hosted advisors remain NOT RUN.** No conclusion about live deployment behavior follows from these local database tests.

The local managed workspace cannot run a native PostgreSQL daemon because it has no usable non-root UID. That limitation remains; the native evidence above comes from the separate CI runner. No PostgreSQL root safety restriction was disabled and no OS user was created.

The source workbook audit is separate and private; CI has no workbook bytes. Only aggregate data-quality evidence is committed. Monetary budgets and live financial reconciliation, privileged account/config/import management, the frontend adapter and cutover/rollback rehearsal remain outstanding.

No main update, merge, production DB/Auth mutation, live import or deployment was performed.
