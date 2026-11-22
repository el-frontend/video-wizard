# Video Wizard Unified Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every Video Wizard tool, API and media operation resolves one authenticated owner, using Better Auth and verified JWTs, with preserved accounts and an idempotent local user seed.

**Architecture:** Better Auth in the existing Next.js backend with PostgreSQL/Drizzle and its React client. User JWTs authorize API calls; verified HttpOnly sessions support SSR/media. Separate short-lived service JWTs protect Python/renderer; owned assets/jobs replace browser-supplied paths.

**Tech Stack:** Better Auth 1.7.27, Next.js 16.1.1, React 19.2.3, Drizzle ORM 0.45.2 (required patch from 0.45.1), PostgreSQL, jose, FastAPI, Express, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-21-video-wizard-unified-auth-design.md`

## Global Constraints

- Preserve `users` UUIDs, all owner relations, storage paths, immutable library versions and CAS history. Do not recreate users or reset the real database.
- Better Auth and its adapter are pinned to 1.7.27; apply only the required Drizzle ORM patch 0.45.1 to 0.45.2, without upgrading Next/React/Drizzle Kit wholesale.
- User JWT: EdDSA, TTL 15 minutes, issuer BETTER_AUTH_URL, audience video-wizard-api, UUID sub, active session sid, token_use user. Only whitelisted nonsecret claims.
- Better Auth session: 7 days, daily renewal, HttpOnly, SameSite Lax, Secure on HTTPS, active database validation without revocation-stale session cache.
- Service JWT: HS256, TTL 5 minutes, issuer video-wizard-backend, audience video-wizard-processing or video-wizard-renderer, sub video-wizard-worker, token_use service, UUID ownerId and operation scope/refs. Distinct secret from Better Auth, at least 32 bytes; reuse private STUDIO_RENDER_SECRET.
- Invalid Bearer never falls back to a valid cookie. No tokens in localStorage, querystrings, logs, prompts or argv. No arbitrary cross-origin credential CORS.
- Every functional page/API requires authentication; signin/signup/static UI/auth protocol/JWKS/minimal health and data-free preview bootstrap are documented exceptions. Preserve existing limited preview capability protocol and TTL.
- Keep owner 404, unauthenticated 401, stale revision 409, private/no-store and media Range semantics. Do not automatically retry ambiguous mutations.
- Seed default email demo@video-wizard.local/name Usuario de prueba, explicit password env or generated private ignored .studio/bootstrap-user.json mode 0600. Existing users never reset. Reuse provisionCatalog, no new RBAC/OAuth/email service.
- User-facing UI Spanish; code/comments English. No new voice/content generation. Technical fixture renders allowed. Tests only databases ending in \_test.
- Preserve existing local R2 commit 98a0c5d as unreviewed integration work; no unrelated video changes, no accidental main merge or publication.

## Review Focus

1. A historical long/Unicode bcrypt password must still sign in while new registration uses min 8/max 128 (Task 1).
2. A revoked/invalid bearer with a valid cookie must still fail, and a user JWT must never authorize internal service operations (Tasks 1, 4).
3. Session expiry while editing must preserve unsaved state and must not replay a PUT that may have succeeded (Task 2).
4. An authenticated second user must not fetch another user's legacy file by guessing a path or job ID, including Range/HEAD (Tasks 3, 4).
5. A queued job may start/retry after its human session expires, while anonymous direct ports and old public file URLs remain blocked (Tasks 4, 5).

---

### Task 1: Better Auth backend, additive identity migration and seed

**Files:**

- Modify: `apps/web/auth.ts`, `apps/web/server/lib/auth.ts`, `apps/web/server/lib/password.ts`, `apps/web/server/db/schema/{users,auth,index}.ts`, `apps/web/package.json`, `pnpm-lock.yaml`.
- Replace: `apps/web/app/api/auth/[...nextauth]/route.ts` with `apps/web/app/api/auth/[...all]/route.ts`; retire `apps/web/app/api/auth/signup/route.ts` and old `server/services/auth-service.ts` only when callers migrate in Task 2 (a temporary safe delegate to Better Auth is permitted until then).
- Create: `apps/web/server/auth/{config,user-jwt,migration-preflight,seed-user}.ts`, `apps/web/server/db/migrations/0008_better_auth.sql` plus Drizzle snapshot/journal, `apps/web/scripts/{auth-preflight,seed-auth-user}.ts`, `apps/web/server/auth/{migration,seed-user,user-jwt}.integration.test.ts` and focused config tests.

**Interfaces:**

- Consumes: existing `db`, `users`, password verifier, `provisionCatalog(db, ownerId)` and `_test` PostgreSQL fixtures.
- Produces: `createAuth(database, options)` testable Better Auth factory; `betterAuthServer` singleton exported from `@/auth`; transitional `auth(): Promise<{user: AuthenticatedUser, session: {id:string}} | null>` for existing SSR callers, delegating only to Better Auth (not a second auth system).
- Produces: `requireAuth(request?: Request): Promise<AuthenticatedUser>` at existing module; resolves supplied headers or Next request context and throws existing UnauthorizedError. `AuthenticatedUser` retains id/email/name/image. JWT/session checks use active database session, not caller owner fields.
- Produces: `seedBaseUser(database, {email,name,password?,credentialFile}): Promise<{userId:string,created:boolean,credentialFile?:string}>`; CLI `auth:preflight`, `auth:seed`. Do not expose password in returned values/logs.

- [ ] **Step 1: Write failing integration tests** named `upgrades0007WithoutChangingOwnership`, `migratesBcryptUnicodeAndLongPasswords`, `normalizationCollisionAbortsAtomically`, `seedTwicePreservesCredentialAndCatalog`, `jwtRejectsRevocationAndInvalidBearerWithCookie`. Assert original UUID/hash/linked resources survive; current account credential not overwritten; seed file 0600/no output password; no-secret JWT, wrong aud/alg/profile/expired/sub/sid reject. Include fresh DB and historical no-password/null-name user.
- [ ] **Step 2: Run the focused auth tests and record expected missing implementation failures.** Use dedicated `_test` DB and no fixture cleanup on real `studio`.
- [ ] **Step 3: Implement additive Drizzle migration, factory and server guards.** Inspect installed types for model/field mapping, UUID generation, jwt definePayload(session), local JWKS validation, password callbacks. Use Better Auth default scrypt/NFKC for new passwords and bcrypt-format dispatch without normalization for migrated ones; test both Unicode behaviors. Validate login length behavior against installed source. Preflight normalization collisions inside transaction before mutation; populate credentials idempotently and preserve legacy tables/column. Do not run Kysely migrations.
- [ ] **Step 4: Implement seed CLI and ignored private bootstrap credential file.** Existing user is never reset; catalog provisioning is retryable after partial file failure. Add scripts/env names and narrow ignore for credential file. Use aggregate-only diagnostics.
- [ ] **Step 5: Verify focused tests, existing project/asset/library integration suites and web typecheck.** Compatibility wrapper must keep existing owner services usable even before UI switches. Record known temporary old login UI incompatibility for Task 2, not as finished product.
- [ ] **Step 6: Commit only Task 1 files** with `feat: centralize identity with better auth and jwt`.

### Task 2: Unified page policy and Better Auth client without losing editor work

**Files:**

- Create: `apps/web/lib/{auth-client,authenticated-fetch,safe-return-path}.ts`, `apps/web/features/auth/{components,lib}/` focused session UI/controllers and tests, optional shared `apps/web/server/auth/page-policy.ts`.
- Modify: `apps/web/app/{layout,signin/page,signup/page,page,video-wizard/page,subtitle-generator/page,content-intelligence/page}.tsx`, all existing protected page guards, `apps/web/components/layout/app-sidebar.tsx`, `apps/web/features/studio-projects/project-api.ts`, `apps/web/features/studio-shorts/lib/api.ts`, studio library API clients, `apps/web/features/studio-designer/{components/designer.tsx,hooks/use-project-session.ts}`, legacy browser fetch callers under `features/video`, `lib/hooks` and content intelligence, `apps/web/features/video/hooks/use-brand-kit.ts`.
- Tests: `apps/web/lib/{safe-return-path,authenticated-fetch}.test.ts`, focused auth page/shell tests, `apps/web/features/studio-designer/hooks/use-project-session.test.tsx`, page policy/HTTP acceptance tests.

**Interfaces:**

- Consumes: Task 1 `betterAuthServer`, `auth`, `requireAuth`, JWT/session protocol.
- Produces: `authClient` with React `createAuthClient`/jwtClient; `authenticatedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>` used for JSON/work API fetches; `clearAccessToken(): void`; `safeReturnPath(raw: string | null): string` with `/projects` fallback. Authenticated fetch refuses cross-origin destinations before attaching credentials; do not forward JWT through redirects to another origin.
- Produces: session-expired client notification (no navigation side effect) and auth gate that reauthenticates in place; explicit signout integrates editor dirty/saving state.

- [ ] **Step 1: Search/retrieve modern-web-guidance for focused login forms/session security before UI work; preserve guide IDs and exact applicable quotes in report.** Read existing UI patterns; do not redesign unrelated workspaces.
- [ ] **Step 2: Write failing tests** `allFunctionalPagesRequireSession`, `safeReturnRejectsExternalEncodedTargets`, `jwtFetchPreservesAbortBodyHeadersAndSingleFlightsToken`, `jwtFetchNeverSendsCredentialsCrossOrigin`, `authExpiryKeepsDirtyDocument`, `reauthDoesNotReplayUnknownMutation`, `cancelSignoutKeepsEditor`, `brandKitIsScopedToUserAndUnownedLegacyKitNotAssigned`. Assert login/signup are public without private sidebar and callback includes local query; malformed Bearer tests stay server-owned in Task 1. Account changes invalidate cached user state.
- [ ] **Step 3: Implement Better Auth login/signup/logout and shells.** Replace all active NextAuth imports/dependencies/callers, remove obsolete custom signup service when unused. Keep names optional in UX with safe display fallback; respect new credential policy and same-origin callbacks. Validate every real page before data access; preserve owner resolution and avoid dynamic-auth build-time database queries.
- [ ] **Step 4: Implement shared JWT fetch and in-place reauth.** Tokens only memory; cookie support for native multimedia; header merging/abort behavior preserved. Clear cached token on signout/session changes; refresh before expiry, bounded auth token acquisition; never blindly retry mutating work requests. Keep local editor document on 401, allow deliberate retry after login; do not implement D6 persistent drafts.
- [ ] **Step 5: Verify focused React/transport tests, existing designer/session tests and web typecheck.** Use actual browser to inspect public auth shell, protected navigation, user/signout and dirty-state reauth; inspect screenshots. Route protection of legacy editor and disabled routes is finalized with Task 3 data-resolution changes.
- [ ] **Step 6: Commit** `feat: unify authenticated navigation and client sessions`.

### Task 3: Owned legacy processing and private browser media

**Files:**

- Modify: `apps/web/app/editor/[id]/page.tsx`, `apps/web/app/api/{transcribe,render-with-subtitles,generate-subtitles,render-video-subtitles,create-clip,render-final}/route.ts`, `apps/web/app/remotion/route.ts`, jobs routes if needed for owned media responses, all API `requireAuth` callers and shared `projectResponse`, `assetResponse`, `libraryResponse`, `engineResponse` wrappers/callers so the incoming Request and its real HTTP method reach the guard.
- Modify: `apps/web/server/services/{clip-integration-service,subtitle-generation-service,video-render-service}.ts`, `apps/web/server/worker/handlers.ts`, video-render/clip-render types, relevant `features/video/hooks/{use-subtitle-generation,use-video-processing}.ts`, `apps/web/lib/hooks/useClipWorkflow.ts` and actual consumers discovered by search.
- Create: focused `apps/web/server/services/owned-media-service.ts` (or equivalent co-located narrow resolver), authenticated legacy job-media route if resource ingestion cannot cover exact artifact; legacy ownership/provenance and Range tests.

**Interfaces:**

- Consumes: `requireAuth`, existing Studio AssetService/short-source/short-provenance APIs, `job.userId`, shared client fetch and source ingestion.
- Produces: user-facing processing payloads with owned `sourceAssetId` or owned `jobId`; backend path resolution under owner. Preserve existing response data shapes where safe, with web-origin private URLs replacing engine file URLs. Incompatible historical unproven jobs return actionable reingestion diagnostics, not guessed owner.

- [ ] **Step 1: Write failing tests** `anonymousLegacyRoutesReturn401`, `cookieMutationOriginCheckedAcrossEveryApiWrapper`, `otherOwnerPathOrJobCannotBeProcessed`, `legacyEditorIgnoresRawQueryPaths`, `subtitleGeneratorUsesOwnedIngestion`, `privateOutputRangeAndHead`. Cover encoded paths, absolute Python URLs, own and other jobs/assets, stale/unproven jobs, stub routes and source/derived crop provenance. Actual mutating requests with cookies but absent/wrong Origin must fail before side effects, even on existing Studio APIs; valid Bearer requests remain usable by non-browser clients.
- [ ] **Step 2: Implement owner resolution in services and authenticated routes, then update browser/worker consumers together.** Use IDs and actual trusted provenance; no string path prefix as sole ownership check. `/editor/[id]` requires owner job data and no SSR transcribe from query/no fake fallback. Ensure worker revalidates owner refs before physical reads. Reuse D5 registered derived artifacts; maintain manual subtitles/render output association to parent job and owner.
- [ ] **Step 3: Move Subtitle Generator upload/YouTube/transcription through existing owned ingesta; serve outputs through private assets/job proxy.** No browser fetch to Python and no public engine URL in generated playback/download results. Authenticate even disabled 501 handlers.
- [ ] **Step 4: Verify focused ownership/Range tests and existing Shorts/caption conversion/job tests, then typecheck.** No new ASR/TTS provider keys; existing local Whisper for end-to-end later. Check creator API responses do not leak absolute locator paths in place of new IDs.
- [ ] **Step 5: Commit** `fix: enforce ownership across legacy video workflows`.

### Task 4: Signed internal calls and closed Python/renderer file access

**Files:**

- Create: `packages/service-auth/{package.json,tsconfig.json,src/index.ts,src/index.test.ts}` with jose and a strict cross-language profile; shared fixture tests under package and Python.
- Modify: web server service clients, worker handlers, `apps/web/server/services/studio/remotion-service.ts`, `apps/remotion-server/server/{index,studio-http,render-queue}.ts`, Python `main.py` and new focused auth module/tests, Python requirements, dependent package manifests/lock, Compose files and service env examples.

**Interfaces:**

- Consumes: authenticated owner/job/project refs from Tasks 1–3, existing preview snapshot/ticket/cookie lifecycle and STUDIO_RENDER_SECRET.
- Produces: `signServiceToken(input: {audience: ServiceAudience,ownerId:string,scope:string,jobId?:string,projectId?:string,previewId?:string}, options: {secret:string,now?:Date}): Promise<string>` and `verifyServiceToken(token: string, requirements: {audience:ServiceAudience,scope:string,secret:string,now?:Date}): Promise<ServicePrincipal>` in `@workspace/service-auth`. `ServiceAudience` is the exact two-audience union from constraints; principal includes ownerId and authenticated operation refs. Python validates the same profile with maintained JWT library, version pinned after primary documentation/package compatibility check.
- Produces: no unauthenticated internal processing/render/file access; minimal health and limited preview bootstrap/ticket/cookie capabilities remain documented exceptions.

- [ ] **Step 1: Write failing TS/Python interoperability and HTTP tests** `forgedOrWrongAudienceServiceJwtRejected`, `userJwtCannotActAsWorker`, `ownerHeaderCannotOverrideSignedOwner`, `scopeAndRefsMatchOperation`, `queuedJobAfterUserLogoutStillRuns`, `anonymousUploadsOutputRendersDenied`, `previewCapabilityStillWorks`. Test TTL/algorithm/profile/UUID/missing secret fail closed and sibling owner resources. Do not print signed tokens or secrets.
- [ ] **Step 2: Implement service token profile/validators and attach fresh tokens per Node call/retry.** Enforce claim-ref relationships with submitted snapshot/job/path. Stop treating X-Studio-Owner+shared static header as authorization. Use one secret distinct from auth; no fallback open mode if missing.
- [ ] **Step 3: Guard all Python processing/private file routes and renderer legacy/status/cancel/artifact routes before side effects.** Convert static mounts to service-authorized handlers or remove if all results ingested; backend streaming calls send JWT and browser receives owner-authenticated web URL. Ensure large render durations continue after admitted request token expires. Limit internal network bindings and preserve isolated renderer iframe origin/media-cookie protocol.
- [ ] **Step 4: Verify strict TS/Python tests and existing renderer preview lifecycle/native acceptance tests affected by transport.** Actual integration check service request admitted, no-header refused, own snapshot preview both engines, other owner denied. Test fixtures carry real signed machine credentials, no production bypass env.
- [ ] **Step 5: Commit** `feat: secure processing and rendering with service jwt`.

### Task 5: Document, migrate local installation and validate complete journeys

**Files:**

- Create: `docs/authentication.md`, auth rollout/acceptance fixture script(s) under `scripts/` or `apps/web/test/` with clear dedicated test DB enforcement.
- Modify: `README.md`, `ARCHITECTURE.md`, `apps/web/.env.example`, root/service env examples, Docker startup/migration docs/config as necessary; focused corrections only from actual acceptance failures via their owning interfaces.

**Interfaces:**

- Consumes: completed Tasks 1–4 and all concrete scripts/config; no auth behavior invented only in docs.
- Produces: complete route/service policy and local bootstrap/run instructions, verified non-destructive local migration and seed, working local app available for user inspection.

- [ ] **Step 1: Document actual route matrix and claims/session/media/preview policy**, variables/secrets, explicit seed, credential-file location, fresh/existing install order, backups, normalization preflight and rollback limitation, rate limiting/origin behavior from installed Better Auth, troubleshooting 401 vs 404 vs 409 and session renewal. Remove active setup reliance on NextAuth. Do not expose real credentials.
- [ ] **Step 2: Run coherent full auth acceptance against isolated database** with migrated bcrypt user and second new user: signin/signup/logout/token/revoke, every functional route anonymous policy, cross-owner resources/job media, cookie-origin rejection, range, CAS409, native preview both engines, file→local Whisper→manual subtitles→clip→download and queued work after session expiry. One technical MP4 suffices unless a second engine-specific concern requires another. Preserve evidence paths/report and inspect browser screenshots.
- [ ] **Step 3: Run relevant unit/integration suites and production build/typechecks.** Use elevated approved runners for required local TCP/IPC; do not leave sandbox builds hung. Record exact results and unverified boundaries. Never label prior unreviewed R2 complete based on auth tests.
- [ ] **Step 4: Apply preflight and additive migration to local studio, then explicit idempotent seed.** Back up real DB before migration without printing rows/secrets; preserve private config, generate missing dedicated secret locally only if necessary. Seed twice and verify no credential reset. No fixture insertion/deletion in real DB. Start web/worker/Python/renderer, verify readiness and private browser access/login, and leave running for user. If source fixes occur after checks, rerun only checks affected.
- [ ] **Step 5: Commit documentation/acceptance** `docs: document and verify unified authentication`. Report actual localhost URL, base user email and private credential path. Do not claim auth done with pending security gaps. Publication to existing authorized feature branch follows final reviewed state, without main merge/force push.
