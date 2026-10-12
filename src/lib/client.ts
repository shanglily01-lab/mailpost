"use client";

import { useCallback, useEffect, useState } from "react";
import type { ClientState } from "./types";

export function useMailpost() {
  const [state, setState] = useState<ClientState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    const r = await fetch("/api/state", { cache: "no-store" });
    if (!r.ok) throw new Error("无法读取工作台数据");
    setState((await r.json()) as ClientState);
  }, []);

  const mutate = useCallback(
    async (action: string, payload?: Record<string, unknown>) => {
      setBusy(true);
      setError("");
      setNotice("");
      try {
        const r = await fetch("/api/mutate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, payload }),
        });
        const data = (await r.json()) as { ok: boolean; error?: string; message?: string; data?: unknown };
        await refresh();
        if (!data.ok) setError(data.error || "操作失败");
        else if (data.message) setNotice(data.message);
        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : "网络错误";
        setError(message);
        return { ok: false, error: message };
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  useEffect(() => {
    refresh().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "加载失败");
    });
  }, [refresh]);

  return { state, error, busy, notice, refresh, mutate, setError, setNotice };
}

export function pct(n: number, digits = 2): string {
  return `${(n * 100).toFixed(digits)}%`;
}
