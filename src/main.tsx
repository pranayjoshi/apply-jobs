import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  SetupWizard,
  JobExplorer,
  IntegrationSettings,
  IntegrationsPage,
  InboxPage,
  FilterFields,
  StructuredHistory,
  ResumePreferences,
} from './upgrade';
import { createRoot } from 'react-dom/client';
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Plus,
  Search,
  LayoutDashboard,
  BriefcaseBusiness,
  Layers,
  UserRound,
  SlidersHorizontal,
  Settings2,
  ChevronRight,
  ChevronDown,
  Check,
  CheckCheck,
  X,
  Pause,
  Play,
  LoaderCircle,
  MapPin,
  ExternalLink,
  MoreHorizontal,
  FileText,
  Upload,
  Download,
  ShieldCheck,
  Monitor,
  Wifi,
  WifiOff,
  Sparkles,
  RefreshCw,
  Clock,
  AlertCircle,
  CheckCircle2,
  Inbox,
  Trash2,
  Terminal,
  PanelLeftClose,
  Menu,
  Command,
  Send,
  ArrowDownToLine,
  Power,
  Link2,
  Building2,
  Globe,
  Leaf,
  Zap,
  Mail,
} from 'lucide-react';
import type { AppState, Profile, Settings, Job, Application, WatchSource, Field } from './types';
import './styles.css';
async function api<T = any>(url: string, body?: unknown, method?: string): Promise<T> {
  const form = body instanceof FormData;
  const r = await fetch('/api' + url, {
    method: method || (body === undefined ? 'GET' : 'POST'),
    headers:
      body === undefined
        ? {}
        : { 'X-Apply-Jobs': 'local', ...(form ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: form ? body : JSON.stringify(body) }),
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({ error: r.statusText }));
    throw new Error(d.error || 'Something went wrong');
  }
  return r.json();
}
const stageLabels: Record<string, string> = {
  queued: 'Queued',
  preparing: 'Preparing',
  filling: 'Filling form',
  needs_user: 'Needs you',
  review: 'Ready to review',
  submitting: 'Submitting',
  submitted: 'Submitted',
  unknown: 'Confirm outcome',
  failed: 'Failed',
  skipped: 'Skipped',
};
const date = (s: string) =>
  new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const ago = (s: string) => {
  const m = Math.max(0, Math.floor((Date.now() - Date.parse(s)) / 60000));
  return m < 1
    ? 'Just now'
    : m < 60
      ? `${m}m ago`
      : m < 1440
        ? `${Math.floor(m / 60)}h ago`
        : date(s);
};
const initial = (s: string) =>
  s
    .split(/[\s.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join('')
    .toUpperCase() || 'AJ';
function Brand() {
  return (
    <div className="brand">
      <span className="brand-symbol">
        <ArrowUpRight size={23} strokeWidth={2.5} />
      </span>
      <span>
        Apply Jobs<span className="brand-dot">.</span>
      </span>
    </div>
  );
}
function Badge({ stage }: { stage: string }) {
  return (
    <span className={`badge ${stage}`}>
      <span />
      {stageLabels[stage] || stage}
    </span>
  );
}
function Button({
  children,
  variant = '',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) {
  return (
    <button className={`button ${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}
function FieldInput({
  label,
  hint,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="form-label">
      {label}
      <input {...props} />
      {hint && <small>{hint}</small>}
    </label>
  );
}
function TextArea({
  label,
  hint,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string }) {
  return (
    <label className="form-label">
      {label}
      <textarea {...props} />
      {hint && <small>{hint}</small>}
    </label>
  );
}
function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="toggle-row">
      <span>
        <strong>{label}</strong>
        {description && <small>{description}</small>}
      </span>
      <input
        className="sr-only"
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={`switch ${checked ? 'on' : ''}`}>
        <i />
      </span>
    </label>
  );
}
function CompanyIcon({ company }: { company: string }) {
  const palette = ['mint', 'lilac', 'peach', 'blue'];
  return (
    <span className={`company-icon ${palette[company.charCodeAt(0) % 4]}`}>{initial(company)}</span>
  );
}
function Empty({
  icon: Icon = Inbox,
  title,
  description,
  children,
}: {
  icon?: any;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon size={25} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [page, setPage] = useState('overview');
  const initialRoute = useRef(false);
  const [selectedJobData, setSelectedJobData] = useState<Job | null>(null);
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const [modal, setModal] = useState('');
  const [detail, setDetail] = useState<{ type: 'job' | 'application'; id: string } | null>(null);
  const [mobile, setMobile] = useState(false);
  const [loadingError, setLoadingError] = useState('');
  const notify = useCallback((text: string, error = false) => {
    setToast({ text, error });
    setTimeout(() => setToast(null), 6000);
  }, []);
  const refresh = useCallback(async () => {
    try {
      setState(await api('/state'));
      setLoadingError('');
    } catch (e) {
      setLoadingError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 3500);
    return () => clearInterval(t);
  }, [refresh]);
  useEffect(() => {
    if (state && !initialRoute.current) {
      initialRoute.current = true;
      if (!state.onboarding?.dismissed && !state.onboarding?.completed) setPage('setup');
    }
  }, [state]);
  const openJob = async (j: Job) => {
    try {
      const full = await api<Job>(`/jobs/${j.id}`);
      setSelectedJobData(full);
      setDetail({ type: 'job', id: j.id });
    } catch (e) {
      notify((e as Error).message, true);
    }
  };
  const action = useCallback(
    async (fn: () => Promise<unknown>, message?: string) => {
      try {
        const result = await fn();
        await refresh();
        if (message) notify(message);
        return result;
      } catch (e) {
        notify((e as Error).message, true);
        throw e;
      }
    },
    [refresh, notify],
  );
  const go = (p: string) => {
    setPage(p);
    setMobile(false);
    setDetail(null);
  };
  const addPractice = async () => {
    const j = (await action(() => api<Job>('/practice', {}))) as Job;
    await openJob(j);
  };
  const apply = async (j: Job) => {
    const a = (await action(
      () => api<Application>(`/jobs/${j.id}/apply`, {}),
      'Added to your application queue',
    )) as Application;
    setDetail({ type: 'application', id: a.id });
  };
  if (!state)
    return (
      <div className="boot">
        <Brand />
        <LoaderCircle className="spin" />
        {loadingError ? (
          <>
            <p>Couldn’t connect to the local service.</p>
            <code>npm run dev</code>
            <Button onClick={() => void refresh()}>Try again</Button>
          </>
        ) : (
          <p>Making room for your next chapter…</p>
        )}
      </div>
    );
  const s = state;
  const real = s.applications.filter((a) => !a.job.practice);
  const submitted = real.filter((a) => a.stage === 'submitted');
  const needs = s.applications.filter((a) => ['review', 'needs_user', 'unknown'].includes(a.stage));
  const nav = [
    { id: 'setup', label: 'Get started', icon: Sparkles },
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'jobs', label: 'Discover jobs', icon: Search },
    { id: 'applications', label: 'Applications', icon: Layers, count: needs.length || undefined },
    { id: 'profile', label: 'My profile', icon: UserRound },
    { id: 'inbox', label: 'Inbox', icon: Mail },
    { id: 'integrations', label: 'Integrations', icon: Link2 },
  ];
  const selectedApp =
    detail?.type === 'application' ? s.applications.find((a) => a.id === detail.id) : undefined;
  const selectedJob =
    detail?.type === 'job'
      ? selectedJobData?.id === detail.id
        ? selectedJobData
        : s.jobs.find((j) => j.id === detail.id)
      : undefined;
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? 'mobile-open' : ''}`}>
        <Brand />
        <div className="workspace-label">
          YOUR WORKSPACE <span>PERSONAL</span>
        </div>
        <nav>
          {nav.map((n) => (
            <button key={n.id} className={page === n.id ? 'active' : ''} onClick={() => go(n.id)}>
              <n.icon size={18} />
              {n.label}
              {n.count && <b>{n.count}</b>}
            </button>
          ))}
        </nav>
        <div className="sidebar-divider" />
        <nav>
          <button className={page === 'autopilot' ? 'active' : ''} onClick={() => go('autopilot')}>
            <Zap size={18} />
            Autopilot
            <span className={`tiny-dot ${s.settings.autopilot ? 'green' : ''}`} />
          </button>
          <button className={page === 'settings' ? 'active' : ''} onClick={() => go('settings')}>
            <Settings2 size={18} />
            Settings
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="local-card">
            <span className="local-icon">
              <ShieldCheck size={20} />
            </span>
            <strong>Yours. All the way.</strong>
            <p>
              Local models. Private data.
              <br />
              No application limits.
            </p>
            <span>
              <i />
              Running on your computer
            </span>
          </div>
          <button className="account" onClick={() => go('profile')}>
            <span className="avatar">
              {s.profile.name ? initial(s.profile.name) : <UserRound size={18} />}
            </span>
            <span>
              <strong>{s.profile.name || 'Your workspace'}</strong>
              <small>Personal account</small>
            </span>
            <ChevronDown size={15} />
          </button>
        </div>
      </aside>
      {mobile && <div className="sidebar-scrim" onClick={() => setMobile(false)} />}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              onClick={() => setMobile(!mobile)}
              aria-label="Toggle navigation"
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>
              {page === 'jobs'
                ? 'Discover jobs'
                : page === 'profile'
                  ? 'My profile'
                  : page.charAt(0).toUpperCase() + page.slice(1)}
            </strong>
          </div>
          <div className="topbar-right">
            <span className={`connection ${s.modelStatus.connected ? 'connected' : ''}`}>
              <i />
              {s.modelStatus.connected
                ? /localhost|127\.0\.0\.1/.test(s.settings.baseUrl)
                  ? 'Local model connected'
                  : 'Model API connected'
                : 'Connect a model'}
            </span>
            <button
              className="icon-button"
              aria-label="Model settings"
              onClick={() => go('settings')}
            >
              <SlidersHorizontal size={18} />
            </button>
            <span className="top-avatar">{s.profile.name ? initial(s.profile.name) : 'AJ'}</span>
          </div>
        </header>
        {loadingError && (
          <div className="connection-banner">
            <AlertCircle size={16} />
            Connection lost. Your saved data is safe. Reconnecting…
          </div>
        )}
        <main key={page}>
          {page === 'overview' && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    <span />A LITTLE MOMENTUM, EVERY DAY
                  </div>
                  <h1>
                    {s.profile.name
                      ? `Let’s find your next chapter, ${s.profile.name.split(' ')[0]}.`
                      : 'Your next chapter starts here.'}
                  </h1>
                  <p>A thoughtful job search. A lot less busywork.</p>
                </div>
                <Button variant="primary" onClick={() => setModal('job')}>
                  <Plus size={17} />
                  Add a job
                </Button>
              </div>
              <div className="hero">
                <div className="hero-copy">
                  <span className="hero-label">
                    <Sparkles size={14} /> YOUR SEARCH, ON YOUR TERMS
                  </span>
                  <h2>
                    More possibilities.
                    <br />
                    Less application fatigue.
                  </h2>
                  <p>
                    Find the right roles, make every application yours,
                    <br className="desktop-break" /> and let your local assistant handle the
                    repetitive parts.
                  </p>
                  <Button
                    variant="dark"
                    onClick={() => go(s.profile.confirmed ? 'jobs' : 'profile')}
                  >
                    {s.profile.confirmed ? 'Explore opportunities' : 'Set up your profile'}
                    <ArrowRight size={16} />
                  </Button>
                  <span className="hero-footnote">
                    <ShieldCheck size={13} />
                    Private by default. Powered by you.
                  </span>
                </div>
                <div className="hero-art" aria-hidden="true">
                  <span className="orbit orbit-one" />
                  <span className="orbit orbit-two" />
                  <div className="float-pill">
                    <span className="sparkle-icon">
                      <Sparkles size={16} />
                    </span>
                    A little help. A big next step.
                  </div>
                  <div className="art-card">
                    <span className="art-company">
                      <span>
                        <BriefcaseBusiness size={21} />
                      </span>
                      <i />
                      <i />
                    </span>
                    <b>Your next opportunity</b>
                    <p>The right role. The right fit.</p>
                    <div className="art-lines">
                      <i />
                      <i />
                    </div>
                    <div className="art-bottom">
                      <span>
                        <span />
                        Made for you
                      </span>
                      <ArrowUpRight size={20} />
                    </div>
                  </div>
                  <div className="art-check">
                    <Check size={17} />
                    <span>One step closer</span>
                    <Leaf size={14} />
                  </div>
                  <span className="star star-one">✦</span>
                  <span className="star star-two">✧</span>
                </div>
              </div>
              <div className="stats-grid">
                {[
                  {
                    label: 'Opportunities saved',
                    value: s.jobTotal ?? s.jobs.filter((j) => !j.practice).length,
                    icon: BriefcaseBusiness,
                    note: 'Your next possibilities',
                    color: 'mint',
                  },
                  {
                    label: 'Applications sent',
                    value: submitted.length,
                    icon: Send,
                    note: 'Every step counts',
                    color: 'lilac',
                  },
                  {
                    label: 'In your queue',
                    value: real.filter((a) => ['queued', 'preparing', 'filling'].includes(a.stage))
                      .length,
                    icon: Layers,
                    note: 'A little work off your plate',
                    color: 'peach',
                  },
                  {
                    label: 'Needs your attention',
                    value: needs.length,
                    icon: UserRound,
                    note: needs.length ? 'Ready for your personal touch' : 'You’re all caught up',
                    color: 'blue',
                  },
                ].map((x) => (
                  <div className="stat-card" key={x.label}>
                    <div>
                      <span>{x.label}</span>
                      <span className={`stat-icon ${x.color}`}>
                        <x.icon size={17} />
                      </span>
                    </div>
                    <strong>{x.value.toString().padStart(2, '0')}</strong>
                    <small>{x.note}</small>
                  </div>
                ))}
              </div>
              <div className="overview-columns">
                <section className="panel opportunities">
                  <div className="section-heading">
                    <div>
                      <h2>
                        Your next possibilities{' '}
                        <span className="count-chip">
                          {s.jobTotal ?? s.jobs.filter((j) => !j.practice).length}
                        </span>
                      </h2>
                      <p>Good opportunities deserve a little attention.</p>
                    </div>
                    <button className="text-button" onClick={() => go('jobs')}>
                      View all <ArrowRight size={14} />
                    </button>
                  </div>
                  {(s.jobTotal ?? s.jobs.filter((j) => !j.practice).length) ? (
                    <div>
                      {s.jobs
                        .filter((j) => !j.practice)
                        .sort((a, b) => b.score - a.score)
                        .slice(0, 4)
                        .map((j) => (
                          <JobRow key={j.id} job={j} onClick={() => void openJob(j)} />
                        ))}
                    </div>
                  ) : (
                    <Empty
                      icon={Search}
                      title="Let’s build your shortlist"
                      description="Add a role you love, or follow company career pages. Your next opportunity starts with one."
                    >
                      <Button variant="secondary" onClick={() => setModal('job')}>
                        <Plus size={15} />
                        Add your first job
                      </Button>
                    </Empty>
                  )}
                </section>
                <section className="panel setup-panel">
                  <div className="section-heading">
                    <div>
                      <h2>Make yourself at home</h2>
                      <p>Three small steps. A smoother search.</p>
                    </div>
                    <span className="progress-fraction">
                      {
                        [s.profile.confirmed, s.modelStatus.connected, s.jobs.length > 0].filter(
                          Boolean,
                        ).length
                      }
                      /3
                    </span>
                  </div>
                  <div className="progress-track">
                    <span
                      style={{
                        width: `${([s.profile.confirmed, s.modelStatus.connected, s.jobs.length > 0].filter(Boolean).length / 3) * 100}%`,
                      }}
                    />
                  </div>
                  {[
                    {
                      done: s.profile.confirmed,
                      title: 'Bring your experience',
                      text: 'Add and confirm your profile',
                      icon: UserRound,
                      target: 'profile',
                    },
                    {
                      done: s.modelStatus.connected,
                      title: 'Meet your local assistant',
                      text: 'Connect Ollama or another local model',
                      icon: Monitor,
                      target: 'settings',
                    },
                    {
                      done: s.jobs.length > 0,
                      title: 'Find your first possibility',
                      text: 'Save a job or try a practice application',
                      icon: BriefcaseBusiness,
                      target: 'jobs',
                    },
                  ].map((x, i) => (
                    <button className="setup-step" key={x.title} onClick={() => go(x.target)}>
                      <span className={x.done ? 'step-number done' : 'step-number'}>
                        {x.done ? <Check size={14} /> : i + 1}
                      </span>
                      <span>
                        <strong>{x.title}</strong>
                        <small>{x.text}</small>
                      </span>
                      <ChevronRight size={15} />
                    </button>
                  ))}
                  <div className="practice-callout">
                    <span>
                      <Leaf size={18} />
                    </span>
                    <div>
                      <strong>Take a no-pressure test drive</strong>
                      <p>Try a full application, right here on your computer.</p>
                      <button onClick={() => void addPractice().catch(() => {})}>
                        Try the practice application <ArrowUpRight size={13} />
                      </button>
                    </div>
                  </div>
                </section>
              </div>
              <section className="panel activity-panel">
                <div className="section-heading">
                  <div>
                    <h2>A little progress, all in one place</h2>
                  </div>
                  <span className="muted">Recent activity</span>
                </div>
                {s.activity.length ? (
                  <div className="activity-list">
                    {s.activity.slice(0, 4).map((e) => (
                      <div className="activity-row" key={e.id}>
                        <span className={`activity-icon ${e.kind}`}>
                          <Check size={14} />
                        </span>
                        <span>{e.message}</span>
                        <time>{ago(e.createdAt)}</time>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="activity-empty">
                    <span className="activity-icon">
                      <Clock size={14} />
                    </span>
                    <span>A fresh start. Your job search activity will appear here.</span>
                    <span>Today</span>
                  </div>
                )}
              </section>
            </>
          )}
          {page === 'jobs' && (
            <JobExplorer
              state={s}
              action={action}
              onAdd={() => setModal('job')}
              onDetail={(j) => void openJob(j)}
              onPractice={() => void addPractice().catch(() => {})}
            />
          )}
          {page === 'applications' && (
            <ApplicationsPage
              state={s}
              onDetail={(a) => setDetail({ type: 'application', id: a.id })}
              onAdd={() => setModal('job')}
            />
          )}
          {page === 'profile' && (
            <ProfilePage profile={s.profile} action={action} notify={notify} />
          )}
          {page === 'setup' && <SetupWizard state={s} action={action} go={go} />}
          {page === 'integrations' && <IntegrationsPage state={s} action={action} />}
          {page === 'inbox' && <InboxPage state={s} action={action} />}
          {page === 'settings' && <IntegrationSettings state={s} action={action} />}
          {page === 'autopilot' && <AutopilotPage state={s} action={action} go={go} />}
          <footer>
            <span>
              <Leaf size={13} /> A calmer way to find what’s next.
            </span>
            <span>
              Apply Jobs <i />
              Local-first & open source
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className={`toast ${toast.error ? 'error' : ''}`} role="status">
          {toast.error ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          <span>{toast.text}</span>
          <button onClick={() => setToast(null)} aria-label="Dismiss notification">
            <X size={15} />
          </button>
        </div>
      )}
      {modal === 'job' && (
        <AddJobModal
          onClose={() => setModal('')}
          action={action}
          onAdded={(j) => {
            setModal('');
            void openJob(j);
          }}
        />
      )}
      {selectedJob && (
        <Drawer title="Opportunity details" onClose={() => setDetail(null)}>
          <div className="detail-company">
            <CompanyIcon company={selectedJob.company} />
            <div>
              <span>{selectedJob.company}</span>
              <h2>{selectedJob.title}</h2>
            </div>
          </div>
          <div className="detail-tags">
            <span>
              <MapPin size={14} />
              {selectedJob.location || 'Location not specified'}
            </span>
            <span>{selectedJob.ats}</span>
            {selectedJob.practice && <span className="practice-tag">Local practice</span>}
          </div>
          <div className="match-box">
            <span className="match-score">
              {selectedJob.score}
              <small>/100</small>
            </span>
            <div>
              <strong>Fit with your preferences</strong>
              {selectedJob.reasons.map((r) => (
                <p key={r}>
                  <Check size={12} />
                  {r}
                </p>
              ))}
            </div>
          </div>
          <p className="help-text">
            A preference score, not a hiring prediction. Review the full role for requirements and
            eligibility.
          </p>
          <div className="detail-actions">
            <Button
              variant="primary"
              disabled={selectedJob.status === 'closed'}
              onClick={() => void apply(selectedJob).catch(() => {})}
            >
              <Plus size={16} />
              Add to application queue
            </Button>
            <a className="button secondary" href={selectedJob.url} target="_blank" rel="noreferrer">
              View posting
              <ExternalLink size={14} />
            </a>
          </div>
          <div className="listing-facts">
            <span>Status: {selectedJob.status}</span>
            <span>
              {selectedJob.publishedAt
                ? 'Published ' + new Date(selectedJob.publishedAt).toLocaleDateString()
                : 'Published date not supplied'}
            </span>
            <span>
              Last seen:{' '}
              {selectedJob.lastSeenAt
                ? new Date(selectedJob.lastSeenAt).toLocaleString()
                : 'Unknown'}
            </span>
            <button
              className="text-button"
              onClick={() =>
                void action(() => api<Job>(`/jobs/${selectedJob.id}/check`, {}))
                  .then((value) => setSelectedJobData(value as Job))
                  .catch(() => {})
              }
            >
              Check posting status <RefreshCw size={12} />
            </button>
          </div>
          {selectedJob.attribution && (
            <a
              className={
                'source-credit ' +
                (selectedJob.attribution.name === 'Adzuna' ? 'adzuna-credit' : '')
              }
              href={selectedJob.attribution.url}
              target="_blank"
              rel="noreferrer"
            >
              Jobs via {selectedJob.attribution.name}
              <ExternalLink size={12} />
            </a>
          )}
          <h3>About the role</h3>
          <div className="job-description">{selectedJob.description}</div>
        </Drawer>
      )}
      {selectedApp && (
        <ApplicationDrawer
          key={selectedApp.id}
          application={selectedApp}
          action={action}
          onClose={() => setDetail(null)}
          paused={s.settings.paused}
          profile={s.profile}
          onReviewProfile={() => go('profile')}
        />
      )}
    </div>
  );
}
type Action = (fn: () => Promise<any>, message?: string) => Promise<any>;
function JobRow({ job: j, onClick }: { job: Job; onClick: () => void }) {
  return (
    <button className="job-row" onClick={onClick}>
      <CompanyIcon company={j.company} />
      <div className="job-row-main">
        <strong>{j.title}</strong>
        <span>
          {j.company}
          <i /> {j.location || 'Location not specified'}
        </span>
      </div>
      <span className="fit-pill">{j.score}% fit</span>
      <ChevronRight size={15} />
    </button>
  );
}
function ApplicationsPage({
  state: s,
  onDetail,
  onAdd,
}: {
  state: AppState;
  onDetail: (a: Application) => void;
  onAdd: () => void;
}) {
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const list = s.applications.filter(
    (a) =>
      (tab === 'all' ||
        (tab === 'needs' && ['review', 'needs_user', 'unknown'].includes(a.stage)) ||
        (tab === 'sent' && a.stage === 'submitted') ||
        (tab === 'active' && ['queued', 'preparing', 'filling', 'submitting'].includes(a.stage))) &&
      `${a.job.title} ${a.job.company}`.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">EVERY STEP, IN ONE PLACE</div>
          <h1>A little progress adds up.</h1>
          <p>Your queue, your applications, and the details that matter.</p>
        </div>
        <Button variant="primary" onClick={onAdd}>
          <Plus size={17} />
          Add a job
        </Button>
      </div>
      <div className="tab-toolbar">
        <div className="tabs">
          {[
            ['all', 'All applications'],
            ['needs', 'Needs you'],
            ['active', 'In progress'],
            ['sent', 'Submitted'],
          ].map(([v, l]) => (
            <button key={v} className={tab === v ? 'active' : ''} onClick={() => setTab(v)}>
              {l}
            </button>
          ))}
        </div>
        <div className="search-input">
          <Search size={16} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find an application…"
            aria-label="Search applications"
          />
        </div>
      </div>
      <div className="panel table-panel">
        {list.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>OPPORTUNITY</th>
                  <th>STATUS</th>
                  <th>ADDED</th>
                  <th>DOCUMENTS</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((a) => (
                  <tr
                    key={a.id}
                    onClick={() => onDetail(a)}
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && onDetail(a)}
                  >
                    <td>
                      <div className="table-job">
                        <CompanyIcon company={a.job.company} />
                        <span>
                          <strong>
                            {a.job.title}
                            {a.job.practice && <small className="practice-tag">Practice</small>}
                          </strong>
                          <small>{a.job.company}</small>
                        </span>
                      </div>
                    </td>
                    <td>
                      <Badge stage={a.stage} />
                    </td>
                    <td className="muted">{date(a.createdAt)}</td>
                    <td>
                      <span className="document-pill">
                        <FileText size={13} />
                        {a.packet ? 'Résumé ready' : 'Not prepared'}
                      </span>
                    </td>
                    <td>
                      <ChevronRight size={16} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            icon={Layers}
            title={
              tab === 'all' ? 'Good things start with one application' : 'Nothing here right now'
            }
            description={
              tab === 'all'
                ? 'Add a role to your queue. We’ll keep the paperwork, progress, and receipts together.'
                : 'Applications in this stage will appear here.'
            }
          >
            <Button variant="secondary" onClick={onAdd}>
              <Plus size={15} />
              Find your next role
            </Button>
          </Empty>
        )}
      </div>
    </>
  );
}
function ProfilePage({
  profile,
  action,
  notify,
}: {
  profile: Profile;
  action: Action;
  notify: (s: string, e?: boolean) => void;
}) {
  const [p, setP] = useState(profile);
  const [busy, setBusy] = useState('');
  const [tab, setTab] = useState('background');
  const set = (k: keyof Profile, v: any) => setP({ ...p, [k]: v, confirmed: false });
  const save = async () => {
    setBusy('save');
    try {
      const r = await action(() => api('/profile', p, 'PUT'), 'Your profile is saved');
      setP(r);
    } catch {
    } finally {
      setBusy('');
    }
  };
  const importFile = async (file: File) => {
    setBusy('import');
    try {
      const fd = new FormData();
      fd.set('resume', file);
      const r = await action(
        () => api('/profile/import', fd),
        'Résumé imported. Review your facts before confirming.',
      );
      setP(r.profile);
      setTab('resume');
    } catch {
    } finally {
      setBusy('');
    }
  };
  const generateSummary = async () => {
    setBusy('summary');
    try {
      const result = await action(() => api<{ summary: string }>('/profile/summary', p));
      setP({ ...p, summary: result.summary, confirmed: false });
      notify('AI summary drafted. Review it and save your profile.');
    } catch {
    } finally {
      setBusy('');
    }
  };
  const extract = async () => {
    setBusy('extract');
    try {
      await api('/profile', { ...p, confirmed: false }, 'PUT');
      const r = await action(() => api('/profile/extract', {}));
      setP(r);
      setTab('background');
      notify(
        r.summaryDraftError
          ? 'Facts extracted. Summary drafting needs another try: ' + r.summaryDraftError
          : 'Facts extracted. Review your summary and background before confirming.',
        !!r.summaryDraftError,
      );
    } catch {
    } finally {
      setBusy('');
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">THE STORY ONLY YOU CAN TELL</div>
          <h1>Bring your experience.</h1>
          <p>Your confirmed facts are the foundation of every application.</p>
        </div>
        <Button variant="primary" disabled={!!busy} onClick={() => void save()}>
          {busy === 'save' ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}Save
          profile
        </Button>
      </div>
      <div className="profile-layout">
        <div>
          <div className="tabs profile-tabs">
            {[
              ['background', 'Your background'],
              ['resume', 'Résumé import'],
              ['answers', 'Saved answers'],
            ].map(([v, l]) => (
              <button key={v} className={tab === v ? 'active' : ''} onClick={() => setTab(v)}>
                {l}
              </button>
            ))}
          </div>
          {tab === 'background' && (
            <>
              <section className="panel form-panel">
                <div className="form-section-heading">
                  <span className="section-icon mint">
                    <UserRound size={18} />
                  </span>
                  <div>
                    <h2>The essentials</h2>
                    <p>How employers can get to know you.</p>
                  </div>
                </div>
                <div className="form-grid">
                  <FieldInput
                    label="Full name"
                    value={p.name}
                    onChange={(e) => set('name', e.target.value)}
                    placeholder="Your full name"
                  />
                  <FieldInput
                    label="Email address"
                    type="email"
                    value={p.email}
                    onChange={(e) => set('email', e.target.value)}
                    placeholder="you@example.com"
                  />
                  <FieldInput
                    label="Phone number"
                    value={p.phone}
                    onChange={(e) => set('phone', e.target.value)}
                    placeholder="Including country code"
                  />
                  <FieldInput
                    label="Location"
                    value={p.location}
                    onChange={(e) => set('location', e.target.value)}
                    placeholder="City, state / country"
                  />
                  <FieldInput
                    label="LinkedIn URL"
                    value={p.linkedin}
                    onChange={(e) => set('linkedin', e.target.value)}
                    placeholder="https://linkedin.com/in/you"
                  />
                  <FieldInput
                    label="Website or portfolio"
                    value={p.website}
                    onChange={(e) => set('website', e.target.value)}
                    placeholder="https://your-portfolio.com"
                  />
                </div>
                <FieldInput
                  label="Professional headline"
                  value={p.headline}
                  onChange={(e) => set('headline', e.target.value)}
                  placeholder="e.g. Product engineer · React & TypeScript"
                />
              </section>
              <section className="panel form-panel">
                <div className="form-section-heading">
                  <span className="section-icon lilac">
                    <BriefcaseBusiness size={18} />
                  </span>
                  <div>
                    <h2>Your experience, in your words</h2>
                    <p>Use exact dates, titles, achievements, and numbers you can stand behind.</p>
                  </div>
                </div>
                <TextArea
                  label="Professional summary"
                  value={p.summary}
                  onChange={(e) => set('summary', e.target.value)}
                  rows={3}
                  placeholder="What do you bring to your next team?"
                />
                <div className="inline-controls">
                  <Button disabled={!!busy} onClick={() => void generateSummary()}>
                    {busy === 'summary' ? (
                      <LoaderCircle className="spin" size={16} />
                    ) : (
                      <Sparkles size={16} />
                    )}
                    {busy === 'summary'
                      ? 'Drafting summary…'
                      : p.summary.trim()
                        ? 'Regenerate summary with AI'
                        : 'Generate summary with AI'}
                  </Button>
                  <span className="help-text">
                    Drafted from your résumé and background for your review.
                  </span>
                </div>
                <TextArea
                  label="Work experience"
                  hint="Include employer, title, dates, and achievements. Use a new line for each fact."
                  value={p.experience}
                  onChange={(e) => set('experience', e.target.value)}
                  rows={8}
                  placeholder="Company · Title · Dates&#10;Your contributions and achievements…"
                />
                <TextArea
                  label="Education"
                  value={p.education}
                  onChange={(e) => set('education', e.target.value)}
                  rows={3}
                  placeholder="Degree, institution, graduation date"
                />
                <TextArea
                  label="Projects"
                  hint="Include names, technologies, links and your actual contributions."
                  value={p.projects || ''}
                  onChange={(e) => set('projects', e.target.value)}
                  rows={6}
                  placeholder="Project · Technologies · Link&#10;What you built and contributed…"
                />
                <TextArea
                  label="Skills"
                  hint="Separate skills with commas. These also help personalize your job matches."
                  value={p.skills}
                  onChange={(e) => set('skills', e.target.value)}
                  rows={3}
                  placeholder="React, TypeScript, product design…"
                />
              </section>
              <ResumePreferences profile={p} onChange={setP} />
              <StructuredHistory profile={p} onChange={setP} />
              <section className="panel form-panel">
                <h2>Application details</h2>
                <p className="muted">
                  These answers are used only when the question matches. Use saved answers for
                  jurisdiction-specific questions.
                </p>
                <div className="form-grid">
                  <label className="form-label">
                    Authorized to work in your target country
                    <select
                      value={p.workAuthorization}
                      onChange={(e) => set('workAuthorization', e.target.value)}
                    >
                      <option value="">Ask me when needed</option>
                      <option>Yes</option>
                      <option>No</option>
                    </select>
                  </label>
                  <label className="form-label">
                    Will you require employer sponsorship?
                    <select
                      value={p.sponsorship}
                      onChange={(e) => set('sponsorship', e.target.value)}
                    >
                      <option value="">Ask me when needed</option>
                      <option>Yes</option>
                      <option>No</option>
                    </select>
                  </label>
                </div>
                <div className="confirmation-box">
                  <label>
                    <input
                      type="checkbox"
                      checked={p.confirmed}
                      onChange={(e) => setP({ ...p, confirmed: e.target.checked })}
                    />
                    <span>
                      <strong>I’ve reviewed these facts and they’re accurate.</strong>
                      <small>
                        Confirming makes this profile available to the application assistant.
                        Editing a fact requires confirmation again.
                      </small>
                    </span>
                  </label>
                </div>
              </section>
            </>
          )}
          {tab === 'resume' && (
            <section className="panel form-panel">
              <h2>Start with the résumé you already have</h2>
              <p className="muted">
                Import a text-based PDF or a .txt file. Your original is kept locally.
              </p>
              <label className="upload-zone">
                <Upload size={27} />
                <strong>
                  {busy === 'import' ? 'Reading your résumé…' : 'Choose a résumé to import'}
                </strong>
                <span>PDF, DOCX, TXT or image · Up to 12 MB</span>
                <input
                  type="file"
                  accept=".pdf,.docx,.txt,.png,.jpg,.jpeg"
                  disabled={!!busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void importFile(f);
                  }}
                />
              </label>
              <TextArea
                label="Or paste your résumé text"
                value={p.resumeText}
                rows={15}
                onChange={(e) => set('resumeText', e.target.value)}
                placeholder="Paste your résumé here…"
              />
              <Button
                variant="primary"
                disabled={!!busy || !p.resumeText.trim()}
                onClick={() => void extract()}
              >
                {busy === 'extract' ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <Sparkles size={16} />
                )}
                Extract facts with local model
              </Button>
              <p className="help-text">
                Requires a connected model. You can also enter your background manually without one.
              </p>
            </section>
          )}
          {tab === 'answers' && (
            <section className="panel form-panel">
              <h2>A little less repeating yourself</h2>
              <p className="muted">
                Saved answers are matched to exact question wording. Review sensitive or
                country-specific questions carefully.
              </p>
              {p.answers.length ? (
                p.answers.map((a, i) => (
                  <div className="saved-answer" key={i}>
                    <FieldInput
                      label="Question"
                      value={a.question}
                      onChange={(e) =>
                        set(
                          'answers',
                          p.answers.map((x, n) =>
                            n === i ? { ...x, question: e.target.value } : x,
                          ),
                        )
                      }
                    />
                    <TextArea
                      label="Your answer"
                      value={a.answer}
                      rows={2}
                      onChange={(e) =>
                        set(
                          'answers',
                          p.answers.map((x, n) => (n === i ? { ...x, answer: e.target.value } : x)),
                        )
                      }
                    />
                    <button
                      className="text-button danger"
                      onClick={() =>
                        set(
                          'answers',
                          p.answers.filter((_, n) => n !== i),
                        )
                      }
                    >
                      <Trash2 size={14} />
                      Remove answer
                    </button>
                  </div>
                ))
              ) : (
                <p className="help-text">
                  No saved answers yet. Add one here or save answers while reviewing a form.
                </p>
              )}
              <Button
                variant="secondary"
                onClick={() => set('answers', [...p.answers, { question: '', answer: '' }])}
              >
                <Plus size={15} />
                Add a saved answer
              </Button>
            </section>
          )}
        </div>
        <aside>
          <div className="panel profile-summary">
            <span className="large-avatar">
              {p.name ? initial(p.name) : <UserRound size={27} />}
            </span>
            <h3>{p.name || 'Your name goes here'}</h3>
            <p>{p.headline || 'A fresh page for your experience.'}</p>
            <div className={`profile-status ${p.confirmed ? 'confirmed' : ''}`}>
              <ShieldCheck size={15} />
              {p.confirmed ? 'Profile confirmed' : 'Awaiting your confirmation'}
            </div>
            <hr />
            <strong>A profile you can trust</strong>
            <p>
              Your assistant uses confirmed facts. It won’t invent qualifications to fill a blank.
            </p>
            <span className="privacy-note">
              <Monitor size={14} />
              Stored on this computer
            </span>
          </div>
        </aside>
      </div>
    </>
  );
}
function AutopilotPage({
  state: s,
  action,
  go,
}: {
  state: AppState;
  action: Action;
  go: (p: string) => void;
}) {
  const [c, setC] = useState(s.settings);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await action(() => api('/settings', c, 'PUT'), 'Autopilot preferences saved');
    } catch {
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">A LITTLE MORE HANDS-OFF</div>
          <h1>Let your search keep moving.</h1>
          <p>You set the direction. Your assistant takes care of the routine.</p>
        </div>
        <Button
          variant={s.settings.paused ? 'primary' : 'secondary'}
          onClick={() =>
            void action(
              () => api('/pause', { paused: !s.settings.paused }),
              s.settings.paused ? 'Automation resumed' : 'All automation paused',
            ).catch(() => {})
          }
        >
          {s.settings.paused ? <Play size={16} /> : <Pause size={16} />}{' '}
          {s.settings.paused ? 'Resume automation' : 'Pause everything'}
        </Button>
      </div>
      <div className="autopilot-banner">
        <span className="autopilot-icon">
          <Zap size={29} />
        </span>
        <div>
          <h2>
            {s.settings.paused
              ? 'Taking a breather.'
              : s.settings.autopilot
                ? 'Your search is on Autopilot.'
                : 'Your search, at your pace.'}
          </h2>
          <p>
            {s.settings.paused
              ? 'Queued work will wait until you’re ready.'
              : s.settings.autopilot
                ? 'Matching roles can be queued and submitted within your saved preferences.'
                : 'Review each application yourself, or enable Autopilot for matching roles.'}
          </p>
        </div>
        <span
          className={`status-pill ${s.settings.autopilot && !s.settings.paused ? 'online' : ''}`}
        >
          {s.settings.paused ? 'Paused' : s.settings.autopilot ? 'Active' : 'Review mode'}
        </span>
      </div>
      <div className="settings-layout">
        <section className="panel form-panel">
          <h2>Point us in the right direction</h2>
          <p className="muted">These preferences also personalize your match scores.</p>
          <TextArea
            label="Target roles"
            hint="Separate titles with commas. Matching uses title keywords."
            value={c.roles}
            onChange={(e) => setC({ ...c, roles: e.target.value })}
            rows={2}
            placeholder="Frontend engineer, Product engineer…"
          />
          <TextArea
            label="Preferred locations"
            hint="Separate locations with commas. Include Remote if it’s a preference."
            value={c.locations}
            onChange={(e) => setC({ ...c, locations: e.target.value })}
            rows={2}
            placeholder="Chicago, Remote…"
          />
          <TextArea
            label="Companies to exclude"
            value={c.excludedCompanies}
            onChange={(e) => setC({ ...c, excludedCompanies: e.target.value })}
            rows={2}
            placeholder="Companies you don’t want to apply to"
          />
          <FieldInput
            label="Minimum preference score"
            type="number"
            min={0}
            max={100}
            value={c.minScore}
            onChange={(e) => setC({ ...c, minScore: Number(e.target.value) })}
          />
          <details className="advanced-filters">
            <summary>More search filters</summary>
            <FilterFields value={c} onChange={setC} />
          </details>
          <Toggle
            checked={c.autopilot}
            onChange={(v) => setC({ ...c, autopilot: v })}
            label="Enable unattended applications"
            description="Automatically queue matching Greenhouse, Lever, and Ashby jobs and submit when all required fields are resolved from confirmed facts or saved answers."
          />
          {!s.profile.confirmed && (
            <div className="notice">
              <AlertCircle size={17} />
              <span>
                Confirm your profile before enabling Autopilot.{' '}
                <button className="text-button" onClick={() => go('profile')}>
                  Go to profile <ArrowRight size={12} />
                </button>
              </span>
            </div>
          )}
          <Button variant="primary" disabled={busy} onClick={() => void save()}>
            {busy ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />}Save
            preferences
          </Button>
        </section>
        <aside className="panel guide-card">
          <span className="section-icon mint">
            <ShieldCheck size={21} />
          </span>
          <h3>
            Independent.
            <br />
            With you in control.
          </h3>
          <p>There are no application credits or monthly quotas.</p>
          <ul className="plain-checks">
            <li>
              <Check size={15} />
              Your computer must be running.
            </li>
            <li>
              <Check size={15} />
              Logins and challenges pause for you.
            </li>
            <li>
              <Check size={15} />
              Unknown answers need your input.
            </li>
            <li>
              <Check size={15} />
              Uncertain submissions aren’t retried.
            </li>
            <li>
              <Check size={15} />
              Pause everything whenever you like.
            </li>
          </ul>
          <p className="help-text">
            Employer systems vary. Start with practice and review mode before running unattended.
          </p>
        </aside>
      </div>
    </>
  );
}
function Modal({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <button className="icon-button close-modal" aria-label="Close dialog" onClick={onClose}>
          <X size={20} />
        </button>
        <span className="modal-icon">
          <Plus size={23} />
        </span>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
        {children}
      </section>
    </div>
  );
}
function AddJobModal({
  onClose,
  action,
  onAdded,
}: {
  onClose: () => void;
  action: Action;
  onAdded: (j: Job) => void;
}) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title="A new possibility."
      description="Paste the job posting link. We’ll bring the details into your workspace."
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const j = await action(() => api('/jobs/import', { url }), 'Opportunity saved');
            onAdded(j);
          } catch {
          } finally {
            setBusy(false);
          }
        }}
      >
        <FieldInput
          label="Job posting URL"
          autoFocus
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://company.com/careers/your-next-role"
        />
        <div className="notice subtle">
          <Link2 size={16} />
          <span>Works best with Greenhouse, Lever, Ashby, and public company career pages.</span>
        </div>
        <Button variant="primary full" disabled={busy}>
          {busy ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />}{' '}
          {busy ? 'Reading the opportunity…' : 'Add to my opportunities'}
        </Button>
      </form>
    </Modal>
  );
}
function Drawer({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);
  return (
    <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="drawer" role="dialog" aria-modal="true" aria-label={title}>
        <div className="drawer-heading">
          <span>{title}</span>
          <button className="icon-button" aria-label="Close details" onClick={onClose}>
            <X size={19} />
          </button>
        </div>
        <div className="drawer-content">{children}</div>
      </section>
    </div>
  );
}
function ApplicationDrawer({
  application: a,
  action,
  onClose,
  paused,
  profile,
  onReviewProfile,
}: {
  profile: Profile;
  onReviewProfile: () => void;
  application: Application;
  action: Action;
  onClose: () => void;
  paused: boolean;
}) {
  const [busy, setBusy] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [save, setSave] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState('');
  const [tab, setTab] = useState('form');
  const [editing, setEditing] = useState(false);
  const [documentDiff, setDocumentDiff] = useState<any>(null);
  const [resume, setResume] = useState('');
  const [cover, setCover] = useState('');
  const run = async (name: string, fn: () => Promise<any>, message?: string) => {
    setBusy(name);
    try {
      await action(fn, message);
    } catch {
    } finally {
      setBusy('');
    }
  };
  const editable = !['submitted', 'submitting', 'unknown', 'skipped'].includes(a.stage);
  const hasSession = (a as any).hasSession;
  return (
    <Drawer title="Your application" onClose={onClose}>
      <div className="detail-company">
        <CompanyIcon company={a.job.company} />
        <div>
          <span>
            {a.job.company}
            {a.job.practice && <b className="practice-tag">Local practice</b>}
          </span>
          <h2>{a.job.title}</h2>
        </div>
      </div>
      <Badge stage={a.stage} />
      <div
        className={`application-message ${['needs_user', 'unknown'].includes(a.stage) ? 'attention' : ''}`}
      >
        <span>
          {a.stage === 'submitted' ? <CheckCircle2 size={19} /> : <AlertCircle size={19} />}
        </span>
        <p>{a.message}</p>
      </div>
      {paused && (
        <div className="notice">
          <Pause size={17} />
          <span>Automation is paused. Resume it on the Autopilot page before continuing.</span>
        </div>
      )}
      {editable && !profile.confirmed && (
        <div className="notice">
          <AlertCircle size={18} />
          <div>
            <strong>Your profile needs review.</strong>
            <p>
              Check the recovered background and résumé strategy, then confirm and save your
              profile.
            </p>
            <Button variant="primary" onClick={onReviewProfile}>
              Review & confirm my profile
            </Button>
          </div>
        </div>
      )}
      {editable && a.stage === 'review' && (
        <div className="approval-box">
          <strong>Ready for the final step</strong>
          <p>The form is filled. Review your answers and résumé, then approve submission.</p>
          {!!a.packet?.factEdits?.length && (
            <button className="text-button" onClick={() => setTab('documents')}>
              Compare {a.packet.factEdits.length} résumé wording changes
            </button>
          )}
          <Button
            variant="primary"
            disabled={!!busy || paused || !profile.confirmed || Object.keys(answers).length > 0}
            onClick={() =>
              void run(
                'submit',
                () => api(`/applications/${a.id}/approve`, { snapshotHash: a.snapshotHash }),
                'Submission result recorded',
              )
            }
          >
            <Send size={15} />
            {a.job.practice ? 'Submit practice application' : 'Approve & submit application'}
          </Button>
        </div>
      )}
      {editable && a.stage !== 'review' && (
        <div className="detail-actions">
          <Button
            variant="primary"
            disabled={
              !!busy || paused || !profile.confirmed || ['preparing', 'filling'].includes(a.stage)
            }
            onClick={() =>
              void run(
                'resume',
                () => api(`/applications/${a.id}/resume`, {}),
                'Application is being prepared',
              )
            }
          >
            <Play size={15} />
            {hasSession ? 'Resume & validate' : 'Open application browser'}
          </Button>
          {hasSession && (
            <Button
              variant="secondary"
              disabled={!!busy}
              onClick={() => void run('close', () => api(`/applications/${a.id}/close`, {}))}
            >
              Close browser
            </Button>
          )}
        </div>
      )}
      {editable && a.stage === 'review' && hasSession && (
        <Button
          variant="secondary"
          disabled={!!busy}
          onClick={() => void run('close', () => api(`/applications/${a.id}/close`, {}))}
        >
          Close browser
        </Button>
      )}
      <div className="tabs drawer-tabs">
        {[
          ['form', 'Live activity & answers'],
          ['documents', 'Documents'],
          ['receipt', 'Receipt'],
        ].map(([v, l]) => (
          <button key={v} className={tab === v ? 'active' : ''} onClick={() => setTab(v)}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'form' && (
        <>
          <section className="application-live" aria-label="Application progress">
            <div className="application-live-heading">
              <span
                className={
                  ['preparing', 'filling', 'submitting'].includes(a.stage) ? 'live-dot' : ''
                }
              />
              <strong>
                {['preparing', 'filling', 'submitting'].includes(a.stage)
                  ? 'Working on your application'
                  : a.waitingFor && hasSession
                    ? 'Watching the employer page'
                    : a.stage === 'review'
                      ? 'Application ready for review'
                      : 'Current application status'}
              </strong>
            </div>
            <p role="status" aria-live="polite">
              {a.message}
            </p>
            {a.waitingFor && hasSession && (
              <p className="help-text">
                {a.waitingFor === 'authentication'
                  ? 'Sign in or complete verification in the application browser. I’ll detect the next screen and continue.'
                  : 'I’ll retry when the page changes. You can keep this panel open to follow progress.'}
              </p>
            )}
            {a.browserPage && (
              <p className="application-current-page">
                <Globe size={13} />
                <span>{a.browserPage}</span>
              </p>
            )}
            <ol className="application-timeline">
              {(a.progress || []).slice(-7).map((item, i) => (
                <li key={`${item.at}-${i}`}>
                  <span className="timeline-node" />
                  <div>
                    <p>{item.message}</p>
                    <time>
                      {new Date(item.at).toLocaleTimeString([], {
                        hour: 'numeric',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </time>
                  </div>
                </li>
              ))}
            </ol>
          </section>
          {hasSession && a.screenshotAt && (
            <section className="application-browser-preview">
              <div>
                <strong>Application browser</strong>
                <small>Updated {new Date(a.screenshotAt).toLocaleTimeString()}</small>
              </div>
              <img
                src={`/api/applications/${a.id}/screenshot.png?v=${a.screenshotAt}`}
                alt="Latest employer page in the application browser"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
                onLoad={(e) => {
                  e.currentTarget.style.display = 'block';
                }}
                loading="lazy"
              />
            </section>
          )}

          {!!a.completedSteps?.length && (
            <details className="document-diff">
              <summary>{a.completedSteps.length} completed form steps</summary>
              {a.completedSteps.map((step, i) => (
                <div key={i}>
                  <strong>Step {i + 1}</strong>
                  {step.fields.map((field) => (
                    <p key={field.id}>
                      {field.label}:{' '}
                      {field.type === 'file' ? 'Prepared résumé attached' : field.value}
                    </p>
                  ))}
                </div>
              ))}
            </details>
          )}

          {a.fields.length ? (
            <>
              <h3>
                {a.stage === 'review' ? 'One last look. Make it yours.' : 'Application answers'}
              </h3>
              <p className="help-text">
                Check every value. Required questions are marked with an asterisk. Changes in the
                browser require another validation.
              </p>
              {a.fields.map((f) => (
                <div className="answer-field" key={f.id}>
                  <label className="form-label">
                    {f.label}
                    {f.required ? ' *' : ''}
                    {f.type === 'file' ? (
                      <span className="file-answer">
                        <FileText size={16} />
                        {f.value
                          ? f.value.replace(/^.*[\\/]/, '')
                          : f.required
                            ? 'Waiting for a supported document upload'
                            : 'Optional upload · no document requested'}
                      </span>
                    ) : f.options.length ? (
                      <select
                        disabled={!editable || !hasSession}
                        value={answers[f.id] ?? f.answer ?? f.value}
                        onChange={(e) => setAnswers({ ...answers, [f.id]: e.target.value })}
                      >
                        <option value="">Choose an answer…</option>
                        {f.options.map((o, i) => (
                          <option key={i}>{o}</option>
                        ))}
                      </select>
                    ) : f.type === 'checkbox' ? (
                      <select
                        disabled={!editable || !hasSession}
                        value={answers[f.id] ?? f.answer ?? f.value}
                        onChange={(e) => setAnswers({ ...answers, [f.id]: e.target.value })}
                      >
                        <option value="">Choose…</option>
                        <option>Yes</option>
                        <option>No</option>
                      </select>
                    ) : (
                      <textarea
                        rows={f.type === 'textarea' ? 3 : 1}
                        disabled={!editable || !hasSession}
                        value={answers[f.id] ?? f.answer ?? f.value}
                        onChange={(e) => setAnswers({ ...answers, [f.id]: e.target.value })}
                        placeholder="Your answer"
                      />
                    )}
                  </label>
                  {editable && hasSession && f.type === 'textarea' && (
                    <button
                      className="text-button"
                      disabled={!!busy}
                      onClick={() =>
                        void run(
                          'suggest',
                          async () => {
                            const proposal = await api<{ answer: string; needsUser: boolean }>(
                              `/applications/${a.id}/suggest`,
                              { fieldId: f.id },
                            );
                            if (proposal.needsUser)
                              throw new Error(
                                'The model needs more confirmed facts. Please answer this one yourself.',
                              );
                            setAnswers((v) => ({ ...v, [f.id]: proposal.answer }));
                          },
                          'Draft ready. Review it before applying answer changes.',
                        )
                      }
                    >
                      <Sparkles size={12} />
                      Draft with my model
                    </button>
                  )}
                  <div className="answer-meta">
                    <span className={f.resolved ? 'resolved' : 'unresolved'}>
                      {f.resolved ? <Check size={12} /> : <AlertCircle size={12} />} {f.source}
                    </span>
                    {editable && f.type !== 'file' && (
                      <label>
                        <input
                          type="checkbox"
                          checked={save[f.id] || false}
                          onChange={(e) => setSave({ ...save, [f.id]: e.target.checked })}
                        />
                        Save for this exact question
                      </label>
                    )}
                  </div>
                </div>
              ))}
              {editable && hasSession && (
                <Button
                  variant="secondary"
                  disabled={!!busy || Object.keys(answers).length === 0}
                  onClick={() =>
                    void run(
                      'answers',
                      async () => {
                        await api(`/applications/${a.id}/answers`, {
                          answers: Object.entries(answers).map(([id, value]) => ({
                            id,
                            value,
                            save: !!save[id],
                          })),
                        });
                        setAnswers({});
                        setSave({});
                        await api(`/applications/${a.id}/resume`, {});
                      },
                      'Answers applied. Continuing and validating the form.',
                    )
                  }
                >
                  <Check size={15} />
                  Apply answer changes
                </Button>
              )}
              {a.stage === 'review' && (
                <div className="approval-box">
                  <ShieldCheck size={23} />
                  <h3>Ready when you are.</h3>
                  <p>
                    This sends your current form and résumé to{' '}
                    {a.job.practice ? 'the local practice form' : a.job.company}. Review the
                    documents and answers first.
                  </p>
                  <Button
                    variant="primary full"
                    disabled={!!busy || paused || Object.keys(answers).length > 0}
                    onClick={() =>
                      void run(
                        'submit',
                        () =>
                          api(`/applications/${a.id}/approve`, { snapshotHash: a.snapshotHash }),
                        'Submission result recorded',
                      )
                    }
                  >
                    <Send size={15} />
                    {busy === 'submit'
                      ? 'Submitting…'
                      : a.job.practice
                        ? 'Submit practice application'
                        : 'Approve & submit application'}
                  </Button>
                  {Object.keys(answers).length > 0 && (
                    <small>Apply your answer changes, then Resume to review again.</small>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="help-text">
              {hasSession
                ? 'Application fields will appear here when the employer form is ready.'
                : 'Start the application to prepare documents and follow progress here.'}
            </p>
          )}
          {hasSession && !a.screenshotAt && (
            <details className="screenshot">
              <summary>See the latest browser snapshot</summary>
              <img
                src={`/api/applications/${a.id}/screenshot.png?v=${a.updatedAt}`}
                alt="Current application form"
                onError={(e) => (e.currentTarget.style.display = 'none')}
              />
            </details>
          )}
        </>
      )}
      {tab === 'documents' && (
        <>
          <h3>Every document, attached to this application.</h3>
          {a.packet ? (
            <>
              <a
                className="button secondary"
                href={`/api/applications/${a.id}/resume.pdf`}
                target="_blank"
                rel="noreferrer"
              >
                <FileText size={15} />
                Open résumé PDF <ExternalLink size={13} />
              </a>
              <p className="help-text">
                Prepared {date(a.packet.generatedAt)} · {a.packet.model}
              </p>
              {editable && a.packet.requiresReview && !a.packet.approved && (
                <div className="approval-box">
                  <h3>Review the résumé wording</h3>
                  <p>
                    AI changed {a.packet.factEdits?.length || 0} fact lines. Compare each edit with
                    your original background. Submission follows your saved application policy.
                  </p>
                  {a.packet.factEdits?.map((e) => (
                    <div className="fact-edit" key={e.id}>
                      <p className="diff-omitted">Original: {e.original}</p>
                      <p className="diff-kept">Proposed: {e.text}</p>
                    </div>
                  ))}
                  <Button
                    variant="primary"
                    disabled={!!busy}
                    onClick={() =>
                      void run(
                        'approve-document',
                        () => api(`/applications/${a.id}/approve-document`, {}),
                        'Résumé edits approved. You can submit the reviewed application.',
                      )
                    }
                  >
                    <Check size={15} />
                    Mark these résumé edits reviewed
                  </Button>
                </div>
              )}
              {editing ? (
                <>
                  <TextArea
                    label="Résumé text"
                    value={resume}
                    onChange={(e) => setResume(e.target.value)}
                    rows={14}
                  />
                  <TextArea
                    label="Cover letter"
                    value={cover}
                    onChange={(e) => setCover(e.target.value)}
                    rows={7}
                  />
                  <Button
                    variant="primary"
                    disabled={!!busy}
                    onClick={() =>
                      void run(
                        'packet',
                        async () => {
                          await api(`/applications/${a.id}/packet`, {
                            resumeText: resume,
                            coverLetter: cover,
                          });
                          setEditing(false);
                        },
                        'Documents saved',
                      )
                    }
                  >
                    Save documents
                  </Button>
                </>
              ) : (
                <>
                  <div className="document-preview">{a.packet.resumeText}</div>
                  <details
                    className="document-diff"
                    onToggle={(e) => {
                      if (e.currentTarget.open)
                        void api(`/applications/${a.id}/diff`)
                          .then(setDocumentDiff)
                          .catch(() => {});
                    }}
                  >
                    <summary>Review the résumé fact selection</summary>
                    {documentDiff && (
                      <div>
                        <p className="help-text">
                          Profile version {documentDiff.profileVersion}.
                          {documentDiff.edited
                            ? ' This document was edited by you.'
                            : ' Compare the original facts and the proposed wording below.'}
                        </p>
                        {(documentDiff.edits || []).map((e: any) => (
                          <div className="fact-edit" key={e.id}>
                            <p className="diff-omitted">Original: {e.original}</p>
                            <p className="diff-kept">Proposed: {e.text}</p>
                          </div>
                        ))}
                        {documentDiff.kept.map((f: any) => (
                          <p className="diff-kept" key={f.id}>
                            + {f.text}
                          </p>
                        ))}
                        {documentDiff.omitted.map((f: any) => (
                          <p className="diff-omitted" key={f.id}>
                            − {f.text}
                          </p>
                        ))}
                      </div>
                    )}
                  </details>
                  {a.packet.coverLetter && (
                    <>
                      <h3>Cover letter draft</h3>
                      <div className="document-preview">{a.packet.coverLetter}</div>
                      <p className="help-text">
                        Review this draft before using it. Paste it into the appropriate form answer
                        when needed.
                      </p>
                    </>
                  )}
                  {editable && !hasSession && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setResume(a.packet!.resumeText);
                        setCover(a.packet!.coverLetter);
                        setEditing(true);
                      }}
                    >
                      Edit documents
                    </Button>
                  )}
                </>
              )}
            </>
          ) : (
            <p className="muted">
              A résumé is prepared from your confirmed profile when you open the application.
            </p>
          )}
          {editable && !hasSession && (
            <div className="ai-prepare">
              <h3>A little local intelligence</h3>
              <p>
                Prepare the résumé using the strategy saved in My profile. AI edits are checked
                against your background and shown for review.
              </p>
              <Button
                variant="secondary"
                disabled={!!busy}
                onClick={() =>
                  void run(
                    'prepare',
                    () => api(`/applications/${a.id}/prepare`, {}),
                    'Application documents prepared',
                  )
                }
              >
                <Sparkles size={15} />
                {busy === 'prepare'
                  ? 'Preparing with your model…'
                  : 'Prepare using my résumé strategy'}
              </Button>
            </div>
          )}
        </>
      )}
      {tab === 'receipt' && (
        <>
          {a.receipt ? (
            <div className="receipt">
              <span className="receipt-icon">
                <CheckCheck size={30} />
              </span>
              <h3>{a.job.practice ? 'Practice completed.' : 'Application received.'}</h3>
              <p>{a.receipt.confirmation}</p>
              <dl>
                <dt>Recorded</dt>
                <dd>{new Date(a.receipt.submittedAt).toLocaleString()}</dd>
                <dt>Destination</dt>
                <dd>{a.job.company}</dd>
                <dt>Submission type</dt>
                <dd>{a.job.practice ? 'Local practice' : 'Employer application'}</dd>
              </dl>
              <h4>Recorded fields</h4>
              {a.receipt.fields.map((f, i) => (
                <div className="receipt-field" key={i}>
                  <span>{f.label}</span>
                  <strong>{f.value || '—'}</strong>
                </div>
              ))}
              <a
                className="button secondary"
                href={`/api/applications/${a.id}/receipt.json`}
                download
              >
                <Download size={15} />
                Download receipt
              </a>
            </div>
          ) : (
            <Empty
              icon={ShieldCheck}
              title="Proof of your next step"
              description="After a confirmed submission, your receipt will record the fields, document hash, and confirmation here."
            />
          )}
        </>
      )}
      {a.stage === 'unknown' && (
        <section className="reconcile-box">
          <h3>Let’s confirm what happened.</h3>
          <p>
            Check the employer page, account history, or confirmation email. The assistant will not
            automatically retry this application.
          </p>
          <TextArea
            label="What did you find?"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="e.g. Confirmation email received, reference…"
          />
          <div className="detail-actions">
            <Button
              variant="primary"
              disabled={note.length < 5 || !!busy}
              onClick={() =>
                void run(
                  'reconcile',
                  () =>
                    api(`/applications/${a.id}/reconcile`, { submitted: true, confirmation: note }),
                  'Submission confirmed',
                )
              }
            >
              It was submitted
            </Button>
            <Button
              variant="secondary"
              disabled={note.length < 5 || !!busy}
              onClick={() =>
                void run(
                  'reconcile',
                  () =>
                    api(`/applications/${a.id}/reconcile`, {
                      submitted: false,
                      confirmation: note,
                    }),
                  'Ready to resume',
                )
              }
            >
              It was not submitted
            </Button>
          </div>
        </section>
      )}
      {editable && (
        <div className="drawer-bottom">
          <a href={a.job.url} target="_blank" rel="noreferrer">
            Open original posting <ExternalLink size={13} />
          </a>
          <button
            className="text-button danger"
            disabled={!!busy}
            onClick={() =>
              void run('skip', () => api(`/applications/${a.id}/skip`, {}), 'Application skipped')
            }
          >
            Skip this application
          </button>
        </div>
      )}
    </Drawer>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
