import { describe, it, expect, vi, afterEach } from "vitest";
import { enterFullscreenIfSupported } from "@/util/fullscreen";

const stubDocument = (doc: unknown) => vi.stubGlobal("document", doc);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("enterFullscreenIfSupported", () => {
  it("does not throw when there is no document (server/test env)", () => {
    stubDocument(undefined);
    expect(() => enterFullscreenIfSupported()).not.toThrow();
  });

  it("requests fullscreen on the document element when supported", () => {
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    stubDocument({ fullscreenElement: null, documentElement: { requestFullscreen } });

    enterFullscreenIfSupported();

    expect(requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it("skips the request when already fullscreen", () => {
    const requestFullscreen = vi.fn();
    stubDocument({ fullscreenElement: {}, documentElement: { requestFullscreen } });

    enterFullscreenIfSupported();

    expect(requestFullscreen).not.toHaveBeenCalled();
  });

  it("is a no-op when the Fullscreen API is absent (e.g. iPhone Safari)", () => {
    stubDocument({ fullscreenElement: null, documentElement: {} });
    expect(() => enterFullscreenIfSupported()).not.toThrow();
  });

  it("falls back to the webkit-prefixed request", () => {
    const webkitRequestFullscreen = vi.fn();
    stubDocument({ fullscreenElement: null, documentElement: { webkitRequestFullscreen } });

    enterFullscreenIfSupported();

    expect(webkitRequestFullscreen).toHaveBeenCalledTimes(1);
  });

  it("swallows a rejected fullscreen promise", async () => {
    const requestFullscreen = vi.fn().mockRejectedValue(new Error("blocked"));
    stubDocument({ fullscreenElement: null, documentElement: { requestFullscreen } });

    expect(() => enterFullscreenIfSupported()).not.toThrow();
    await Promise.resolve();
  });

  it("swallows a synchronous throw from the request", () => {
    const requestFullscreen = vi.fn(() => {
      throw new Error("blocked");
    });
    stubDocument({ fullscreenElement: null, documentElement: { requestFullscreen } });

    expect(() => enterFullscreenIfSupported()).not.toThrow();
  });
});
