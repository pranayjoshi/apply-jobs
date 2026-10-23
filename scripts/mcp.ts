import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
const base = process.env.APPLY_JOBS_URL || 'http://127.0.0.1:4318';
const server = new McpServer({ name: 'apply-jobs', version: '0.1.0' });
async function request(route: string, body?: unknown) {
  const r = await fetch(base + '/api' + route, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'X-Apply-Jobs': 'local', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(180000),
  });
  const data = (await r.json()) as any;
  if (!r.ok) throw new Error(data.error);
  return data;
}
const output = (data: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
});
server.registerTool(
  'list_jobs',
  {
    description: 'List locally saved opportunities. Does not submit applications.',
    inputSchema: {},
  },
  async () => output((await request('/state')).jobs),
);
server.registerTool(
  'import_job',
  {
    description: 'Import a public job posting URL into the local workspace.',
    inputSchema: { url: z.url() },
  },
  async ({ url }) => output(await request('/jobs/import', { url })),
);
server.registerTool(
  'queue_application',
  {
    description:
      'Queue an application using the confirmed candidate profile. Review mode pauses before final submission; enabled Autopilot follows the saved policy.',
    inputSchema: { jobId: z.string().uuid() },
  },
  async ({ jobId }) => output(await request(`/jobs/${jobId}/apply`, {})),
);
server.registerTool(
  'list_applications',
  {
    description:
      'List local application status, required answers and receipts. This may contain private candidate information.',
    inputSchema: {},
  },
  async () => output((await request('/state')).applications),
);
server.registerTool(
  'resume_application',
  {
    description:
      'Open or resume the browser workflow. Uses the existing submission policy; cannot retry uncertain submissions.',
    inputSchema: { applicationId: z.string().uuid() },
  },
  async ({ applicationId }) => output(await request(`/applications/${applicationId}/resume`, {})),
);
server.registerTool(
  'pause_automation',
  {
    description: 'Pause or resume queued application and discovery work.',
    inputSchema: { paused: z.boolean() },
  },
  async ({ paused }) => output(await request('/pause', { paused })),
);
// Deliberately keep final one-off approval in the dashboard, where the user can inspect the current form and PDF.
await server.connect(new StdioServerTransport());
