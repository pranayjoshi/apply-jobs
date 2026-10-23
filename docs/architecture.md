# Apply Jobs architecture

## Runtime

One loopback Fastify service owns SQLite and a serialized browser controller. React reads the current workspace over a local API. The queue persists explicit stages; a single-process mutex ensures one browser workflow at a time. SQLite uses WAL and a unique application/job constraint. Run one service per data folder. This is a personal local application, not a distributed worker system.

Modules:

- `store.ts`: schema, persisted JSON records, unique identity, events, restart recovery.
- `jobs.ts`: public-page extraction, ATS recognition, three public feed adapters, deterministic ranking and policy gates.
- `network.ts`: public-URL validation, redirect validation, response-size/time limits.
- `llm.ts`: model discovery, serialized schema-bound tasks, profile extraction, exact-fact résumé selection.
- `answers.ts`: deterministic contact-field matching and exact saved answers. Unknown sensitive values stay unresolved.
- `documents.ts`: selectable-text résumé PDFs, local text extraction, hashes, receipts.
- `worker.ts`: dedicated browser profile, form inspection/filling, interventions, review hashes, submission and confirmation.
- `index.ts`: validated APIs, discovery scheduling, Autopilot, built-in practice form, static UI serving.

The local model chooses facts and drafts prose. It cannot run browser code, select arbitrary files, invoke commands, or bypass application policy. Model schemas and fact IDs bound its outputs; the résumé renderer uses the exact selected facts rather than generated factual rewrites.

## Application stages

`queued → preparing → filling → needs_user/review → submitting → submitted/unknown`

`needs_user` can return to `filling` after answers/login/manual steps. `skipped` is terminal. During startup, interrupted preparation, filling, or review becomes `needs_user`; interrupted submission becomes `unknown`. Unknown outcomes require user reconciliation. Application identity is unique per saved job; repeated queue requests return the existing application.

Final approval carries a browser snapshot hash. The worker compares the actual current field values and profile version before clicking. It persists intent before the click. Confirmation requires recognizable success text; lack of recognized confirmation is an uncertain outcome. The third party is not transactionally coordinated with SQLite, so exactly-once submission is not promised.

## Extending browser adapters

The initial worker is a conservative semantic form controller with ATS recognition. It is not a collection of reverse-engineered proprietary employer endpoints. Add deterministic platform handlers when an actual form shows a gap: autocomplete selection, repeated sections, date formatting, or custom validation. Preserve the review snapshot, unknown-outcome rules, single upload allowlist, and intervention mechanism. Record tenant/platform scope when claiming support.

Known constraints:

- Complex Workday employment/education widgets require manual intervention.
- Custom accessible controls can need manual selection; radio groups need useful question/group labels.
- Success detection is based on visible text and may miss custom confirmation wording.
- Some closed roles remain in the local shortlist; comprehensive closure reconciliation is not implemented.
- Lever sources can use the global or EU Postings API; the region is selected when connecting a board.
- Candidate work authorization is a basic user-defined target-country answer; save exact question-specific answers for jurisdiction or timing differences.
- Screenshots, browser sessions, and SQLite are local but not encrypted by the app.
- DNS validation rejects known private destinations. A hostile DNS-rebinding target is outside the current local-service threat model; do not expose the API remotely.
- No distributed leases, multi-user authentication, email ingestion, stealth browser, or CAPTCHA solving is implemented.

## Evidence and observability

Each application has a current field snapshot, profile version, document packet, attempt count, last browser screenshot, status messages, and activity events. Confirmed receipts include field values, timestamp, destination, document hash, and intent hash. Manual reconciliation is explicitly labeled. Logs avoid raw model prompts and browser credentials.

No analytics or remote fonts are loaded by the dashboard. Job sites may load their own third-party resources in the dedicated application browser.

## Verification performed

The project provides a small unit/integration suite plus a full practice workflow in a separate temporary data folder. The workflow uses real Playwright Chromium, real PDF rendering/upload, a missing-answer intervention, saved-answer reuse, review hashes, pause blocking, positive confirmation, duplicate prevention, and restart recovery. No employer applications are sent by verification.
