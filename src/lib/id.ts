import { randomBytes, randomUUID } from "crypto";

export function nid(): string {
  return randomUUID();
}

export function token(): string {
  return randomBytes(18).toString("hex");
}

export function todayISO(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function nowISO(): string {
  return new Date().toISOString();
}
