import { chmod, writeFile } from 'node:fs/promises';
const [command = 'help', ...args] = process.argv.slice(2);
const base = (process.env.APPLY_JOBS_URL || 'http://127.0.0.1:4318').replace(/\/+$/, '');
async function request(route: string, body?: unknown) {
  const r = await fetch(base + '/api' + route, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'X-Apply-Jobs': 'local', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(180000),
  });
  const d = (await r.json().catch(() => ({}))) as any;
  if (!r.ok) throw new Error(d.error || `Service returned HTTP ${r.status}`);
  return d;
}
try {
  let value: any;
  if (command === 'help') {
    console.log(
      `Apply Jobs CLI\n\n  npm run cli -- status\n  npm run cli -- jobs [search]\n  npm run cli -- sources\n  npm run cli -- discover\n  npm run cli -- add <public-job-url>\n  npm run cli -- apply <job-id>\n  npm run cli -- applications\n  npm run cli -- resume <application-id>\n  npm run cli -- pause\n  npm run cli -- unpause\n  npm run cli -- export [output.json]\n\nThe local Apply Jobs service must be running. Review and final submission are available in the dashboard.\n`,
    );
    process.exit(0);
  }
  if (command === 'status') {
    const s = await request('/state');
    value = {
      profileConfirmed: s.profile.confirmed,
      model: s.modelStatus,
      queued: s.applications.filter((a: any) => a.stage === 'queued').length,
      paused: s.settings.paused,
    };
  } else if (command === 'jobs') {
    const text = args.join(' ');
    if (text.length > 300) throw new Error('Search text must be 300 characters or less.');
    const query = new URLSearchParams({ matching: 'false', q: text });
    value = await request(`/jobs/search?${query}`);
  } else if (command === 'sources') value = (await request('/state')).sources;
  else if (command === 'discover') value = await request('/discovery/start', {});
  else if (command === 'applications') value = (await request('/state')).applications;
  else if (command === 'add' && args[0]) value = await request('/jobs/import', { url: args[0] });
  else if (command === 'apply' && args[0]) value = await request(`/jobs/${args[0]}/apply`, {});
  else if (command === 'resume' && args[0])
    value = await request(`/applications/${args[0]}/resume`, {});
  else if (command === 'pause' || command === 'unpause')
    value = await request('/pause', { paused: command === 'pause' });
  else if (command === 'export') {
    value = await request('/export');
    if (args[0]) {
      await writeFile(args[0], JSON.stringify(value, null, 2), { mode: 0o600 });
      if (process.platform !== 'win32') await chmod(args[0], 0o600);
      console.log(`Export saved to ${args[0]}`);
      process.exit(0);
    }
  } else throw new Error('Unknown command or missing argument. Run npm run cli -- help.');
  console.log(JSON.stringify(value, null, 2));
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
}
