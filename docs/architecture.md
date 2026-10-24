# Apply Jobs architecture

## Runtime

One loopback Fastify service owns SQLite and a serialized browser controller. React reads the current workspace over a local API. The queue persists explicit stages; a single-process mutex ensures one browser workflow at a time. SQLite uses WAL and a unique application/job constraint. Run one service per data folder. This is a personal local application, not a distributed worker system.

Modules:

- `store.ts`: schema, persisted JSON records, unique identity, events, restart recovery.
- `jobs.ts`: public-page extraction, ATS recognition, URL identity, deterministic ranking and policy gates.
- `discovery.ts`: eleven feed/search adapters, source observations, partial-snapshot reconciliation, filtering, pagination, refresh progress and rate-limit scheduling.
- `model-setup.ts`, `installer.ts`, `local-model.ts`: model onboarding, real inference probes, managed runtime installation, model download progress and local process ownership.
- `secrets.ts`: encrypted credential storage and redacted errors.
- `extension.ts`: expiring pairing, origin-bound capture tokens and revocation.
- `inbox.ts`: read-only TLS IMAP, bounded message parsing, conservative application matching and separate recruiter status.
- `adapters.ts`: per-platform form and navigation strategies.
- `upgrade-routes.ts`: discovery, onboarding, integrations, inbox and document-review APIs.
- `network.ts`: public-URL validation, redirect validation, response-size/time limits.
- `llm.ts`: model discovery, serialized schema-bound tasks, profile extraction, profile-selected résumé strategies, bounded fact selection and grounded rewrite verification.
- `answers.ts`: deterministic contact-field matching and exact saved answers. Unknown sensitive values stay unresolved.
- `documents.ts`: selectable-text résumé PDFs, PDF/DOCX text extraction, image/scanned PDF OCR, hashes, receipts.
- `worker.ts`: dedicated browser profile, form inspection/filling, interventions, review hashes, submission and confirmation.
- `index.ts`: validated APIs, discovery scheduling, Autopilot, built-in practice form, static UI serving.

The local model chooses facts and drafts prose. It cannot run browser code, select arbitrary files, invoke commands, or bypass application policy. Model schemas and fact IDs bound its outputs; original mode preserves an uploaded PDF. Tailored modes retain fact IDs and expose accepted wording edits; deterministic guards reject identity/education edits and new numeric claims, and a schema-bound verification pass rejects unsupported proposals. Review mode binds final approval to the documents and form; enabled Autopilot applies the saved strategy. Model checks can err, so wording remains inspectable.

## Application stages

`queued → preparing → filling → needs_user/review → submitting → submitted/unknown`

`needs_user` can return to `filling` after answers/login/manual steps. `skipped` is terminal. During startup, interrupted preparation, filling, or review becomes `needs_user`; interrupted submission becomes `unknown`. Unknown outcomes require user reconciliation. Application identity is unique per saved job; repeated queue requests return the existing application.

Final approval carries a browser snapshot hash. The worker compares the actual current field values and profile version before clicking. It persists intent before the click. Confirmation requires recognizable success text; lack of recognized confirmation is an uncertain outcome. The third party is not transactionally coordinated with SQLite, so exactly-once submission is not promised.

## Extending browser adapters

The worker combines a semantic form controller with named Greenhouse, Lever, Ashby, SmartRecruiters and Workable strategies. Workday and generic forms remain assisted. It is not a collection of reverse-engineered proprietary employer endpoints. Add deterministic platform handlers when an actual form shows a gap: autocomplete selection, repeated sections, date formatting, or custom validation. Preserve the review snapshot, unknown-outcome rules, approved document upload allowlist, and intervention mechanism. Record tenant/platform scope when claiming support.

Known constraints:

- Complex Workday employment/education widgets require manual intervention.
- Custom accessible controls can need manual selection; radio groups need useful question/group labels.
- Success detection is based on visible text and may miss custom confirmation wording.
- Freshness depends on provider observations. Full employer snapshots reconcile closure; aggregator omissions become stale. Partial fetches do not close missing roles. Public posting checks cannot establish availability behind login or bot challenges.
- Lever sources can use the global or EU Postings API; the region is selected when connecting a board.
- Candidate work authorization is a basic user-defined target-country answer; save exact question-specific answers for jurisdiction or timing differences.
- Screenshots, browser sessions, and SQLite are local but not encrypted by the app.
- DNS validation rejects known private destinations. A hostile DNS-rebinding target is outside the current local-service threat model; do not expose the API remotely.
- No distributed leases, multi-user authentication, outbound email, stealth browser, or CAPTCHA solving is implemented.

## Evidence and observability

Each application has a current field snapshot, profile version, document packet, attempt count, last browser screenshot, status messages, and activity events. Confirmed receipts include field values, timestamp, destination, document hash, and intent hash. Manual reconciliation is explicitly labeled. Logs avoid raw model prompts and browser credentials.

No analytics or remote fonts are loaded by the dashboard. Job sites may load their own third-party resources in the dedicated application browser.

## Verification performed

The project provides a small unit/integration suite plus a full practice workflow in a separate temporary data folder. The workflow uses real Playwright Chromium, real PDF rendering/upload, a missing-answer intervention, saved-answer reuse, review hashes, pause blocking, positive confirmation, duplicate prevention, and restart recovery. No employer applications are sent by verification.

## Discovery and account integrations

Each listing retains source observations and attribution. Successful complete snapshots reconcile only their own observations. The local active state considers other sources, expiry, and last-seen age. Search results never imply a complete employer inventory. Scheduler cooldowns are persisted; per-source locks prevent overlapping refresh. Credentialed feeds default to manual refresh. Query expansion and page limits bound work and allowance use. The starter company directory is a small editable set, not a global company index.

Credentials are AES-256-GCM encrypted; the random key is stored separately on the same device with restricted permissions. APIs return configured flags only. The extension has no general local-API access; its expiring pairing exchanges a code for a token bound to the calling extension origin. Model URLs are configurable independently of public-job network restrictions.

The IMAP client opens INBOX read-only over TLS, searches a bounded recent date window, and parses limited snippets without attachments. Ambiguous matches remain unlinked. Recruiter status cannot overwrite submission receipts. Generated reply text is stored locally and never sent.

The four-step React wizard connects/test models, imports/reviews profile facts, saves filters/sources and starts discovery. Polling surfaces source and download progress. Paginated search avoids returning the entire job index with each state poll. The local service and SQLite remain a single-process design; large global indexes would require additional indexing and background infrastructure.

## Expanded discovery

Himalayas, Jobicy, We Work Remotely, and arbitrary public RSS/Atom feeds are supported. New installations and the one-time expanded-discovery migration enable the three named feeds and set the preferred polling interval to two minutes. Greenhouse, Lever, Ashby and custom feeds use a two-minute minimum; cached/delayed providers retain longer schedules (Jobicy hourly; Himalayas daily). Due sources are ordered by scheduled time and fetched serially. Failures back off at least an hour. API sources with credentials remain manual by default.

Conditional requests reuse ETag/Last-Modified responses in a process-local cache bounded to 64 URLs and 20 MB of payload. RSS parsing is capped at 500 entries; Himalayas and Jobicy traversals are capped at five pages and treated as partial snapshots. Feed attribution, expiry, and supplied company logos are retained. Logos load lazily with no referrer; unavailable logos use colored initials. Discovery defaults to newest publication and offers quick fit sorting. Restart the service to activate the migration and updated backend, then reload the dashboard.

## Browser progression and document modes

Start requests reserve the single browser operation synchronously and reject unconfirmed profiles, pause and competing sessions before responding. Fields are filtered to application forms rather than newsletter/search forms. Browser-native validity is checked after filling. Next-step clicks wait for a changed page/form and stop on stalled validation instead of repeating a click. Completed steps persist as read-only history and are included in receipts. Unknown submission outcomes remain non-retryable; positive confirmation is polled for a bounded interval.

Profile résumé modes are `original`, `tailored`, and `maximize`. Mode selection is used by the browser worker and explicit document preparation. Fact IDs retain their source text alongside proposed edits. The Jake-style renderer emits text PDFs; original-mode PDF uploads are copied without modification. PDF extraction sorts visual rows to avoid positioned content being read after unrelated section headings.

## Country controls and US discovery

Discover offers country filtering and country alphabetical sorting across the full result set before pagination. Country labels are inferred from explicit location country names/codes and US state suffixes; unrecognized or unspecified locations remain unspecified. This does not infer work authorization or remote eligibility.

Workday employer sources accept an HTTPS `tenant.wdN.myworkdayjobs.com/site` career URL and use its public career-search route, fetching at most five pages / 100 listings per run. Results are partial snapshots; multi-location summary text can omit countries and publication dates are left unknown when the source only supplies relative labels. This is tenant-dependent public search support, not a global Workday feed or certified submission compatibility. NVIDIA is available in the employer picker.

SimplifyJobs imports its public New-Grad-Positions and Summer2027-Internships GitHub datasets hourly, retaining original application URLs, publication dates and attribution, and excluding inactive/hidden entries. The internship repository is explicitly season-specific. It does not search the full simplify.jobs service. A one-time migration enables the Simplify source. Ashby remains available through employer board identifiers and quick selections including Linear, OpenAI, Notion, Ramp and Vercel.

## Live application activity and continuation

Each application retains up to forty timestamped status changes. The drawer shows recent activity, the current employer origin/path (without query parameters), and its latest browser preview. Previews refresh at most once every fifteen seconds while waiting; existing workspace polling delivers updates.

Live sessions waiting for authentication or a changing page are checked by the serialized queue tick. Authentication must clear and an application control or field must be present before continuation. Other stalled pages retry only after the browser fingerprint changes, including action-button enabled state. Automatic retries are capped at three; explicit Resume renews the retry allowance. Global Pause, application locks, terminal stages, required unanswered questions, and submission approval rules still apply. Browser monitoring does not create accounts, solve verification challenges, or automatically retry uncertain submissions.

## Browser preference

Settings offers System default (the initial preference), Chrome, Edge and the bundled Chromium browser. The HTTPS handler is detected at service startup from macOS Launch Services, Linux xdg-settings or Windows URL associations. A default Chrome or Edge runs a dedicated automated profile. Other defaults, including Safari, open through the OS in the user's ordinary browser and clearly report that automatic filling is unavailable. Autopilot does not queue new applications while the selected browser cannot be automated. Browser preferences apply to the next session; an existing controlled browser retains its session. Explicit headless verification uses bundled Chromium. Installed Chrome/Edge must be present to use those choices. Safari automation and an extension bridge for controlling existing user tabs are not implemented.
