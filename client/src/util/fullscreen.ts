/**
 * Enters fullscreen if the browser supports it, reclaiming the mobile browser's
 * address-bar space. A no-op where the Fullscreen API is unavailable (notably
 * iPhone Safari — there, "Add to Home Screen" is the way to lose the chrome) or
 * when already fullscreen. Must be called from within a user gesture. Never
 * throws — fullscreen requests are easily blocked and failure isn't important.
 */
export function enterFullscreenIfSupported(): void {
  if (typeof document === "undefined") return;
  if (document.fullscreenElement) return;

  const el = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => unknown;
  };
  const request = el.requestFullscreen ?? el.webkitRequestFullscreen;
  if (typeof request !== "function") return;

  try {
    const result = request.call(el);
    if (result && typeof (result as Promise<void>).then === "function") {
      (result as Promise<void>).catch(() => {});
    }
  } catch {
    /* fullscreen can be blocked; ignore */
  }
}
