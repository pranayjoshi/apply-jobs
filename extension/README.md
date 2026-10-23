# Apply Jobs capture extension

1. Open chrome://extensions (or edge://extensions), enable Developer mode, and Load unpacked → select this `extension/` folder.
2. Open Apply Jobs → Integrations → Browser extension → Generate pairing code.
3. On a public job posting, open this extension and enter that code. Pairing expires after five minutes and permits five attempts.
4. Review the captured title/company/location and optional employer application URL, then Save.

Works with public pages on LinkedIn, Indeed, ZipRecruiter, and company sites using visible page content and JobPosting metadata. It captures only the active tab after a user gesture. It does not scrape your browsing history, bypass access controls, apply on LinkedIn/Indeed internally, or submit applications. If no direct employer link is available, the application browser opens the original posting for user handoff. Keep the local service on port 4318 running.

The paired token is local to the extension. Clearing the extension token disconnects its UI; use the dashboard's revoke button to revoke server access.
