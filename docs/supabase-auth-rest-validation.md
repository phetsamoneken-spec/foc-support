# Local Auth/PostgREST validation — review only

The SQL/native PostgreSQL harnesses use Auth/JWT stubs. This follow-up adds `supabase/review/run-local-api.mjs` to validate the actual GoTrue Auth service, signed JWTs, API gateway and PostgREST against a **fresh local Docker stack**, not the owner's hosted Supabase project.

## Safety boundary

- A unique, temporary, unlinked working directory contains the local-only config and a copy of the draft migration. There is no hosted project ref, `link`, `db push`, remote DB URL or external Auth URL.
- The script accepts only loopback API/database URLs from its own captured local CLI status. HTTP redirects are rejected. It takes no owner credentials.
- `supabase start`, `db reset --local --no-seed`, and `stop --no-backup` run only in that temporary directory. Generated test accounts/data and containers are removed afterwards.
- CLI status/start output is captured without printing it. API keys, passwords, access/refresh tokens and full Auth responses are never logged or committed.
- Accounts are synthetic `example.test` identities with generated throwaway passwords. No customer source data is present in CI. Studio, storage, mail testing, analytics and other unnecessary services are disabled/excluded.
- The separate CI job has read-only repository permissions and no production secrets, environment or deployment actions. The pinned Supabase CLI's official install hook is selectively rebuilt after an otherwise script-disabled locked install.

## Cases

Actual email/password Auth enrollment through the local admin API and sign-in for Admin/B1–B7/inactive profile; public signup denial despite Admin-created users being able to sign in; wrong-password denial; tampered JWT signature rejection; each team's scoped customer/totals reads, rejection of initial budget creation, Admin initialization and own-budget edit RPCs; Admin all-team reads; anonymous denial; forged user_metadata not granting Admin; cross-team reads/writes; direct role/team mutation denial; archive isolation; same-operation retry and changed-payload rejection; stale-version HTTP conflict; active-profile disable against an existing JWT; Auth logout denying sensitive writes and refresh-token reuse.

This test does not select the eventual production login UX or implement a username adapter. Password reset/email delivery, hosted SMTP/rate limits, real project configuration and the React adapter remain separate gates.

## Business conflicts must not impersonate serialization failures

The initial draft used SQLSTATE `40001` for optimistic application version conflicts. The 2026-10-14 Supabase knowledge-base article documents an automatic PostgREST retry loop for custom 40001 errors in affected versions. Standard 40-class errors also map to HTTP 500, not the desired application conflict response.

The NOT-APPLIED review migration now raises **`PT409`** for stale/missing version conflicts. PostgREST maps this custom error to HTTP 409. Tests and the adapter plan use PT409; receipt checking still happens before version checking, so an exact lost-response retry returns the completed result. Clients should refresh/review before a new operation; never blindly retry a changed payload under the original operation ID. Real engine serialization/deadlock errors remain different from this application conflict.

References verified 2026-11-02:

- [Supabase custom 40001 retry issue](https://supabase.com/kb/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions)
- [PostgREST error mapping](https://docs.postgrest.org/en/v14/references/errors.html)
- [Local CLI development](https://supabase.com/docs/guides/local-development/cli/getting-started)
- [Password sign-in](https://supabase.com/docs/reference/javascript/auth-signinwithpassword)
- [Admin user creation](https://supabase.com/docs/reference/javascript/auth-admin-createuser)

CI [run 41387457643](https://github.com/phetsamoneken-spec/foc-support/actions/runs/41387457643), commit `44a997edcd77c475c3175064b68360ec1b9f5d0b`, passed 21 real local Auth/PostgREST checks, including actual session logout and PT409 → HTTP 409. The source workspace has no Docker daemon; this evidence comes from isolated CI. Two additional public-signup/tampered-signature assertions are added in the current follow-up and must pass the next CI run before being counted. Hosted project validation and mutations remain outside this review scope.
