export type Region = "CN" | "US" | "EU" | "OTHER";
export type DomainPurpose = "primary" | "sending";
export type DnsStatus = "unknown" | "pass" | "fail";
export type MailboxStatus = "warming" | "ready" | "paused";
export type DomainStatus = "warming" | "ready" | "paused" | "blocked";
export type Verification = "unverified" | "valid" | "invalid" | "risky" | "catch_all";
export type Consent = "none" | "implied_b2b" | "explicit_opt_in";
export type ContactSource = "manual" | "b2b_db" | "website" | "event" | "purchased";
export type IcpFit = "high" | "medium" | "low";
export type CampaignStatus = "draft" | "running" | "paused" | "completed" | "killed";
export type JobStatus =
  | "queued"
  | "sent"
  | "bounced"
  | "replied"
  | "unsubscribed"
  | "skipped"
  | "blocked";

export type GateCode =
  | "PRIMARY_DOMAIN"
  | "DNS_INCOMPLETE"
  | "WARMUP_CAP"
  | "DAILY_CAP"
  | "UNVERIFIED"
  | "INVALID"
  | "RISKY"
  | "UNSUBSCRIBED"
  | "SUPPRESSED"
  | "NO_CONSENT_CN"
  | "NO_CONSENT_EU"
  | "TEMPLATE_SPAMMY"
  | "TEMPLATE_NO_PERSONALIZATION"
  | "TEMPLATE_PROMO"
  | "MISSING_ADDRESS"
  | "BOUNCE_KILLED"
  | "SPAM_KILLED"
  | "CAMPAIGN_NOT_RUNNING"
  | "PURCHASED_LIST"
  | "IMPORT_TOO_LARGE"
  | "SANDBOX";

export type Gate = {
  code: GateCode;
  message: string;
  severity: "block" | "warn";
};

export type Domain = {
  id: string;
  hostname: string;
  purpose: DomainPurpose;
  spf: DnsStatus;
  dkim: DnsStatus;
  dkimSelector: string;
  dmarc: DnsStatus;
  warmupStartedAt: string;
  warmupDaysRequired: number;
  status: DomainStatus;
  notes: string;
};

export type Mailbox = {
  id: string;
  domainId: string;
  email: string;
  displayName: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  dailyCap: number;
  sentToday: number;
  sentTodayDate: string;
  warmupStartedAt: string;
  status: MailboxStatus;
};

export type Contact = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  title: string;
  company: string;
  industry: string;
  icpFit: IcpFit;
  source: ContactSource;
  verification: Verification;
  verifyNote: string;
  consent: Consent;
  region: Region;
  unsubscribed: boolean;
  suppressed: boolean;
  unsubToken: string;
  notes: string;
  createdAt: string;
};

export type SequenceStep = {
  delayDays: number;
  subject: string;
  body: string;
};

export type Sequence = {
  id: string;
  name: string;
  steps: SequenceStep[];
  updatedAt: string;
};

export type CampaignKind = "bulk" | "sequence";

export type Campaign = {
  id: string;
  name: string;
  sequenceId: string;
  mailboxIds: string[];
  contactIds: string[];
  status: CampaignStatus;
  killReason: string;
  createdAt: string;
  launchedAt: string | null;
  kind?: CampaignKind;
  subject?: string;
  body?: string;
};

export type SendJob = {
  id: string;
  campaignId: string;
  contactId: string;
  mailboxId: string;
  stepIndex: number;
  scheduledAt: string;
  sentAt: string | null;
  status: JobStatus;
  bounceType: "hard" | "soft" | null;
  blockReason: string;
  subject: string;
  preview: string;
  toEmail?: string;
};

export type Activity = {
  id: string;
  at: string;
  kind: "info" | "warn" | "danger" | "ok";
  title: string;
  detail: string;
};

export type Settings = {
  companyName: string;
  physicalAddress: string;
  primaryDomain: string;
  legalRegion: "CN" | "US" | "EU" | "MULTI";
  bounceKillThreshold: number;
  spamKillThreshold: number;
  maxDailyPerMailbox: number;
  sandboxMode: boolean;
  publicBaseUrl: string;
};

export type AppState = {
  settings: Settings;
  domains: Domain[];
  mailboxes: Mailbox[];
  contacts: Contact[];
  sequences: Sequence[];
  campaigns: Campaign[];
  jobs: SendJob[];
  activity: Activity[];
  spamComplaints: number;
  hardBounces: number;
};

export type Overview = {
  bounceRate: number;
  spamRate: number;
  delivered: number;
  sentToday: number;
  dailyBudget: number;
  readyMailboxes: number;
  warmingMailboxes: number;
  verifiedContacts: number;
  sendableContacts: number;
  runningCampaigns: number;
  killActive: boolean;
  killReasons: string[];
  sandbox: boolean;
};

export type ClientMailbox = Mailbox & {
  warmupDay: number;
  warmupPct: number;
  effectiveCap: number;
};

export type ClientDomain = Domain & {
  warmupDay: number;
  warmupPct: number;
};

export type ClientState = Omit<AppState, "mailboxes" | "domains"> & {
  mailboxes: ClientMailbox[];
  domains: ClientDomain[];
  overview: Overview;
};
