# Apply Jobs

Your private, local-first job application assistant. Discover opportunities, prepare documents from confirmed facts, fill application forms in a real browser, and keep a receipt for each confirmed submission. There are no application credits or monthly quotas.

Apply Jobs is an independent implementation. It does not use Tsenta's backend, code, accounts, or subscription.

## Run locally

Requires **Node.js 24+** and npm. macOS, Linux, and Windows can run the service; browser availability depends on Playwright's supported platforms.

```sh
npm install
npm run browser:install
npm run build
npm start
```

Open **http://127.0.0.1:4318**. On this Mac, `start.command` also starts the built app and uses the available bundled Node runtime if the default Node is too old.

For development:

```sh
npm run dev
```

The dashboard runs at http://127.0.0.1:4317 and proxies the service at port 4318. Only one instance should use a data folder at a time. The server binds to loopback; it is not a hosted multi-user service.

## First application

1. **My profile:** enter your contact details, experience, education, skills, and optional exact saved answers. Import a text-based PDF or TXT résumé if helpful. Confirm the facts and save.
2. **Settings:** optionally connect Ollama, LM Studio, or llama.cpp. Check the connection, choose an installed instruction model, and save. Factual form filling and PDF creation work without a model.
3. **Discover jobs → Practice:** create the local practice opportunity and add it to the application queue.
4. Open the application. A dedicated browser fills known fields and uploads the generated résumé. Answer any unresolved required questions in the dashboard, apply changes, and choose **Resume & validate**.
5. Review the answers and PDF, then approve the practice submission. A receipt appears when confirmation is detected. Nothing is sent to an employer by the practice form.
6. Add a real public job URL or follow company career boards to start your shortlist.

A visible browser is recommended. Login, MFA, CAPTCHA, custom controls, and unsupported steps pause for the user. Continue in that browser, then choose Resume. Browser sessions are stored in a dedicated local profile rather than your everyday browser profile.

## Local models

### Ollama

Install [Ollama](https://ollama.com/download), start its local server, and pull an instruction model appropriate for your memory. Set the endpoint to `http://localhost:11434`. Select the model name shown by **Check connection & find models**.

On this workspace, the official Ollama runtime and `qwen3:4b` are installed under the ignored `.apply-jobs/` directory. Apply Jobs starts that project-local server when needed and stops only the server it owns. It does not replace a pre-existing Ollama service. Models stay inside this workspace.

### LM Studio or llama.cpp

Start the local OpenAI-compatible server. Set the provider to **LM Studio / llama.cpp**, and use its `/v1` base URL, commonly `http://localhost:1234/v1`. The loaded model must support chat and JSON-schema structured outputs. API-key authentication is not currently implemented; use a trusted local endpoint without authentication.

Model tasks are serialized and bounded. Résumé tailoring selects existing profile facts and preserves their exact wording; it does not invent new achievements. The optional cover letter is a draft for review and can be copied into the appropriate application answer. Model-generated cover letters are not auto-submitted. No cloud fallback is configured. Choosing a remote endpoint explicitly sends relevant candidate text to that endpoint.

## Discovery and browser coverage

| Platform | Discovery | Browser application support |
|---|---|---|
| Greenhouse | Documented public Job Board feed | Label-based fields, standard selects, uploads, radio groups, final review. Custom controls may require intervention. |
| Lever | Documented public global Postings feed | Apply-link navigation, standard fields/uploads, review and confirmation. EU discovery feed is not yet included. |
| Ashby | Documented public postings feed | Standard labeled controls, uploads, conditional steps; custom widgets may need manual selection. |
| Workday/custom | Pasted public URL | Assisted generic form filling; tenant-specific work history/date widgets are not a certified automated adapter. |

A company board identifier is the slug in its career URL. The watchlist polls while the service is running, with a configurable interval and retry backoff. Public APIs retrieve job postings; applications are submitted through employer-hosted forms. Employer API keys are not required or obtained.

These browser capabilities have been verified on the built-in controlled form. They are **not a claim of live submission certification on every tenant**. Every real employer customizes forms. The worker uses accessible labels, current field values, and platform URL recognition; it stops when it cannot establish a safe next step. There is no CAPTCHA bypass, stealth infrastructure, global company index, or guarantee of interview outcomes. Closed-job synchronization is not yet comprehensive; verify a role is open before applying.

## Autopilot

Autopilot is off by default. Save your roles, locations, excluded employers, and minimum preference score. Confirm the profile, then explicitly enable unattended applications. It can queue matching Greenhouse, Lever, and Ashby postings and submit forms whose required fields resolve from confirmed profile facts or exact saved answers. A global pause stops future automation actions.

- Title/location/excluded-company filters are hard gates for Autopilot.
- Matching scores are simple, explainable keyword/preference scores, not hiring probabilities.
- Only one browser application runs at a time. Logins, challenges, unknown answers, and missing controls enter **Needs you**.
- Hardware, server uptime, employer rules, and throttling constrain actual volume. “No quotas” does not mean infinite throughput.
- Do not enable Autopilot until you have reviewed your profile, tested your target employer forms, and understood what your saved answers authorize.

## Submission and recovery

Final approval binds to the current browser form snapshot and profile version. Changed values or a changed profile require another review. A local intent record is saved before clicking Submit, followed by a receipt only when positive confirmation text is observed. Confirmation detection can miss nonstandard messages.

If the service restarts during submission, or submission lacks a detected confirmation, the application becomes **Confirm outcome**. It is never automatically retried. Check the employer account or confirmation email and explicitly reconcile the result in the dashboard. Exactly-once delivery cannot be guaranteed across a third-party browser form.

## Data and privacy

All workspace files are stored under `.apply-jobs/` by default:

```text
apply-jobs.sqlite      profile, settings, jobs, queue, answers, activity
browser/               dedicated browser profile and session state
documents/             original résumé and per-application PDFs
receipts/              screenshots and JSON submission receipts
```

The directory is ignored by Git and created with restrictive permissions. SQLite and browser files are **not encrypted by the app**. Use device encryption and protect backups. Secrets can reside in the dedicated browser's session state; no employer password is requested through the dashboard. Avoid sharing this directory or exports. The UI's export includes personal profile and application data but excludes browser session files.

The dashboard ships fonts locally and has no analytics. Internet access is used for public job discovery, employer forms, and an explicitly selected remote model endpoint, if any. Local API mutations require an application header and validate browser origins. Job imports reject private-network destinations; model endpoint configuration is separate. External page text cannot invoke shell commands or choose arbitrary uploads. The browser can upload only the application résumé generated for that attempt.

Stop the app before deleting `.apply-jobs/` to erase the workspace. There is no automated email sync, recruiter email sending, native mobile client, or hosted deployment in this release. Use manual application status confirmation when needed.

## CLI and MCP

```sh
npm run cli -- help
npm run cli -- jobs
npm run cli -- add https://public-job-url.example/role
npm run cli -- pause
npm run cli -- export my-private-export.json
```

The optional MCP stdio server uses the same running local service:

```sh
npm run mcp
```

For an MCP client, launch the project's Node executable with `--import tsx /absolute/path/to/apply-jobs/scripts/mcp.ts` and set the working directory to this project (or use an absolute path to the local `tsx` import). It exposes job listing/import, application queuing/status/resume, and pause controls. Individual final approval stays in the dashboard. If you connect a cloud-based assistant, that assistant may receive private data returned by the tools; a local service does not make a cloud client private.

`APPLY_JOBS_URL` changes the CLI/MCP service URL. `PORT` changes the API port. `APPLY_JOBS_DATA` changes the private data folder. `APPLY_JOBS_CHROME` optionally selects an installed Chromium executable. `APPLY_JOBS_HEADLESS=1` is useful for controlled automation checks. Environment variables must be set by your shell/process manager; `.env` files are examples and are not automatically loaded.

## Verification

```sh
npm run build
npm test
npm run verify:workflow
```

The focused checks cover factual answers, hard policy gates, private-network blocking, PDF text extraction, and an isolated complete practice application. The workflow also checks deduplication, changed approval hashes, pause behavior, receipts, and restart recovery. It creates a disposable temporary workspace and sends no applications to employers.

For development, the service and browser worker live in `server/`; dashboard components and styles are in `src/`. The implementation uses React, TypeScript, Fastify, SQLite, Playwright, Zod, and local-model HTTP adapters. See [docs/architecture.md](docs/architecture.md) for extension points and limitations.

## License

MIT. Model weights and dependencies retain their own licenses. No Tsenta or REA source is included in the runtime.
