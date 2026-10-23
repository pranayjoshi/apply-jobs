import { useEffect, useState, useRef } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Globe,
  KeyRound,
  Layers,
  Link2,
  LoaderCircle,
  Mail,
  Monitor,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Wifi,
  X,
  Zap,
} from 'lucide-react';
import type {
  AppState,
  Settings,
  Profile,
  Job,
  SourceCatalogItem,
  WatchSource,
  InboxItem,
} from './types';
type Action = (fn: () => Promise<any>, message?: string) => Promise<any>;
async function request<T = any>(route: string, body?: unknown, method?: string): Promise<T> {
  const form = body instanceof FormData;
  const r = await fetch('/api' + route, {
    method: method || (body === undefined ? 'GET' : 'POST'),
    headers:
      body === undefined
        ? {}
        : { 'X-Apply-Jobs': 'local', ...(form ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : form ? body : JSON.stringify(body),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Request failed');
  return d;
}
const human = (date?: string) =>
  date
    ? new Date(date).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'Not checked yet';
function Btn({
  children,
  secondary = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { secondary?: boolean }) {
  return (
    <button className={`button ${secondary ? 'secondary' : 'primary'}`} {...props}>
      {children}
    </button>
  );
}
function Input({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="form-label">
      {label}
      <input {...props} />
    </label>
  );
}
function Area({
  label,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return (
    <label className="form-label">
      {label}
      <textarea {...props} />
    </label>
  );
}
export function FilterFields({
  value,
  onChange,
}: {
  value: Settings;
  onChange: (s: Settings) => void;
}) {
  const set = (key: keyof Settings, v: any) => onChange({ ...value, [key]: v });
  return (
    <>
      <div className="form-grid">
        <Area
          label="Target role keywords (comma separated)"
          rows={2}
          placeholder="Software engineer, Product engineer"
          value={value.roles}
          onChange={(e) => set('roles', e.target.value)}
        />
        <Area
          label="Locations (comma separated)"
          rows={2}
          placeholder="Chicago, United States, Remote"
          value={value.locations}
          onChange={(e) => set('locations', e.target.value)}
        />
      </div>
      <div className="form-grid">
        <Input
          label="Published within (days; 0 = any age)"
          type="number"
          min={0}
          max={365}
          value={value.maxAgeDays ?? 30}
          onChange={(e) => set('maxAgeDays', +e.target.value)}
        />
        <Input
          label="Minimum annual salary"
          type="number"
          min={0}
          value={value.minSalary ?? 0}
          onChange={(e) => set('minSalary', +e.target.value)}
        />
        <label className="form-label">
          Salary currency
          <select value={value.currency || 'USD'} onChange={(e) => set('currency', e.target.value)}>
            {['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'INR'].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <Input
          label="Excluded companies (comma separated)"
          value={value.excludedCompanies}
          onChange={(e) => set('excludedCompanies', e.target.value)}
        />
      </div>
      <div className="check-options">
        <label>
          <input
            type="checkbox"
            checked={value.remoteOnly || false}
            onChange={(e) => set('remoteOnly', e.target.checked)}
          />
          Remote roles only
        </label>
        <label>
          <input
            type="checkbox"
            checked={value.requireSalary || false}
            onChange={(e) => set('requireSalary', e.target.checked)}
          />
          Require disclosed salary in my currency
        </label>
      </div>
      <p className="help-text">
        Missing dates and compensation stay unknown. Salary filtering uses annual amounts in the
        selected currency; no exchange-rate assumptions.
      </p>
      <div className="filter-label">Employment type</div>
      <div className="filter-chips">
        {[
          ['fulltime', 'Full time'],
          ['parttime', 'Part time'],
          ['contract', 'Contract'],
          ['internship', 'Internship'],
        ].map(([v, l]) => (
          <button
            type="button"
            className={value.employmentTypes?.includes(v) ? 'selected' : ''}
            key={v}
            onClick={() =>
              set(
                'employmentTypes',
                value.employmentTypes?.includes(v)
                  ? value.employmentTypes.filter((x) => x !== v)
                  : [...(value.employmentTypes || []), v],
              )
            }
          >
            {l}
          </button>
        ))}
      </div>
      <div className="filter-label">Seniority</div>
      <div className="filter-chips">
        {['intern', 'junior', 'senior', 'lead', 'manager'].map((v) => (
          <button
            type="button"
            className={value.seniority?.includes(v) ? 'selected' : ''}
            key={v}
            onClick={() =>
              set(
                'seniority',
                value.seniority?.includes(v)
                  ? value.seniority.filter((x) => x !== v)
                  : [...(value.seniority || []), v],
              )
            }
          >
            {v}
          </button>
        ))}
      </div>
    </>
  );
}
export function ModelConnector({
  state: s,
  action,
  onReady,
}: {
  state: AppState;
  action: Action;
  onReady?: () => void;
}) {
  const [provider, setProvider] = useState(s.settings.provider),
    [url, setUrl] = useState(s.settings.baseUrl),
    [model, setModel] = useState(s.settings.model),
    [key, setKey] = useState(''),
    [models, setModels] = useState(s.modelStatus.models),
    [busy, setBusy] = useState(''),
    [status, setStatus] = useState(''),
    [tested, setTested] = useState(false),
    [runtime, setRuntime] = useState<any>(null),
    [pull, setPull] = useState<any>(null);
  const completedPull = useRef('');
  useEffect(() => {
    void request('/models/runtime').then(setRuntime);
    const timer = setInterval(
      () =>
        void request('/models/runtime')
          .then((v) => {
            setRuntime(v);
            setPull(v.pull);
            if (
              v.pull.status === 'completed' &&
              v.pull.model &&
              completedPull.current !== v.pull.model
            ) {
              completedPull.current = v.pull.model;
              setModel(v.pull.model);
              void request('/models/check', {})
                .then((d) => setModels(d.models))
                .catch(() => {});
            }
            if (v.pull.status === 'running') completedPull.current = '';
          })
          .catch(() => {}),
      2000,
    );
    return () => clearInterval(timer);
  }, []);
  const choose = (preset: string) => {
    setTested(false);
    setStatus('');
    if (preset === 'ollama') {
      setProvider('ollama');
      setUrl('http://localhost:11434');
    } else {
      setProvider('compatible');
      setUrl(
        preset === 'lmstudio'
          ? 'http://localhost:1234/v1'
          : preset === 'llamacpp'
            ? 'http://localhost:8080/v1'
            : 'https://api.openai.com/v1',
      );
    }
    setModel('');
  };
  const connect = async (test = false) => {
    setBusy(test ? 'test' : 'connect');
    setStatus('');
    try {
      const d = await action(() =>
        request('/models/connect', { provider, baseUrl: url, model, apiKey: key || undefined }),
      );
      setKey('');
      setModels(d.models);
      if (!d.connected) throw new Error(d.error || 'Could not reach your model server');
      if (!model && d.models[0]) setModel(d.models[0]);
      if (test) {
        const result = await action(() => request('/models/test', {}));
        setStatus(
          `Ready. Structured inference succeeded in ${(result.milliseconds / 1000).toFixed(1)} seconds.`,
        );
        setTested(true);
        onReady?.();
      } else
        setStatus(
          d.models.length
            ? `Connected. Found ${d.models.length} model${d.models.length === 1 ? '' : 's'}. Select one and test it.`
            : 'Server connected. Enter a model name or download one below.',
        );
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy('');
    }
  };
  return (
    <section className="panel form-panel model-connect">
      <div className="form-section-heading">
        <span className="section-icon mint">
          <Monitor size={20} />
        </span>
        <div>
          <h2>Choose how to power your assistant</h2>
          <p>Use a free local model, or connect a model API you already have.</p>
        </div>
      </div>
      <div className="provider-presets">
        {[
          ['ollama', 'Ollama', 'Free · on this computer'],
          ['lmstudio', 'LM Studio', 'Free · on this computer'],
          ['llamacpp', 'llama.cpp', 'Free · on this computer'],
          ['api', 'Your API', 'Provider charges may apply'],
        ].map(([id, name, note]) => (
          <button
            key={id}
            type="button"
            onClick={() => choose(id)}
            className={
              (id === 'ollama' && provider === 'ollama') ||
              (id === 'lmstudio' && url.includes(':1234')) ||
              (id === 'llamacpp' && url.includes(':8080')) ||
              (id === 'api' && !/localhost|127\.0\.0\.1/.test(url))
                ? 'selected'
                : ''
            }
          >
            <strong>{name}</strong>
            <small>{note}</small>
          </button>
        ))}
      </div>
      <div className="setup-instructions">
        {provider === 'ollama' ? (
          <>
            <strong>
              {runtime?.managedOllama
                ? 'Ollama is included in this workspace.'
                : '1. Install and start Ollama.'}
            </strong>
            <p>
              {runtime?.managedOllama
                ? 'Connect below, then choose an installed model or download a free model.'
                : 'Install from ollama.com, open it, then use the local address below. You can download a model right here after connecting.'}
            </p>
            <a href="https://ollama.com/download" target="_blank" rel="noreferrer">
              Ollama setup <ExternalLink size={12} />
            </a>
          </>
        ) : url.includes(':1234') ? (
          <>
            <strong>1. Start your LM Studio server.</strong>
            <p>
              Download a model, open Developer, load the model, and Start Server. If you enabled
              authentication, add your LM Studio token below.
            </p>
            <a
              href="https://lmstudio.ai/docs/developer/core/server"
              target="_blank"
              rel="noreferrer"
            >
              LM Studio guide <ExternalLink size={12} />
            </a>
          </>
        ) : (
          <>
            <strong>1. Start your compatible server or use your API account.</strong>
            <p>
              Use its base URL ending in /v1, optional API key, and a model that supports chat with
              JSON-schema output. A remote API receives relevant résumé text.
            </p>
          </>
        )}
      </div>
      {provider === 'ollama' && !runtime?.managedOllama && runtime?.installer?.supported && (
        <div className="runtime-install">
          <Btn
            secondary
            disabled={runtime.installer.state === 'running'}
            onClick={() =>
              void action(async () => {
                await request('/models/connect', { provider, baseUrl: url, model });
                return request('/models/install-runtime', {});
              }).catch(() => {})
            }
          >
            <Download size={15} />
            {runtime.installer.state === 'running'
              ? 'Installing Ollama…'
              : 'Install Ollama in this workspace'}
          </Btn>
          <p className="help-text">
            Downloads the official runtime, verifies its SHA-256 checksum, and installs it only
            inside this workspace. No administrator account needed.
          </p>
          {runtime.installer.state !== 'idle' && (
            <p className="connect-result">
              {runtime.installer.message} {runtime.installer.percent}% {runtime.installer.error}
            </p>
          )}
        </div>
      )}
      <div className="form-grid">
        <Input
          label="Server / API base URL"
          type="url"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setTested(false);
          }}
        />
        <Input
          label={
            s.integrations?.modelApiKey
              ? 'API key (saved; leave blank to keep)'
              : 'API key (optional for local servers)'
          }
          type="password"
          autoComplete="off"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="Stored privately on this computer"
        />
      </div>
      <div className="inline-controls">
        <Btn secondary disabled={!!busy} onClick={() => void connect()}>
          <RefreshCw size={15} className={busy === 'connect' ? 'spin' : ''} />
          Find models
        </Btn>
        <label className="form-label grow">
          Model
          <input
            list="model-options"
            value={model}
            onChange={(e) => {
              setModel(e.target.value);
              setTested(false);
            }}
            placeholder="Select or enter a model name"
          />
        </label>
        <datalist id="model-options">
          {models.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </div>
      <div className="inline-controls">
        <Btn disabled={!!busy || !model} onClick={() => void connect(true)}>
          {busy === 'test' ? (
            <LoaderCircle size={15} className="spin" />
          ) : (
            <CheckCircle2 size={15} />
          )}
          Save & test real inference
        </Btn>
        {tested && (
          <span className="success-note">
            <Check size={14} />
            Ready to use
          </span>
        )}
      </div>
      {status && (
        <p className={`connect-result ${tested ? 'success-note' : ''}`} role="status">
          {status}
        </p>
      )}
      {provider === 'ollama' && runtime && (
        <div className="model-download">
          <strong>Need a free model?</strong>
          <p>
            This computer has {runtime.memoryGB} GB RAM. Downloads are local; no account or API bill
            is needed.
          </p>
          {runtime.recommendedModels.map((m: any) => (
            <div className="download-option" key={m.id}>
              <span>
                <b>
                  {m.name}
                  {m.recommended ? ' · Recommended' : ''}
                </b>
                <small>
                  {m.size} download · {m.memory}
                </small>
              </span>
              <Btn
                secondary
                disabled={!!busy || pull?.status === 'running' || models.includes(m.id)}
                onClick={async () => {
                  try {
                    await action(() =>
                      request('/models/connect', {
                        provider,
                        baseUrl: url,
                        model,
                        apiKey: key || undefined,
                      }),
                    );
                    setPull(await action(() => request('/models/pull', { model: m.id })));
                  } catch {}
                }}
              >
                {models.includes(m.id) ? (
                  'Installed'
                ) : (
                  <>
                    <Download size={14} />
                    Download
                  </>
                )}
              </Btn>
            </div>
          ))}
          {pull?.status !== 'idle' && pull && (
            <div className="pull-progress">
              <div>
                <span>
                  {pull.model} · {pull.message}
                </span>
                <b>{pull.percent}%</b>
              </div>
              <progress max={100} value={pull.percent} />
              {pull.status === 'running' && (
                <button
                  className="text-button"
                  onClick={() =>
                    void action(() => request('/models/pull/cancel', {})).catch(() => {})
                  }
                >
                  Cancel download
                </button>
              )}
              {pull.status === 'completed' && (
                <Btn secondary onClick={() => void connect()}>
                  Refresh installed models
                </Btn>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
export function SetupWizard({
  state: s,
  action,
  go,
}: {
  state: AppState;
  action: Action;
  go: (page: string) => void;
}) {
  const [step, setStep] = useState(s.profile.confirmed ? 2 : 0),
    [modelReady, setModelReady] = useState(false),
    [candidate, setCandidate] = useState<Profile>(s.profile),
    [filters, setFilters] = useState(s.settings),
    [busy, setBusy] = useState(''),
    [feeds, setFeeds] = useState(['remotive', 'remoteok', 'arbeitnow']),
    [companies, setCompanies] = useState<string[]>([]),
    [catalog, setCatalog] = useState<any>(null);
  useEffect(() => {
    void request('/catalog').then(setCatalog);
  }, []);
  const toggle = (v: string, arr: string[], setter: (x: string[]) => void) =>
    setter(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const importResume = async (file: File) => {
    setBusy('import');
    try {
      const form = new FormData();
      form.set('resume', file);
      const result = await action(() => request('/profile/import', form));
      setCandidate(result.profile);
      if (s.settings.model) {
        try {
          const extracted = await action(() => request('/profile/extract', {}));
          setCandidate(extracted);
        } catch {}
      }
    } finally {
      setBusy('');
    }
  };
  const nextProfile = async () => {
    setBusy('save');
    try {
      await action(
        () => request('/profile', { ...candidate, confirmed: true }, 'PUT'),
        'Profile confirmed',
      );
      setStep(2);
    } catch {
    } finally {
      setBusy('');
    }
  };
  const finish = async () => {
    setBusy('search');
    try {
      await action(() =>
        request(
          '/settings',
          {
            ...s.settings,
            ...filters,
            provider: s.settings.provider,
            baseUrl: s.settings.baseUrl,
            model: s.settings.model,
          },
          'PUT',
        ),
      );
      await action(() => request('/onboarding/sources', { kinds: feeds, companies }));
      await action(() => request('/onboarding', { dismissed: false, completed: true }));
      await action(() => request('/discovery/start', {}));
      setStep(3);
    } catch {
    } finally {
      setBusy('');
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">A FEW MINUTES TO MAKE IT YOURS</div>
          <h1>Let’s get you ready.</h1>
          <p>Connect your assistant, bring your experience, and find current opportunities.</p>
        </div>
        <button
          className="text-button"
          onClick={() =>
            void action(() => request('/onboarding', { dismissed: true, completed: false }))
              .then(() => go('overview'))
              .catch(() => {})
          }
        >
          Finish setup later
        </button>
      </div>
      <div className="wizard-steps">
        {['Your model', 'Your profile', 'Your search', 'Ready to go'].map((v, i) => (
          <button
            key={v}
            className={step === i ? 'current' : step > i ? 'complete' : ''}
            onClick={() => i < step && setStep(i)}
          >
            <span>{step > i ? <Check size={14} /> : i + 1}</span>
            {v}
          </button>
        ))}
      </div>
      {step === 0 && (
        <>
          <ModelConnector state={s} action={action} onReady={() => setModelReady(true)} />
          <div className="wizard-actions">
            <button className="text-button" onClick={() => setStep(1)}>
              Continue without AI for now
            </button>
            <Btn
              disabled={!modelReady && !(s.modelStatus.connected && s.settings.model)}
              onClick={() => setStep(1)}
            >
              Continue to profile
              <ArrowRight size={15} />
            </Btn>
          </div>
        </>
      )}
      {step === 1 && (
        <section className="panel form-panel">
          <h2>Your experience, ready for a new chapter.</h2>
          <p className="muted">
            Import a résumé, then review the extracted facts. You can also enter them yourself.
          </p>
          <label className="upload-zone">
            <Upload size={24} />
            <strong>{busy === 'import' ? 'Reading your résumé…' : 'Attach your résumé'}</strong>
            <span>PDF, DOCX, TXT or image · stays local</span>
            <input
              type="file"
              accept=".pdf,.docx,.txt,.png,.jpg,.jpeg"
              disabled={!!busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importResume(f).catch(() => {});
              }}
            />
          </label>
          <div className="form-grid">
            {(['name', 'email', 'phone', 'location', 'headline', 'linkedin'] as const).map((k) => (
              <Input
                key={k}
                label={
                  {
                    name: 'Full name',
                    email: 'Email',
                    phone: 'Phone',
                    location: 'Location',
                    headline: 'Professional headline',
                    linkedin: 'LinkedIn URL',
                  }[k]
                }
                type={k === 'email' ? 'email' : 'text'}
                value={candidate[k]}
                onChange={(e) =>
                  setCandidate({ ...candidate, [k]: e.target.value, confirmed: false })
                }
              />
            ))}
          </div>
          {(['summary', 'experience', 'education', 'skills'] as const).map((k) => (
            <Area
              key={k}
              label={k.charAt(0).toUpperCase() + k.slice(1)}
              rows={k === 'experience' ? 5 : 3}
              value={candidate[k]}
              onChange={(e) =>
                setCandidate({ ...candidate, [k]: e.target.value, confirmed: false })
              }
            />
          ))}
          <label className="confirm-inline">
            <input
              type="checkbox"
              checked={candidate.confirmed}
              onChange={(e) => setCandidate({ ...candidate, confirmed: e.target.checked })}
            />
            I reviewed these facts and confirm they are accurate.
          </label>
          <div className="wizard-actions">
            <button className="text-button" onClick={() => go('profile')}>
              Open the full profile editor
            </button>
            <Btn
              disabled={!!busy || !candidate.name || !candidate.email || !candidate.confirmed}
              onClick={() => void nextProfile()}
            >
              Save & continue
              <ArrowRight size={15} />
            </Btn>
          </div>
        </section>
      )}
      {step === 2 && (
        <>
          <section className="panel form-panel">
            <h2>What should we keep an eye out for?</h2>
            <p className="muted">
              Your filters apply to discovery results and Autopilot eligibility.
            </p>
            <FilterFields value={filters} onChange={setFilters} />
          </section>
          <section className="panel form-panel">
            <h2>Choose your starting sources</h2>
            <p className="muted">
              No keys needed for these feeds. Add more company boards and optional API sources in
              Integrations.
            </p>
            <div className="source-choice-grid">
              {['remotive', 'remoteok', 'arbeitnow'].map((kind) => (
                <label key={kind}>
                  <input
                    type="checkbox"
                    checked={feeds.includes(kind)}
                    onChange={() => toggle(kind, feeds, setFeeds)}
                  />
                  <span>
                    <strong>
                      {catalog?.sources.find((c: any) => c.kind === kind)?.name || kind}
                    </strong>
                    <small>{catalog?.sources.find((c: any) => c.kind === kind)?.description}</small>
                  </span>
                </label>
              ))}
            </div>
            <h3 className="directory-heading">Optional company career boards</h3>
            <div className="filter-chips">
              {catalog?.directory.map((c: any) => (
                <button
                  key={c.name}
                  className={companies.includes(c.name) ? 'selected' : ''}
                  onClick={() => toggle(c.name, companies, setCompanies)}
                >
                  {companies.includes(c.name) && <Check size={12} />} {c.name}
                </button>
              ))}
            </div>
            <p className="help-text">
              You’ll see jobs from enabled sources, with publication and last-checked dates.
              Remotive is delayed 24 hours; coverage is not the entire job market.
            </p>
            <Btn
              disabled={!!busy || (!feeds.length && !companies.length)}
              onClick={() => void finish()}
            >
              {busy ? <LoaderCircle size={15} className="spin" /> : <Search size={15} />}Save & find
              matching jobs
            </Btn>
          </section>
        </>
      )}
      {step === 3 && (
        <section className="panel ready-panel">
          <span className="receipt-icon">
            <CheckCircle2 size={34} />
          </span>
          <h2>Your search has a home.</h2>
          <p>
            Your model, profile, and search preferences are saved. Autopilot stays off until you
            enable it.
          </p>
          {s.discovery?.status === 'running' ? (
            <div className="connect-result">
              <LoaderCircle size={17} className="spin" />
              Checking source {s.discovery.processed + 1} of {s.discovery.total}…
            </div>
          ) : (
            <p className="success-note">
              The latest discovery run is{' '}
              {s.discovery?.status === 'completed' ? 'complete' : 'ready'}.
            </p>
          )}
          <Btn onClick={() => go('jobs')}>
            See my opportunities
            <ArrowRight size={15} />
          </Btn>
        </section>
      )}
    </>
  );
}
export function JobExplorer({
  state: s,
  action,
  onAdd,
  onDetail,
  onPractice,
}: {
  state: AppState;
  action: Action;
  onAdd: () => void;
  onDetail: (j: Job) => void;
  onPractice: () => void;
}) {
  const [tab, setTab] = useState('matching'),
    [q, setQ] = useState(''),
    [sort, setSort] = useState('fit'),
    [page, setPage] = useState(1),
    [result, setResult] = useState<any>({ jobs: [], total: 0, pages: 0, coverage: [] }),
    [loading, setLoading] = useState(false),
    [showFilters, setShowFilters] = useState(false),
    [filters, setFilters] = useState(s.settings),
    [sourceModal, setSourceModal] = useState(false);
  const stamp =
    s.sources.map((x) => x.lastSync + x.lastError).join('|') +
    s.discovery?.status +
    JSON.stringify(s.settings) +
    s.profile.version;
  useEffect(() => {
    if (tab === 'sources' || tab === 'practice') return;
    let active = true;
    const t = setTimeout(() => {
      setLoading(true);
      void request(
        `/jobs/search?${new URLSearchParams({ q, sort, page: String(page), matching: String(tab === 'matching') })}`,
      )
        .then((v) => active && setResult(v))
        .catch(() => {})
        .finally(() => active && setLoading(false));
    }, 250);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [q, sort, page, tab, stamp]);
  const start = () =>
    void action(
      () => request('/discovery/start', {}),
      'Checking enabled sources. Cached feeds keep their next allowed refresh time.',
    ).catch(() => {});
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">CURRENT OPPORTUNITIES, WITH CONTEXT</div>
          <h1>Find work that fits your next chapter.</h1>
          <p>
            {s.jobTotal || 0} saved listings · {s.sources.filter((x) => x.enabled).length} enabled
            sources · Your filters decide what fits.
          </p>
        </div>
        <div className="inline-controls">
          <Btn secondary onClick={onAdd}>
            <Plus size={15} />
            Paste a link
          </Btn>
          <Btn
            disabled={
              s.discovery?.status === 'running' ||
              s.settings.paused ||
              !s.sources.some((x) => x.enabled)
            }
            onClick={start}
          >
            <RefreshCw size={15} className={s.discovery?.status === 'running' ? 'spin' : ''} />
            Find latest jobs
          </Btn>
        </div>
      </div>
      {s.discovery?.status === 'running' && (
        <div className="discovery-progress">
          <LoaderCircle className="spin" size={17} />
          <span>
            Checking source {Math.min(s.discovery.processed + 1, s.discovery.total)} of{' '}
            {s.discovery.total}. You can keep using your workspace.
          </span>
          <progress max={s.discovery.total || 1} value={s.discovery.processed} />
        </div>
      )}
      <div className="tab-toolbar">
        <div className="tabs">
          {[
            ['matching', 'Matches for you'],
            ['all', 'All active'],
            ['sources', 'Sources'],
            ['practice', 'Practice'],
          ].map(([id, name]) => (
            <button
              key={id}
              className={tab === id ? 'active' : ''}
              onClick={() => {
                setTab(id);
                setPage(1);
              }}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="inline-controls">
          <button
            className="button secondary"
            onClick={() => {
              setFilters(s.settings);
              setShowFilters(!showFilters);
            }}
          >
            <Settings2 size={14} />
            Filters
          </button>
          <select
            aria-label="Sort opportunities"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(1);
            }}
          >
            <option value="fit">Best fit</option>
            <option value="newest">Newest published</option>
          </select>
        </div>
      </div>
      {showFilters && (
        <section className="panel form-panel">
          <h2>Your search preferences</h2>
          <FilterFields value={filters} onChange={setFilters} />
          <Btn
            onClick={() =>
              void action(
                () => request('/settings', { ...s.settings, ...filters }, 'PUT'),
                'Search preferences saved',
              )
                .then(() => {
                  setShowFilters(false);
                  setPage(1);
                })
                .catch(() => {})
            }
          >
            Apply filters
            <Check size={15} />
          </Btn>
        </section>
      )}
      {tab === 'sources' ? (
        <>
          <div className="section-heading standalone">
            <div>
              <h2>Your job sources</h2>
              <p>
                Refresh intervals honor source guidance. Failed or partial syncs never close
                existing jobs.
              </p>
            </div>
            <Btn secondary onClick={() => setSourceModal(true)}>
              <Plus size={15} />
              Add a source
            </Btn>
          </div>
          {!s.sources.length ? (
            <section className="panel empty">
              <Globe size={30} />
              <h3>Choose where your opportunities come from.</h3>
              <p>Start with public feeds or add a company career-page URL.</p>
              <Btn onClick={() => setSourceModal(true)}>Connect a source</Btn>
            </section>
          ) : (
            <div className="source-grid">
              {s.sources.map((source) => (
                <section className="panel source-card" key={source.id}>
                  <div className="source-header">
                    <span className="company-icon mint">
                      {source.label?.slice(0, 2).toUpperCase() || 'JB'}
                    </span>
                    <div>
                      <h3>{source.label || source.ats}</h3>
                      <p>
                        {source.ats}
                        {source.board ? ` · ${source.board}` : ''}
                        {source.region === 'eu' ? ' · EU' : ''}
                      </p>
                    </div>
                    <label className="small-check">
                      <input
                        aria-label={`Enable ${source.label || source.ats}`}
                        type="checkbox"
                        checked={source.enabled}
                        onChange={(e) =>
                          void action(() =>
                            request(`/sources/${source.id}`, { enabled: e.target.checked }, 'PUT'),
                          ).catch(() => {})
                        }
                      />
                    </label>
                  </div>
                  <p className="muted">
                    {source.count ?? 0} listings · Checked {human(source.lastSync)}
                  </p>
                  <p className="help-text">
                    {source.completeSnapshot
                      ? ['greenhouse', 'lever', 'ashby', 'smartrecruiters', 'workable'].includes(
                          source.ats,
                        )
                        ? 'Complete employer snapshot; missing jobs are retired.'
                        : 'Complete source snapshot; missing listings become stale.'
                      : 'Source listing snapshot; absence alone does not prove closure.'}
                  </p>
                  {source.manualOnly && (
                    <p className="help-text">
                      Manual API source · uses your provider allowance. Each refresh searches up to
                      3 role phrases × 2 locations × 2 pages (Jooble: 1 page).
                    </p>
                  )}
                  {source.lastError && <p className="inline-error">{source.lastError}</p>}
                  <p className="help-text">Next refresh: {human(source.nextSync)}</p>
                  <div className="inline-controls">
                    <Btn
                      secondary
                      disabled={!!source.nextSync && Date.parse(source.nextSync) > Date.now()}
                      onClick={() =>
                        void action(
                          () => request(`/sources/${source.id}/sync`, {}),
                          'Source checked',
                        ).catch(() => {})
                      }
                    >
                      <RefreshCw size={14} />
                      Check source
                    </Btn>
                    <button
                      className="icon-button"
                      aria-label={`Remove ${source.label || source.ats}`}
                      onClick={() =>
                        void action(
                          () => request(`/sources/${source.id}`, {}, 'DELETE'),
                          'Source removed',
                        ).catch(() => {})
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      ) : tab === 'practice' ? (
        <section className="panel empty">
          <ShieldCheck size={32} />
          <h3>A full workflow, without a real submission.</h3>
          <p>
            The practice form is local to your computer. Try your profile, résumé upload, review,
            and receipt.
          </p>
          <Btn onClick={onPractice}>
            Create practice application
            <ArrowRight size={15} />
          </Btn>
        </section>
      ) : (
        <>
          <div className="search-results-toolbar">
            <div className="search-input">
              <Search size={16} />
              <input
                aria-label="Search roles or companies"
                placeholder="Search roles, skills, or companies…"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <span className="muted">
              {loading
                ? 'Searching…'
                : `${result.total} ${tab === 'matching' ? 'matching' : 'active'} listings`}
            </span>
          </div>
          {result.jobs.length ? (
            <div className="jobs-grid">
              {result.jobs.map((j: Job) => (
                <article className="panel job-card enhanced-job" key={j.id}>
                  <div className="job-card-top">
                    <span className="company-icon mint">{j.company.slice(0, 2).toUpperCase()}</span>
                    <span className="fit-pill">{j.score}% fit</span>
                  </div>
                  <span className="job-company">{j.company}</span>
                  <button className="job-title" onClick={() => onDetail(j)}>
                    <h3>{j.title}</h3>
                  </button>
                  <p>
                    {j.remote ? 'Remote · ' : ''}
                    {j.location || 'Location not supplied'}
                  </p>
                  <div className="job-meta-chips">
                    {j.employmentType && <span>{j.employmentType}</span>}
                    {j.seniority && j.seniority !== 'unknown' && <span>{j.seniority}</span>}
                    {j.salaryMin || j.salaryMax ? (
                      <span>
                        {j.salaryCurrency} {(j.salaryMin || j.salaryMax || 0).toLocaleString()}
                        {j.salaryMax && j.salaryMin
                          ? `–${j.salaryMax.toLocaleString()}`
                          : ''} / {j.salaryPeriod || 'period unspecified'}
                      </span>
                    ) : null}
                  </div>
                  <div className="freshness-line">
                    <span>
                      {j.publishedAt
                        ? `Published ${human(j.publishedAt)}`
                        : `First seen ${human(j.createdAt)}`}
                    </span>
                    <span>Seen {human(j.lastSeenAt)}</span>
                  </div>
                  {j.attribution && (
                    <a
                      className={`source-credit ${j.attribution.name === 'Adzuna' ? 'adzuna-credit' : ''}`}
                      href={j.attribution.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Jobs via {j.attribution.name}
                      <ExternalLink size={11} />
                    </a>
                  )}
                  <div className="job-card-footer">
                    <span>{j.ats}</span>
                    <button className="text-button" onClick={() => onDetail(j)}>
                      Review opportunity
                      <ArrowUpRight size={14} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <section className="panel empty">
              <Search size={29} />
              <h3>
                {tab === 'matching'
                  ? 'No matches from your current sources yet.'
                  : 'Your shortlist is ready for a first opportunity.'}
              </h3>
              <p>
                {tab === 'matching'
                  ? 'Try broader role/location keywords, enable another source, or check All active. Missing salary or seniority can exclude listings when those filters are selected.'
                  : 'Connect sources and fetch listings, or paste a job link.'}
              </p>
              <div className="inline-controls">
                <Btn secondary onClick={() => setSourceModal(true)}>
                  Add job sources
                </Btn>
                <Btn onClick={start} disabled={s.discovery?.status === 'running'}>
                  Fetch latest listings
                </Btn>
              </div>
            </section>
          )}
          {result.pages > 1 && (
            <div className="pagination">
              <Btn secondary disabled={page === 1} onClick={() => setPage(page - 1)}>
                Previous
              </Btn>
              <span>
                Page {page} of {result.pages}
              </span>
              <Btn secondary disabled={page === result.pages} onClick={() => setPage(page + 1)}>
                Next
              </Btn>
            </div>
          )}
          <div className="coverage-note">
            <Globe size={17} />
            <p>
              <strong>Know your coverage.</strong> These are listings from enabled sources, not
              every job on the web. Source delays and unreported closing dates can affect
              availability. Posting status is checked again before applications begin.
            </p>
          </div>
          {s.discovery?.results.some((r) => r.error) && (
            <section className="panel form-panel">
              <h3>Some sources need attention</h3>
              {s.discovery.results
                .filter((r) => r.error)
                .map((r) => (
                  <p className="inline-error" key={r.source}>
                    {r.source}: {r.error}
                  </p>
                ))}
            </section>
          )}
        </>
      )}
      {sourceModal && <SourcePicker action={action} onClose={() => setSourceModal(false)} />}
    </>
  );
}
function SourcePicker({ action, onClose }: { action: Action; onClose: () => void }) {
  const [data, setData] = useState<any>(null),
    [kind, setKind] = useState('remotive'),
    [board, setBoard] = useState(''),
    [label, setLabel] = useState(''),
    [region, setRegion] = useState('global'),
    [url, setUrl] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    void request('/catalog').then(setData);
  }, []);
  const item = data?.sources.find((x: any) => x.kind === kind);
  return (
    <div className="modal-backdrop">
      <section className="modal" role="dialog" aria-modal="true" aria-label="Connect a job source">
        <button
          className="icon-button close-modal"
          onClick={onClose}
          aria-label="Close source dialog"
        >
          <X size={18} />
        </button>
        <h2>More places to find your next role.</h2>
        <p>Choose a public feed, paste an employer career page, or connect your API account.</p>
        <div className="inline-controls">
          <Input
            label="Employer career-page URL (optional)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://jobs.ashbyhq.com/company"
          />
          <Btn
            secondary
            onClick={() =>
              void action(() => request('/sources/parse', { url }))
                .then((d) => {
                  setKind(d.ats);
                  setBoard(d.board);
                  setRegion(d.region || 'global');
                })
                .catch(() => {})
            }
          >
            Detect
          </Btn>
        </div>
        <label className="form-label">
          Source
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setBoard(e.target.value === 'adzuna' ? 'us' : '');
            }}
          >
            {data?.sources.map((s: any) => (
              <option value={s.kind} key={s.kind}>
                {s.name}
                {s.requiresKey ? ' · Your API key' : ''}
              </option>
            ))}
          </select>
        </label>
        <p className="help-text">{item?.description}</p>
        {kind === 'jooble' && (
          <Input
            label="Jooble region (blank for jooble.org; e.g. uk)"
            value={board}
            onChange={(e) => setBoard(e.target.value)}
          />
        )}
        {item?.requiresBoard && (
          <Input
            label={
              kind === 'adzuna' ? 'Country code (us, gb, ca, etc.)' : 'Company board identifier'
            }
            value={board}
            onChange={(e) => setBoard(e.target.value)}
          />
        )}
        <Input
          label="Display name (optional)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        {kind === 'lever' && (
          <label className="form-label">
            Lever region
            <select value={region} onChange={(e) => setRegion(e.target.value)}>
              <option value="global">Global</option>
              <option value="eu">Europe</option>
            </select>
          </label>
        )}
        {item?.requiresKey && (
          <p className="notice">
            Add your provider credentials under Integrations before syncing this source.
          </p>
        )}
        <p className="help-text">
          Checked no more often than every {item?.minIntervalMinutes} minutes.{' '}
          <a href={item?.docs} target="_blank" rel="noreferrer">
            Source documentation ↗
          </a>
        </p>
        <Btn
          disabled={busy || (item?.requiresBoard && !board)}
          onClick={async () => {
            setBusy(true);
            try {
              await action(
                () => request('/sources', { ats: kind, board, label: label || item?.name, region }),
                'Source connected',
              );
              onClose();
            } catch {
            } finally {
              setBusy(false);
            }
          }}
        >
          <Plus size={15} />
          Connect source
        </Btn>
      </section>
    </div>
  );
}
export function IntegrationSettings({ state: s, action }: { state: AppState; action: Action }) {
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR ASSISTANT, YOUR CHOICE</div>
          <h1>Connected the way you want.</h1>
          <p>Free local models and optional API access, with a real connection test.</p>
        </div>
      </div>
      <ModelConnector state={s} action={action} />
      <section className="panel form-panel">
        <h2>Browser & scheduling</h2>
        <label className="confirm-inline">
          <input
            type="checkbox"
            checked={s.settings.headless}
            onChange={(e) =>
              void action(() =>
                request('/settings', { ...s.settings, headless: e.target.checked }, 'PUT'),
              ).catch(() => {})
            }
          />
          Run the application browser in the background
        </label>
        <p className="help-text">
          Keep the browser visible for sign-in, challenges, and manual interventions.
        </p>
        <Input
          label="Employer feed check interval (minutes)"
          type="number"
          min={5}
          max={1440}
          value={s.settings.pollMinutes}
          onChange={(e) => {
            const value = +e.target.value;
            if (value >= 5 && value <= 1440)
              void action(() =>
                request('/settings', { ...s.settings, pollMinutes: value }, 'PUT'),
              ).catch(() => {});
          }}
        />
        <p className="help-text">Source-specific minimum intervals take precedence.</p>
        <a className="button secondary" href="/api/export" download="apply-jobs-export.json">
          <Download size={15} />
          Export workspace
        </a>
      </section>
    </>
  );
}
export function IntegrationsPage({ state: s, action }: { state: AppState; action: Action }) {
  const [values, setValues] = useState<Record<string, string>>({}),
    [code, setCode] = useState<any>(null),
    [busy, setBusy] = useState('');
  const groups = [
    {
      id: 'adzuna',
      title: 'Adzuna',
      description:
        'Country-based discovery. Free evaluation and account-specific quotas; provider terms apply.',
      link: 'https://developer.adzuna.com/',
      fields: [
        ['adzunaAppId', 'App ID'],
        ['adzunaApiKey', 'API key'],
      ],
    },
    {
      id: 'usajobs',
      title: 'USAJOBS',
      description: 'Open federal job announcements. Register for a free API key.',
      link: 'https://developer.usajobs.gov/apirequest/index',
      fields: [
        ['usajobsEmail', 'Registration email'],
        ['usajobsApiKey', 'API key'],
      ],
    },
    {
      id: 'jooble',
      title: 'Jooble',
      description:
        'Search with your existing Jooble API account. Free keys have 500 lifetime requests; paid provider terms vary.',
      link: 'https://jooble.org/api/about',
      fields: [['joobleApiKey', 'API key']],
    },
    {
      id: 'imap',
      title: 'Job-related inbox',
      description:
        'Read-only TLS IMAP. Checks up to 100 messages with job-related subjects from the last 30 days. Uses an app password; your email provider must permit IMAP password authentication.',
      link: 'https://support.google.com/accounts/answer/185833',
      fields: [
        ['imapHost', 'IMAP hostname (e.g. imap.gmail.com)'],
        ['imapPort', 'TLS port (993)'],
        ['imapUser', 'Email / username'],
        ['imapPassword', 'App password'],
      ],
    },
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">CONNECT WHAT YOU NEED</div>
          <h1>A wider search. One private workspace.</h1>
          <p>
            Public feeds work without credentials. These optional integrations use your own
            accounts.
          </p>
        </div>
      </div>
      <section className="panel form-panel">
        <div className="form-section-heading">
          <span className="section-icon mint">
            <Link2 size={20} />
          </span>
          <div>
            <h2>Capture from LinkedIn, Indeed, and other job boards</h2>
            <p>Save the posting you’re viewing and its employer application link.</p>
          </div>
        </div>
        <p className="muted">
          Install the local Chrome/Edge extension using Developer mode → Load unpacked. Pair it with
          a temporary code below. It reads only the active job page when you open its popup.
        </p>
        <div className="inline-controls">
          <a className="button secondary" href="/downloads/apply-jobs-extension.zip" download>
            <Download size={15} />
            Download capture extension
          </a>
          <Btn
            onClick={() =>
              void action(() => request('/extension/pair-code', {}))
                .then(setCode)
                .catch(() => {})
            }
          >
            Generate pairing code
          </Btn>
          <button
            className="text-button danger"
            onClick={() =>
              void action(
                () => request('/extension/revoke', {}),
                'All extension access revoked',
              ).catch(() => {})
            }
          >
            Revoke extension access
          </button>
        </div>
        {code && (
          <div className="pair-code">
            <strong>{code.code}</strong>
            <span>Enter in the extension · expires {human(code.expiresAt)}</span>
          </div>
        )}
        <p className="help-text">
          LinkedIn and Indeed don’t provide an unrestricted public applicant search API. Capture
          preserves the original posting and hands off to an employer form when available; it does
          not bypass logins or automate Easy Apply.
        </p>
      </section>
      <div className="integration-grid">
        {groups.map((g) => (
          <section className="panel form-panel" key={g.id}>
            <h2>
              {g.title}
              <span
                className={`status-pill ${g.fields.every(([name]) => s.integrations?.[name] || name === 'imapPort') ? 'online' : ''}`}
              >
                {g.fields.some(([name]) => s.integrations?.[name])
                  ? 'Credentials saved'
                  : 'Not connected'}
              </span>
            </h2>
            <p className="muted">{g.description}</p>
            <a className="text-button" href={g.link} target="_blank" rel="noreferrer">
              Provider setup guide
              <ExternalLink size={12} />
            </a>
            <div className="integration-fields">
              {g.fields.map(([name, label]) => (
                <Input
                  key={name}
                  label={label}
                  type={/key|password/i.test(name) ? 'password' : 'text'}
                  autoComplete="off"
                  placeholder={
                    s.integrations?.[name]
                      ? 'Saved · leave blank to keep'
                      : name === 'imapPort'
                        ? '993'
                        : ''
                  }
                  value={values[name] || ''}
                  onChange={(e) => setValues({ ...values, [name]: e.target.value })}
                />
              ))}
            </div>
            <div className="inline-controls">
              <Btn
                secondary
                disabled={!!busy}
                onClick={async () => {
                  setBusy(g.id);
                  try {
                    await action(
                      () =>
                        request(
                          '/integrations',
                          Object.fromEntries(g.fields.map(([name]) => [name, values[name] || ''])),
                          'PUT',
                        ),
                      'Credentials saved locally',
                    );
                    setValues((v) =>
                      Object.fromEntries(
                        Object.entries(v).filter(
                          ([name]) => !g.fields.some(([key]) => key === name),
                        ),
                      ),
                    );
                  } catch {
                  } finally {
                    setBusy('');
                  }
                }}
              >
                Save connection
              </Btn>
              {g.id === 'imap' && (
                <Btn
                  disabled={!!busy}
                  onClick={async () => {
                    setBusy('imap-sync');
                    try {
                      await action(() => request('/inbox/sync', {}), 'Inbox checked');
                    } catch {
                    } finally {
                      setBusy('');
                    }
                  }}
                >
                  <RefreshCw size={14} className={busy === 'imap-sync' ? 'spin' : ''} />
                  Check inbox
                </Btn>
              )}
              <button
                className="text-button danger"
                onClick={() =>
                  void action(
                    () =>
                      request(
                        '/integrations',
                        Object.fromEntries(g.fields.map(([name]) => [name, '__DELETE__'])),
                        'PUT',
                      ),
                    'Credentials removed',
                  ).catch(() => {})
                }
              >
                Disconnect
              </button>
            </div>
            {g.id !== 'imap' && (
              <p className="help-text">
                After saving, add this provider under Discover jobs → Sources. Sync errors and
                provider limits are shown there.
              </p>
            )}
          </section>
        ))}
      </div>
      <div className="coverage-note">
        <ShieldCheck size={18} />
        <p>
          Keys are stored in a local encrypted vault and are never returned to the dashboard or
          workspace export. The vault key stays on the same computer; protect your device and
          backups. Credentialed services stay unverified until you provide access and run a sync.
        </p>
      </div>
    </>
  );
}
export function InboxPage({ state: s, action }: { state: AppState; action: Action }) {
  const [inbox, setInbox] = useState<any>({ messages: s.inbox || [], lastSync: '', error: '' }),
    [busy, setBusy] = useState(false),
    [links, setLinks] = useState<Record<string, string>>({});
  useEffect(() => {
    void request('/inbox').then(setInbox);
  }, [s.inbox?.length]);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">KEEP THE CONVERSATION CONNECTED</div>
          <h1>Your next steps, together.</h1>
          <p>Job-related email, linked by company and role. Ambiguous messages stay unlinked.</p>
        </div>
        <Btn
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const data = await action(
                () => request('/inbox/sync', {}),
                'Job-related inbox checked',
              );
              setInbox(data);
            } catch {
            } finally {
              setBusy(false);
            }
          }}
        >
          <RefreshCw className={busy ? 'spin' : ''} size={15} />
          Check inbox
        </Btn>
      </div>
      <p className="help-text">
        Last checked: {human(inbox.lastSync)}. Set up TLS IMAP under Integrations. This integration
        never sends email or reads attachments.
      </p>
      {inbox.error && <p className="inline-error">{inbox.error}</p>}
      {inbox.messages.length ? (
        <div className="mail-list">
          {inbox.messages.map((m: InboxItem) => (
            <article className="panel mail-card" key={m.id}>
              <div>
                <span
                  className={`badge ${m.category === 'rejection' ? 'failed' : m.category === 'interview' ? 'review' : 'submitted'}`}
                >
                  {m.category}
                </span>
                <time>{human(m.receivedAt)}</time>
              </div>
              <h3>{m.subject}</h3>
              <span className="muted">{m.from}</span>
              <p>{m.snippet}</p>
              <small>{m.matchReason}</small>
              <div className="mail-reply">
                <Btn
                  secondary
                  onClick={() =>
                    void action(
                      () => request(`/inbox/${m.id}/draft`, {}),
                      'Reply draft prepared locally. Nothing was sent.',
                    )
                      .then(() => request('/inbox'))
                      .then(setInbox)
                      .catch(() => {})
                  }
                >
                  <Sparkles size={14} />
                  Draft a reply
                </Btn>
                {m.replyDraft && (
                  <>
                    <textarea
                      className="reply-draft"
                      aria-label="Reply draft"
                      rows={6}
                      defaultValue={m.replyDraft}
                    />
                    <p className="help-text">
                      Copy, edit, and send from your own email app. Apply Jobs does not send email.
                    </p>
                  </>
                )}
              </div>
              {m.applicationId ? (
                <p className="success-note">
                  <Check size={14} />
                  Linked to{' '}
                  {s.applications.find((a) => a.id === m.applicationId)?.job.company ||
                    'an application'}
                </p>
              ) : (
                <div className="inline-controls">
                  <select
                    aria-label="Link email to application"
                    value={links[m.id] || ''}
                    onChange={(e) => setLinks({ ...links, [m.id]: e.target.value })}
                  >
                    <option value="">Choose an application…</option>
                    {s.applications
                      .filter((a) => !a.job.practice)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.job.company} · {a.job.title}
                        </option>
                      ))}
                  </select>
                  <Btn
                    secondary
                    disabled={!links[m.id]}
                    onClick={() =>
                      void action(
                        () => request(`/inbox/${m.id}/link`, { applicationId: links[m.id] }),
                        'Email linked',
                      )
                        .then(() => request('/inbox'))
                        .then(setInbox)
                        .catch(() => {})
                    }
                  >
                    Link
                  </Btn>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <section className="panel empty">
          <Mail size={31} />
          <h3>Your job search conversations will live here.</h3>
          <p>
            Connect a supported IMAP account in Integrations. No email access is required to apply
            for jobs.
          </p>
        </section>
      )}
    </>
  );
}
export function StructuredHistory({
  profile: p,
  onChange,
}: {
  profile: Profile;
  onChange: (p: Profile) => void;
}) {
  return (
    <section className="panel form-panel">
      <h2>Structured work & education history</h2>
      <p className="muted">
        Optional factual records help repeated application fields. Use YYYY-MM for dates. Confirm
        your profile after changes.
      </p>
      {(p.employmentHistory || []).map((h, i) => (
        <div className="history-row" key={i}>
          <div className="form-grid">
            {(['company', 'title', 'start', 'end'] as const).map((k) => (
              <Input
                key={k}
                label={k}
                value={h[k]}
                onChange={(e) =>
                  onChange({
                    ...p,
                    confirmed: false,
                    employmentHistory: p.employmentHistory!.map((v, n) =>
                      n === i ? { ...v, [k]: e.target.value } : v,
                    ),
                  })
                }
              />
            ))}
          </div>
          <Area
            label="Responsibilities"
            value={h.description}
            onChange={(e) =>
              onChange({
                ...p,
                confirmed: false,
                employmentHistory: p.employmentHistory!.map((v, n) =>
                  n === i ? { ...v, description: e.target.value } : v,
                ),
              })
            }
          />
          <button
            className="text-button danger"
            onClick={() =>
              onChange({
                ...p,
                confirmed: false,
                employmentHistory: p.employmentHistory!.filter((_, n) => n !== i),
              })
            }
          >
            Remove employment
          </button>
        </div>
      ))}
      <Btn
        secondary
        onClick={() =>
          onChange({
            ...p,
            confirmed: false,
            employmentHistory: [
              ...(p.employmentHistory || []),
              { company: '', title: '', start: '', end: '', description: '' },
            ],
          })
        }
      >
        <Plus size={14} />
        Add employment
      </Btn>
      {(p.educationHistory || []).map((h, i) => (
        <div className="history-row" key={i}>
          <div className="form-grid">
            {(['school', 'degree', 'field', 'start', 'end'] as const).map((k) => (
              <Input
                key={k}
                label={k}
                value={h[k]}
                onChange={(e) =>
                  onChange({
                    ...p,
                    confirmed: false,
                    educationHistory: p.educationHistory!.map((v, n) =>
                      n === i ? { ...v, [k]: e.target.value } : v,
                    ),
                  })
                }
              />
            ))}
          </div>
          <button
            className="text-button danger"
            onClick={() =>
              onChange({
                ...p,
                confirmed: false,
                educationHistory: p.educationHistory!.filter((_, n) => n !== i),
              })
            }
          >
            Remove education
          </button>
        </div>
      ))}
      <Btn
        secondary
        onClick={() =>
          onChange({
            ...p,
            confirmed: false,
            educationHistory: [
              ...(p.educationHistory || []),
              { school: '', degree: '', field: '', start: '', end: '' },
            ],
          })
        }
      >
        <Plus size={14} />
        Add education
      </Btn>
    </section>
  );
}
