import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { seedState } from "./seed";
import type { Activity, AppState, Contact } from "./types";
import { nid, nowISO } from "./id";

function dataFileLocked(): boolean {
  return process.env.MAILPOST_SKIP_DATA === "1" || process.env.NEXT_PHASE === "phase-production-build";
}

/** Production mailboxes live only in MAILPOST_DATA_DIR, never inside the git tree. */
function resolveDataPaths(): { dir: string; file: string } {
  const configured = process.env.MAILPOST_DATA_DIR?.trim();
  if (process.env.NODE_ENV === "production") {
    if (!configured) throw new Error("生产环境必须设置 MAILPOST_DATA_DIR，不能把邮箱写进代码目录。");
    const dir = path.resolve(configured);
    const appDir = path.resolve(process.cwd());
    if (dir === appDir || dir.startsWith(appDir + path.sep)) {
      throw new Error("MAILPOST_DATA_DIR 不能放在代码目录里。");
    }
    return { dir, file: path.join(dir, "mailpost.json") };
  }
  const dir = path.resolve(configured || path.join(process.cwd(), "data"));
  return { dir, file: path.join(dir, "mailpost.json") };
}

let cache: AppState | null = null;
let writing = Promise.resolve();

function log(state: AppState, kind: Activity["kind"], title: string, detail: string) {
  state.activity.unshift({ id: nid(), at: nowISO(), kind, title, detail });
  state.activity = state.activity.slice(0, 200);
}

export function dataDir(): string {
  if (dataFileLocked()) return path.join(process.cwd(), ".mailpost-no-data");
  return resolveDataPaths().dir;
}

export function dataFile(): string {
  if (dataFileLocked()) return path.join(dataDir(), "mailpost.json");
  return resolveDataPaths().file;
}

function contactLedgerFile(): string {
  return path.join(resolveDataPaths().dir, "contacts.json");
}

function readContactLedger(): Contact[] {
  const file = contactLedgerFile();
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as { contacts?: Contact[] } | Contact[];
    const rows = Array.isArray(parsed) ? parsed : parsed.contacts;
    return Array.isArray(rows) ? rows.filter((row) => row && typeof row.email === "string" && row.email.includes("@")) : [];
  } catch {
    return [];
  }
}

function writeContactLedger(contacts: Contact[]) {
  const { dir } = resolveDataPaths();
  mkdirSync(dir, { recursive: true });
  writeFileSync(contactLedgerFile(), JSON.stringify({ contacts }, null, 2), "utf8");
}

function contactKey(email: string): string {
  return email.trim().toLowerCase();
}

/** Imported addresses live in contacts.json as well, so replacing mailpost.json does not drop the list. */
function keepImportedContacts(state: AppState): boolean {
  if (!Array.isArray(state.contacts)) state.contacts = [];
  const saved = readContactLedger();
  const seen = new Set(state.contacts.map((row) => contactKey(row.email)));
  let restored = 0;
  for (const row of saved) {
    const key = contactKey(row.email);
    if (seen.has(key)) continue;
    state.contacts.push(row);
    seen.add(key);
    restored += 1;
  }
  const savedKeys = new Set(saved.map((row) => contactKey(row.email)));
  const changed = restored > 0 || state.contacts.some((row) => !savedKeys.has(contactKey(row.email)));
  if (changed) writeContactLedger(state.contacts);
  return restored > 0;
}

function normalizeState(state: AppState) {
  if (!Array.isArray(state.templates)) state.templates = [];
}

export function loadState(): AppState {
  if (cache) {
    normalizeState(cache);
    return cache;
  }
  if (dataFileLocked()) {
    cache = seedState();
    return cache;
  }
  const { dir, file } = resolveDataPaths();
  mkdirSync(dir, { recursive: true });
  mkdirSync(path.join(dir, "outbox"), { recursive: true });

  if (!existsSync(file)) {
    cache = seedState();
    if (keepImportedContacts(cache)) {
      writeFileSync(file, JSON.stringify(cache, null, 2), "utf8");
    } else if (process.env.NODE_ENV !== "production") {
      writeFileSync(file, JSON.stringify(cache, null, 2), "utf8");
    }
    return cache;
  }

  cache = JSON.parse(readFileSync(file, "utf8")) as AppState;
  normalizeState(cache);
  if (keepImportedContacts(cache)) {
    writeFileSync(file, JSON.stringify(cache, null, 2), "utf8");
  }
  return cache;
}

export async function mutateState<T>(fn: (state: AppState) => T | Promise<T>): Promise<T> {
  if (dataFileLocked()) {
    return fn(loadState());
  }
  const run = async () => {
    const state = loadState();
    const result = await fn(state);
    const { dir, file } = resolveDataPaths();
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, JSON.stringify(state, null, 2), "utf8");
    if (Array.isArray(state.contacts)) writeContactLedger(state.contacts);
    cache = state;
    return result;
  };
  const next = writing.then(run, run);
  writing = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

export function pushLog(state: AppState, kind: Activity["kind"], title: string, detail: string) {
  log(state, kind, title, detail);
}

export function resetCache() {
  cache = null;
}
