export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  if (process.env.NEXT_PHASE === "phase-production-build" || process.env.MAILPOST_SKIP_DATA === "1") return;
  const { ensureTicker } = await import("./lib/ticker");
  ensureTicker();
}
