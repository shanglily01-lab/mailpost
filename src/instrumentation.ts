export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  const { ensureTicker } = await import("./lib/ticker");
  ensureTicker();
}
