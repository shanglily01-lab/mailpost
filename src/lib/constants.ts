export const MAX_DAILY_PER_MAILBOX = 50;
export const DEFAULT_DAILY_CAP = 50;
export const WARMUP_DAYS = 21;
export const IMPORT_ROW_CAP = 200;
export const BULK_BATCH_SIZE = 20;
export const BOUNCE_KILL = 0.02;
export const SPAM_KILL = 0.001;

export const ROLE_LOCAL_PARTS = new Set([
  "info",
  "sales",
  "support",
  "admin",
  "webmaster",
  "noreply",
  "no-reply",
  "marketing",
  "hello",
  "contact",
  "office",
  "mail",
  "postmaster",
  "billing",
  "hr",
  "jobs",
  "service",
  "help",
]);

export const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "10minutemail.com",
  "tempmail.com",
  "temp-mail.org",
  "yopmail.com",
  "trashmail.com",
  "getnada.com",
  "sharklasers.com",
  "discard.email",
  "throwaway.email",
  "moakt.com",
]);

export const SPAMMY_PATTERNS = [
  /免费/i,
  /点击这里/i,
  /限时优惠/i,
  /马上购买/i,
  /立即抢购/i,
  /中奖/i,
  /加微[信信]/i,
  /act now/i,
  /\bfree\b/i,
  /click here/i,
  /limited time/i,
  /buy now/i,
  /\$\$\$/,
  /congratulations you (won|are)/i,
];

export const PERSONALIZATION_KEYS = [
  "firstName",
  "company",
  "title",
  "industry",
  "lastName",
] as const;

export const PURCHASED_SOURCE_HINTS = [
  "purchased",
  "bought",
  "buy",
  "broker",
  "list",
  "购买",
  "买的",
  "买来",
  "中介",
  "黑市",
  "数据包",
  "邮箱包",
];
