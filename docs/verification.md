# Verification record

Verified locally on October 23, 2026, with Node.js 24.19.0 and Playwright Chromium.

- Production build and TypeScript checks passed.
- Four focused automated checks passed: factual answer mapping, hard Autopilot gates and URL identity, private-network rejection, and PDF rendering/text extraction.
- Isolated full workflow passed: queue a practice job, prevent duplicate queuing, render/upload a real PDF, fill known fields, pause for a required answer, save/reuse the answer, review, reject a stale approval, reject a paused submission, submit, and capture positive confirmation and a receipt.
- Restart simulation passed: an interrupted submission recovered as an unknown outcome without an automatic retry.
- Real project-local Ollama/Qwen3 4B returned schema-valid fact selection, cover-letter text, and résumé extraction. The selected résumé facts retained their supplied text.
- MCP initialization, listing of six tools, and a read-only job-list call passed through the SDK client.
- Public discovery checks read 141 Greenhouse roles and 34 Ashby roles from the selected boards. The selected Lever board returned a valid empty list. These are acquisition results, not permanent job counts or platform submission success rates.
- The dependency audit reported zero known production dependency vulnerabilities at verification time.
- The dashboard, model settings, profile form, and import dialog were inspected in the browser. The production app was relaunched using `npm start` with automatic selection of the available Node 24 runtime.

The delivered workspace has a blank, unconfirmed candidate profile, no real applications, and Autopilot disabled. No employer application was sent. Live employer-specific submission compatibility is not established by the controlled form checks; Workday and unusual controls may require manual assistance.
