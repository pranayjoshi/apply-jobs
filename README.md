# Apply Jobs

An open-source, local job application assistant. Connect a local model or your own API, discover matching opportunities, prepare documents from confirmed facts, fill employer forms in a dedicated browser, and track applications. Apply Jobs imposes no application-credit quota. Source providers, employer sites, your hardware, and model services still have limits.

This is an independent implementation, with no Tsenta backend, code, accounts, or subscription. MIT licensed.

## Run locally

Requires **Node.js 24+** and npm:

```sh
npm install
npm run browser:install
npm run build
npm start
```

Open **http://127.0.0.1:4318**. On this Mac, `start.command` also launches the built app and selects the available bundled Node runtime if needed. Run one service per data folder. This is a personal loopback service, not a hosted multi-user application.

For development, `npm run dev` serves the dashboard on port 4317 and the API on 4318. Production serves both on 4318.

## Guided onboarding

The **Get started** wizard guides you through four steps:

1. **Connect a model.** Select Ollama, LM Studio, llama.cpp, or an OpenAI-compatible API. Detect available models, select one, and run an actual structured-output inference check. An optional API key is saved in the local encrypted vault. Ollama users can install the official project-local runtime on macOS/Linux and download a recommended model with progress and cancellation.
2. **Review your profile.** Import TXT, PDF, DOCX, or an image résumé. Scanned PDFs/images use local English OCR; the first OCR use downloads language data. Review extracted facts, contact details, employment and education history before confirming. OCR examines up to four scanned pages; text extraction accepts up to thirty PDF pages.
3. **Set job filters.** Choose titles, locations, remote work, job type, seniority, posting age, salary/currency, excluded companies, and optional minimum fit. Select public feeds and company boards. Salary filtering uses reported amounts without exchange-rate conversion; you can exclude listings with missing salary.
4. **Fetch matches.** Follow per-source progress, errors, timestamps, and coverage. Open Discover to browse paginated results sorted by fit or publication date.

Profile extraction and generated answers need your review. Do not use invented sample facts for real applications.

## Model connections

| Provider | Typical endpoint | Setup |
|---|---|---|
| Ollama | `http://localhost:11434` | Install/start Ollama or use the wizard's project-local installer; download an instruction model. |
| LM Studio | `http://localhost:1234/v1` | Load a model, open Developer, start the server. Supply a token if authentication is enabled. |
| llama.cpp | `http://localhost:8080/v1` | Start its compatible server with a loaded instruction model. |
| Your API | Your provider's `/v1` base | Supply your key and model identifier; chat plus JSON-schema structured outputs must work. |

The wizard checks inference, not merely a successful model-list request. Hardware recommendations are estimates. The macOS/Linux installer downloads an official Ollama release, verifies its published SHA-256 digest, and installs inside the private workspace. Windows uses manual vendor installation. Apply Jobs starts/stops only the local Ollama process it owns and does not replace a pre-existing service.

On this workspace, the project-local Ollama runtime and `qwen3:4b` are installed. Model tasks are serialized. My profile offers three résumé modes: Original, Tailored (restrained factual edits), and Strongest match (more extensive relevant wording). Original uploads preserve the original PDF bytes; generated versions use a Jake’s Resume-style serif layout. Tailored modes cite existing fact IDs, protect identity/education/metrics, check proposed wording against the background, and expose before/after edits. Review mode includes these documents in final approval; Autopilot follows the saved strategy. AI grounding checks reduce unsupported edits but do not replace your review. Cover letters and proposed question answers are reviewable drafts. Selecting a remote endpoint sends the relevant candidate text to that provider; there is no automatic cloud fallback. Free local weights retain their own licenses; API usage may cost money.

## Discovery coverage

| Source | Connection | Coverage and limits |
|---|---|---|
| Greenhouse, Lever, Ashby | Company career URL/board identifier | Public employer feeds. Lever supports global and EU boards. |
| SmartRecruiters, Workable | Company career URL/identifier | Public postings, pagination/details where supported. Workable needs a company career page, not its `/j/` job short link. |
| Remotive | No key | Remote jobs; feed is delayed 24 hours. Refresh at most once every six hours. |
| Remote OK | No key | Public feed, cached at least an hour, with source attribution. |
| Arbeitnow | No key | Public feed, hourly refresh, bounded pagination. A capped fetch is labeled partial. |
| Adzuna | App ID and app key | Country-specific searches. Your account's access terms and limits apply. |
| USAJOBS | API key and registration email | Federal jobs with title/location/date filters. |
| Jooble | API key; optional regional domain | Search API. Its documented free key has 500 lifetime requests. |
| LinkedIn, Indeed, ZipRecruiter | Browser capture or pasted public URL | Save the selected posting and follow an employer application link. No unrestricted global search or Easy Apply automation is claimed. |

Add public feeds/company boards from Discover. Configure credentialed providers in **Integrations** and add their source in Discover. Credentialed search sources default to manual refresh so background polling does not silently spend your allowance. Searches and pagination are bounded; results are not a census of every available job. No service can guarantee all jobs across private, login-only, delayed, or restricted feeds.

Refresh respects each source's minimum interval and retry backoff. The UI shows last sync, next eligible sync, errors, publication date, and completeness. Complete employer snapshots can mark missing jobs closed; missing aggregator listings become stale. Partial or failed fetches preserve previous jobs. Cross-source observations prevent one disappearance from overriding another active source. Expiry dates and source age filter the active shortlist. A best-effort posting check runs before application; blocked pages do not prove a role is closed.

Source attribution and original links remain visible. Publication dates are those supplied by the provider, not the time Apply Jobs discovered the posting. Fit scores are explainable keyword/preference scores, not hiring probabilities.

## Browser capture extension

In **Integrations**, download the extension ZIP and extract it. In Chrome/Edge extensions, enable Developer mode and load the extracted folder as an unpacked extension. Generate a pairing code in Apply Jobs and enter it in the extension within five minutes. See [extension/README.md](extension/README.md).

On a job page, open the extension, review the captured title/company/location and employer application URL, then save it. It reads the selected active tab when invoked, rather than crawling your browsing history. The token is bound to that extension origin and can be revoked in Integrations. The extension connects to the running local service.

## Application workflow

Start with **Discover → Practice**. This controlled form exercises document upload, required-answer intervention, review, submission, and receipt creation without contacting an employer.

For a real role, confirm your profile, queue the job, and open the application. Five named browser strategies cover Greenhouse, Lever, Ashby, SmartRecruiters, and Workable. They handle accessible fields, standard/custom selection controls, radio groups, résumé uploads, conditional steps, and employer handoffs where recognizable. Workday and generic sites use assisted mode. LinkedIn/Indeed capture routes require employer handoff or manual steps.

Review the generated résumé, fact differences, any cover letter, and answers. The final-submit action appears at the top when the form is ready. Missing profile confirmation is reported before a browser operation starts. Applying answer changes automatically resumes validation. Completed multistep fields remain available in the application and receipt. A model can propose text answers grounded in profile fact IDs; save them only after review. Confirm the cover letter before its upload. Unknown questions, login, MFA, CAPTCHA, unsupported widgets, and ambiguous steps pause for you. Use the dedicated browser to finish the step, then Resume & validate.

These strategies are implemented and checked on controlled browser forms. Live submission compatibility has not been certified for every employer tenant. Employer customization can require manual work. No CAPTCHA bypass, stealth service, or employer private API is included.

## Autopilot and recovery

Autopilot is off by default. It requires a confirmed profile and explicit activation. It queues supported automatic-platform jobs that satisfy the saved title/location/company/salary/age/type policy and minimum score. Unresolved answers and unsupported steps still pause. One browser application runs at a time; global Pause stops future actions. Review target forms and your saved answers before enabling unattended submissions.

Final approval binds to the current form snapshot and profile version. Changed values require renewed review. The worker saves intent before clicking Submit and records a receipt only after recognized confirmation. An interrupted or unconfirmed submission becomes **Confirm outcome** and is never automatically retried. Inspect the employer account/email and reconcile it yourself. Third-party browser forms cannot provide a transactional exactly-once guarantee.

## Read-only inbox

Optionally connect an IMAP mailbox in **Integrations** using its TLS hostname, username, and app password. Sync searches the last thirty days for application/recruiting messages, reads bounded snippets without attachments, categorizes confirmations/interviews/rejections, and conservatively matches applications. Ambiguous messages remain unlinked until you choose an application.

Recruiter updates are separate from submission receipts. Reply drafts stay local for you to copy and review. The app does not send mail. Real mailbox verification requires your account credentials; providers may require enabling IMAP or issuing an app password.

## Data and privacy

Private files live in the ignored `.apply-jobs/` directory:

```text
apply-jobs.sqlite      profile, jobs, queue, answers, inbox snippets, activity
vault.enc / vault.key encrypted API keys, mailbox credentials, pairing token
browser/              dedicated browser session state
documents/            source résumé and application PDFs
receipts/             screenshots and submission receipts
runtime/              optional managed Ollama executable
ocr-cache/            local OCR language data
```

The vault uses AES-256-GCM and restrictive file permissions. Its key lives on the same device; it does not protect against a compromised local account. SQLite, documents, receipts, and browser sessions are not encrypted by the app. Protect the device and backups. Export contains private candidate/application data but excludes vault secrets and browser sessions. No employer password is requested in the dashboard.

The dashboard uses local fonts and has no analytics. Network access is used for job feeds, employer pages, explicitly selected model providers, optional runtime/model/OCR downloads, and optional IMAP. Local mutations require the app header and validated origins. Extension access is limited to pairing/token endpoints. Job fetching blocks private network destinations. External page text cannot invoke commands or select arbitrary upload files. Do not expose this service to the public Internet.

## CLI and MCP

```sh
npm run cli -- help
npm run cli -- jobs engineer
npm run cli -- sources
npm run cli -- discover
npm run cli -- add https://public-job-url.example/role
npm run cli -- pause
npm run cli -- export my-private-export.json
npm run mcp
```

The MCP stdio server exposes paginated job search/import, latest-job refresh/progress, application queue/status/resume, and pause. Final individual approval stays in the dashboard. Launch Node with `--import tsx /absolute/path/to/apply-jobs/scripts/mcp.ts`, with this project as working directory. A cloud MCP client can receive the private information returned by tools.

`APPLY_JOBS_URL` changes CLI/MCP service URL; `PORT` the server port; `APPLY_JOBS_DATA` the private folder; `APPLY_JOBS_CHROME` an optional Chromium executable; `APPLY_JOBS_HEADLESS=1` enables headless controlled checks. Environment files are examples, not automatically loaded.

## Verification and scope

```sh
npm run build
npm test
npm run verify:integrations
npm run verify:workflow
```

The focused checks cover policy/identity, filters and freshness, encrypted secrets, pairing/origins, mail matching, browser fields, model connection/pull, pagination, document upload, review hashes, receipts, and restart recovery. Controlled checks use separate temporary workspaces and send no employer applications. See [docs/verification.md](docs/verification.md) for live-feed evidence, real local-model checks, and remaining account/platform validation.

React/TypeScript UI is in `src/`, service/browser code in `server/`, and CLI/MCP/verification in `scripts/`. See [docs/architecture.md](docs/architecture.md). Native mobile clients, hosted multi-user deployment, sending recruiter emails, and universal employer-form compatibility are outside this release.

## Résumé layout reference

The generated PDF layout is an independent HTML/CSS implementation inspired by [Jake Gutierrez’s MIT-licensed résumé template](https://github.com/jakegut/resume): centered contact header, serif type, ruled section headings, aligned dates and compact bullets. It uses selectable text and Letter pages. It does not require a TeX installation. Longer histories may span multiple pages; content is not silently cut to fit one page. Original uploaded PDFs retain their own layout.
