# Verification record — v0.2

Checked locally on October 23, 2026, using Node.js 24.22.1 and Playwright Chromium.

## Controlled checks

- Production bundle and TypeScript validation passed.
- Nine focused tests cover factual answers, policy gates and canonical identity, private-network rejection, PDF extraction, source snapshot reconciliation, filters/freshness, encrypted secrets/origin-bound pairing, conservative mail matching, and browser controls including wrapped labels/selects/radio groups.
- Connected API verification exercises an authenticated compatible model fixture, schema-bound inference, Ollama streaming pull progress, encrypted credentials and secret-free export, extension preflight/pair/capture/revoke, job pagination, and missing-key error preservation. These are controlled fixtures, not verification of personal paid accounts.
- Complete isolated practice workflow uses actual Chromium and a generated/uploaded PDF. It checks required-answer intervention, saved answer reuse, review hash rejection, pause, final confirmation/receipt, duplicate prevention, and interrupted-submission recovery without retry.
- Local OCR libraries extracted text from a synthetic image and a scanned PDF.
- The extension ZIP is generated from source as part of each build. The restarted production service returned its assets and valid ZIP successfully.
- MCP initialization, listing all eight tools, paginated job search and discovery-status calls passed through the SDK client.
- The production dependency audit reported zero known vulnerabilities at this check.

## Live public data and local model

The scratch discovery workspace fetched these public sources during verification:

| Feed | Listings observed | Snapshot |
|---|---:|---|
| Figma / Greenhouse | 140 | Complete |
| Linear / Ashby | 34 | Complete |
| SmartRecruiters company board | 1 | Complete |
| Workable company board (`careers`) | 1 | Complete |
| Remotive | 9 | Complete feed; provider delay still applies |
| Remote OK | 99 | Complete feed |
| Arbeitnow | 2,913 | Partial at configured pagination cap |

The first six-feed run stored 3,188 jobs and found 77 matches for a sample remote-engineering profile with a thirty-day age filter. The separate corrected Workable check returned one live role. Counts are observations at verification time, not permanent coverage promises. No keys were needed for these sources. Lever returned a valid empty public feed during the earlier release check; this does not establish live applications on Lever.

The actual project-local Ollama `qwen3:4b` passed structured inference and résumé extraction with the expanded employment/education schema. Prior checks also verified exact fact selection and cover-letter generation. This does not establish every other model's output compatibility.

## Validation still requiring user accounts or platforms

- Adzuna, USAJOBS and Jooble paths are implemented, but personal account keys have not been supplied for live account-specific verification.
- Authenticated compatible-model behavior passed a fixture; an actual LM Studio/llama.cpp/remote-provider account still needs the wizard's connection and inference check.
- IMAP reading/classification and matching are implemented; a real mailbox has not been connected.
- Extension pairing/capture passed API checks. Installation and capture in the user's Chrome/Edge profile still require loading the unpacked extension.
- The existing managed Ollama runtime works on this Mac. Fresh runtime installation and Linux/Windows behavior have not been verified on every platform.
- Named ATS strategies passed controlled forms, not live employer submission certification. Login, CAPTCHA, Workday, unusual controls, and employer-specific questions can require assistance.
- The earlier release UI was inspected. The current v0.2 visual inspection was blocked by the browser security policy for the localhost URL; no alternate browser route was used to bypass that restriction.

The delivered main workspace retains a blank, unconfirmed profile, no real applications, and Autopilot disabled. Verification uses scratch/temporary data. No employer application or recruiter email was sent.
