import { describe, expect, it, vi } from "vitest";
import {
  FetchBlockedError,
  ResponseTooLargeError,
  TooManyRedirectsError,
  fetchText,
} from "./safe-fetch";

const noSleep = async () => {};

function textResponse(body: string, init?: ResponseInit): Response {
  return new Response(body, { status: 200, ...init });
}

function redirectResponse(location: string): Response {
  return new Response(null, { status: 302, headers: { location } });
}

describe("fetchText", () => {
  it("follows a redirect to a public address", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://example.com/start") return redirectResponse("https://example.com/final");
      return textResponse("payload");
    });
    const result = await fetchText(
      "https://example.com/start",
      { userAgent: "test-agent" },
      { fetchImpl: fetchImpl as unknown as typeof fetch, sleep: noSleep }
    );
    expect(result.status).toBe(200);
    expect(result.text).toBe("payload");
    expect(result.finalUrl).toBe("https://example.com/final");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("rejects a redirect to a private address without a second request", async () => {
    const fetchImpl = vi.fn(async () => redirectResponse("http://10.0.0.1/"));
    await expect(
      fetchText("https://example.com/start", { userAgent: "test-agent" }, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        sleep: noSleep,
      })
    ).rejects.toBeInstanceOf(FetchBlockedError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("throws TooManyRedirectsError after four redirects", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const match = /hop(\d+)/.exec(url);
      const hop = match ? Number(match[1]) : 0;
      return redirectResponse(`https://example.com/hop${hop + 1}`);
    });
    await expect(
      fetchText("https://example.com/hop0", { userAgent: "test-agent" }, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        sleep: noSleep,
      })
    ).rejects.toBeInstanceOf(TooManyRedirectsError);
  });

  it("throws ResponseTooLargeError and cancels the reader", async () => {
    const cancel = vi.fn(async () => undefined);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("x".repeat(5000)));
      },
      cancel,
    });
    const fetchImpl = vi.fn(async () => new Response(stream, { status: 200 }));
    await expect(
      fetchText("https://example.com/big", { userAgent: "test-agent", maxBytes: 1024 }, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        sleep: noSleep,
      })
    ).rejects.toBeInstanceOf(ResponseTooLargeError);
    expect(cancel).toHaveBeenCalled();
  });

  it("retries 503 twice then returns 200", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls <= 2) return new Response("busy", { status: 503 });
      return textResponse("ok");
    });
    const result = await fetchText(
      "https://example.com/flaky",
      { userAgent: "test-agent" },
      { fetchImpl: fetchImpl as unknown as typeof fetch, sleep: noSleep }
    );
    expect(result.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("does not retry 404", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 404 }));
    const result = await fetchText(
      "https://example.com/missing",
      { userAgent: "test-agent" },
      { fetchImpl: fetchImpl as unknown as typeof fetch, sleep: noSleep }
    );
    expect(result.status).toBe(404);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("propagates AbortError without retrying", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    const fetchImpl = vi.fn(async () => {
      throw abortError;
    });
    await expect(
      fetchText("https://example.com/slow", { userAgent: "test-agent" }, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        sleep: noSleep,
      })
    ).rejects.toBe(abortError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("sends the User-Agent header and uses manual redirect", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)["User-Agent"]).toBe("my-agent/1.0");
      expect(init?.redirect).toBe("manual");
      return textResponse("ok");
    });
    await fetchText(
      "https://example.com/ua",
      { userAgent: "my-agent/1.0" },
      { fetchImpl: fetchImpl as unknown as typeof fetch, sleep: noSleep }
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries network errors up to the configured count", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls <= 2) throw new TypeError("network down");
      return textResponse("recovered");
    });
    const result = await fetchText(
      "https://example.com/net",
      { userAgent: "test-agent" },
      { fetchImpl: fetchImpl as unknown as typeof fetch, sleep: noSleep }
    );
    expect(result.text).toBe("recovered");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
