export interface Profile {
  employmentHistory?: {
    company: string;
    title: string;
    start: string;
    end: string;
    description: string;
  }[];
  educationHistory?: {
    school: string;
    degree: string;
    field: string;
    start: string;
    end: string;
  }[];
  name: string;
  email: string;
  phone: string;
  location: string;
  headline: string;
  linkedin: string;
  website: string;
  summary: string;
  experience: string;
  education: string;
  skills: string;
  workAuthorization: string;
  sponsorship: string;
  resumeText: string;
  resumeFile: string;
  confirmed: boolean;
  version: number;
  answers: { question: string; answer: string }[];
}
export interface Settings {
  provider: 'ollama' | 'compatible';
  baseUrl: string;
  model: string;
  temperature: number;
  autopilot: boolean;
  paused: boolean;
  minScore: number;
  roles: string;
  locations: string;
  excludedCompanies: string;
  pollMinutes: number;
  headless: boolean;
  remoteOnly?: boolean;
  employmentTypes?: string[];
  seniority?: string[];
  minSalary?: number;
  currency?: string;
  requireSalary?: boolean;
  maxAgeDays?: number;
  onboardingComplete?: boolean;
}
export interface Job {
  id: string;
  url: string;
  canonicalKey: string;
  title: string;
  company: string;
  location: string;
  description: string;
  ats: string;
  source: string;
  score: number;
  reasons: string[];
  createdAt: string;
  status: 'open' | 'closed' | 'stale';
  publishedAt?: string;
  validThrough?: string;
  lastSeenAt?: string;
  lastCheckedAt?: string;
  remote?: boolean;
  employmentType?: string;
  seniority?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  salaryPeriod?: string;
  externalId?: string;
  attribution?: { name: string; url: string };
  observations?: { sourceId: string; active: boolean; lastSeenAt: string }[];
  freshness?: 'listed' | 'verified' | 'unknown';
  practice: boolean;
}
export type Stage =
  | 'queued'
  | 'preparing'
  | 'filling'
  | 'needs_user'
  | 'review'
  | 'submitting'
  | 'submitted'
  | 'unknown'
  | 'failed'
  | 'skipped';
export interface Field {
  occurrence?: number;
  section?: string;
  id: string;
  label: string;
  type: string;
  required: boolean;
  options: string[];
  value: string;
  answer: string;
  source: string;
  resolved: boolean;
}
export interface Packet {
  coverLetterConfirmed?: boolean;
  resumeText: string;
  coverLetter: string;
  selectedFactIds: string[];
  model: string;
  generatedAt: string;
}
export interface Receipt {
  submittedAt: string;
  url: string;
  confirmation: string;
  fields: { label: string; value: string }[];
  resumeHash: string;
  intentHash: string;
  practice: boolean;
}
export interface Application {
  profileSnapshot?: Profile;
  recruiterStatus?: 'applied' | 'interview' | 'rejected' | 'replied';
  submissionIntent?: { hash: string; formHash: string; createdAt: string; profileVersion: number };
  id: string;
  jobId: string;
  stage: Stage;
  message: string;
  fields: Field[];
  packet: Packet | null;
  profileVersion: number;
  revision: number;
  snapshotHash: string;
  receipt: Receipt | null;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  error: string;
  job: Job;
}
export type SourceKind =
  | 'greenhouse'
  | 'lever'
  | 'ashby'
  | 'smartrecruiters'
  | 'workable'
  | 'remotive'
  | 'remoteok'
  | 'arbeitnow'
  | 'adzuna'
  | 'usajobs'
  | 'jooble';
export interface WatchSource {
  id: string;
  ats: SourceKind;
  region?: 'global' | 'eu';
  url?: string;
  lastAttempt?: string;
  nextSync?: string;
  count?: number;
  completeSnapshot?: boolean;
  manualOnly?: boolean;
  board: string;
  label: string;
  lastSync: string;
  lastError: string;
  enabled: boolean;
}
export interface Activity {
  id: number;
  applicationId: string | null;
  message: string;
  kind: string;
  createdAt: string;
}
export interface AppState {
  profile: Profile;
  settings: Settings;
  jobs: Job[];
  applications: Application[];
  sources: WatchSource[];
  activity: Activity[];
  modelStatus: { connected: boolean; models: string[]; error: string };
  jobTotal?: number;
  discovery?: DiscoveryRun;
  onboarding?: { dismissed: boolean; completed: boolean };
  integrations?: Record<string, boolean>;
  inbox?: InboxItem[];
}

export interface DiscoveryRun {
  id: string;
  status: 'idle' | 'running' | 'completed';
  startedAt: string;
  finishedAt?: string;
  processed: number;
  total: number;
  added: number;
  results: { source: string; count: number; error: string; cached: boolean }[];
}
export interface InboxItem {
  id: string;
  applicationId?: string;
  subject: string;
  from: string;
  receivedAt: string;
  category: 'confirmation' | 'interview' | 'rejection' | 'reply' | 'unknown';
  snippet: string;
  matchReason: string;
  replyDraft?: string;
}
export interface SourceCatalogItem {
  kind: SourceKind;
  name: string;
  description: string;
  requiresBoard: boolean;
  requiresKey: boolean;
  minIntervalMinutes: number;
  attribution: string;
  docs: string;
}
