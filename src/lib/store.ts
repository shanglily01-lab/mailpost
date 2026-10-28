import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { seedState } from "./seed";
import type { AppState, Activity } from "./types";
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

export function loadState(): AppState {
  if (cache) return cache;
  if (dataFileLocked()) {
    cache = seedState();
    return cache;
  }
  const { dir, file } = resolveDataPaths();
  mkdirSync(dir, { recursive: true });
  mkdirSync(path.join(dir, "outbox"), { recursive: true });

  if (!existsSync(file)) {
    cache = seedState();
    if (process.env.NODE_ENV !== "production") {
      writeFileSync(file, JSON.stringify(cache, null, 2), "utf8");
    }
    return cache;
  }

  cache = JSON.parse(readFileSync(file, "utf8")) as AppState;
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
