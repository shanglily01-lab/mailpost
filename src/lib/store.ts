import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { seedState } from "./seed";
import type { AppState, Activity } from "./types";
import { nid, nowISO } from "./id";

const DIR = path.resolve(process.env.MAILPOST_DATA_DIR || path.join(process.cwd(), "data"));
const FILE = path.join(DIR, "mailpost.json");

let cache: AppState | null = null;
let writing = Promise.resolve();

function log(state: AppState, kind: Activity["kind"], title: string, detail: string) {
  state.activity.unshift({ id: nid(), at: nowISO(), kind, title, detail });
  state.activity = state.activity.slice(0, 200);
}

export function dataDir(): string {
  return DIR;
}

export function dataFile(): string {
  return FILE;
}

export function loadState(): AppState {
  if (cache) return cache;
  mkdirSync(DIR, { recursive: true });
  mkdirSync(path.join(DIR, "outbox"), { recursive: true });

  if (!existsSync(FILE)) {
    cache = seedState();
    writeFileSync(FILE, JSON.stringify(cache, null, 2), "utf8");
    return cache;
  }

  cache = JSON.parse(readFileSync(FILE, "utf8")) as AppState;
  return cache;
}

export async function mutateState<T>(fn: (state: AppState) => T | Promise<T>): Promise<T> {
  const run = async () => {
    const state = loadState();
    const result = await fn(state);
    mkdirSync(DIR, { recursive: true });
    writeFileSync(FILE, JSON.stringify(state, null, 2), "utf8");
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
