import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { createHash } from 'node:crypto';
import { publicURL } from './network.ts';
import { secret, redact } from './secrets.ts';
import * as store from './store.ts';
import type { InboxItem, Application } from '../src/types.ts';
interface InboxState {
  messages: InboxItem[];
  lastSync: string;
  error: string;
  syncing: boolean;
}
let running = false;
export function inboxState(): InboxState {
  return {
    ...store.getKV<InboxState>('inbox', { messages: [], lastSync: '', error: '', syncing: false }),
    syncing: running,
  };
}
function saveInbox(state: InboxState) {
  const latest = store.getKV<InboxState>('inbox', {
    messages: [],
    lastSync: '',
    error: '',
    syncing: false,
  });
  const latestMessages = new Map(latest.messages.map((message) => [message.id, message]));
  state.messages = state.messages.map((message) => {
    const current = latestMessages.get(message.id);
    if (!current) return message;
    return {
      ...message,
      ...(current.applicationId
        ? { applicationId: current.applicationId, matchReason: current.matchReason }
        : {}),
      ...(current.replyDraft !== undefined ? { replyDraft: current.replyDraft } : {}),
    };
  });
  store.setKV('inbox', state);
}
export function classifyMail(subject: string, body: string): InboxItem['category'] {
  const text = (subject + ' ' + body).toLowerCase();
  if (
    /unfortunately|not (?:be )?(?:moving|move|proceeding|proceed)(?: forward)?|(?:won't|will not|cannot|can't) (?:be )?(?:moving|move|proceeding|proceed) forward|other candidates|(?:selected|chosen) another candidate|position has been filled|not selected|regret to inform/.test(
      text,
    )
  )
    return 'rejection';
  if (
    /interview|schedule.{0,30}(?:call|conversation)|availability.{0,50}(?:call|chat)|next steps/.test(
      text,
    )
  )
    return 'interview';
  if (
    /application.{0,35}(?:received|submitted)|thank you for applying|thanks for (?:applying|your interest)|received your application/.test(
      text,
    )
  )
    return 'confirmation';
  return 'reply';
}
export function matchMail(subject: string, body: string, apps: Application[]) {
  const text = (subject + ' ' + body).toLowerCase();
  const candidates = apps
    .filter((a) => !a.job.practice)
    .map((a) => {
      const company = a.job.company.toLowerCase(),
        title = a.job.title.toLowerCase();
      return {
        a,
        score: text.includes(a.job.url.toLowerCase())
          ? 100
          : company.length > 2 && text.includes(company) && text.includes(title)
            ? 80
            : company.length > 3 && text.includes(company)
              ? 40
              : 0,
      };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (
    !candidates.length ||
    candidates[0].score < 80 ||
    candidates[1]?.score === candidates[0].score
  )
    return undefined;
  return {
    applicationId: candidates[0].a.id,
    reason: candidates[0].score === 100 ? 'Exact application URL' : 'Company and role title match',
  };
}
export async function syncInbox() {
  if (running) throw new Error('Inbox sync is already running');
  if (!secret('imapHost') || !secret('imapUser') || !secret('imapPassword'))
    throw new Error('Connect a TLS IMAP account in Integrations first');
  const host = secret('imapHost');
  const port = Number(secret('imapPort') || 993);
  if (port !== 993) throw new Error('Use TLS IMAP on port 993');
  running = true;
  const state = inboxState();
  const client = new ImapFlow({
    host,
    port,
    secure: true,
    auth: { user: secret('imapUser'), pass: secret('imapPassword') },
    logger: false,
    connectionTimeout: 15000,
    socketTimeout: 30000,
    disableAutoIdle: true,
  });
  try {
    await publicURL(`https://${host}`);
    await client.connect();
    const lock = await client.getMailboxLock('INBOX', { readOnly: true });
    try {
      const since = new Date(Date.now() - 30 * 86400000);
      const found = await client.search(
        {
          since,
          or: [
            { subject: 'application' },
            { subject: 'interview' },
            { subject: 'recruit' },
            { subject: 'next steps' },
          ],
        },
        { uid: true },
      );
      const ids = Array.isArray(found) ? found.slice(-100) : [];
      let added = 0;
      if (ids.length) {
        const applications = store.applications();
        const messages = await client.fetchAll(
          ids.join(','),
          { envelope: true, source: { start: 0, maxLength: 60000 } },
          { uid: true },
        );
        for (const message of messages) {
          if (!message.source) continue;
          const key = createHash('sha256')
            .update(
              secret('imapUser') +
                ':INBOX:' +
                String((client.mailbox as any)?.uidValidity) +
                ':' +
                message.uid,
            )
            .digest('hex');
          if (state.messages.some((m) => m.id === key)) continue;
          const parsed = await simpleParser(message.source, {
            skipHtmlToText: false,
            skipTextToHtml: true,
          });
          const subject = parsed.subject || '(No subject)',
            body = (parsed.text || '').slice(0, 20000),
            match = matchMail(subject, body, applications);
          const item: InboxItem = {
            id: key,
            applicationId: match?.applicationId,
            subject,
            from: parsed.from?.text || '',
            receivedAt: (parsed.date || new Date()).toISOString(),
            category: classifyMail(subject, body),
            snippet: body.replace(/\s+/g, ' ').slice(0, 700),
            matchReason: match?.reason || 'Needs a manual link',
          };
          state.messages.push(item);
          if (match) {
            const a = store.application(match.applicationId)!;
            store.update(a.id, {
              recruiterStatus:
                item.category === 'interview'
                  ? 'interview'
                  : item.category === 'rejection'
                    ? 'rejected'
                    : item.category === 'confirmation'
                      ? 'applied'
                      : 'replied',
            });
            store.event(`Job-related email linked to ${a.job.company}`, 'info', a.id);
          }
          added++;
        }
      }
      state.messages = state.messages
        .sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt))
        .slice(0, 500);
      state.lastSync = store.now();
      state.error = '';
      saveInbox(state);
      return { added, ...inboxState() };
    } finally {
      lock.release();
    }
  } catch (e) {
    state.error = redact((e as Error).message);
    saveInbox(state);
    throw new Error(state.error);
  } finally {
    await client.logout().catch(() => {});
    running = false;
  }
}
