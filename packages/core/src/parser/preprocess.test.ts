import { describe, expect, it } from "vitest";
import { encodeBase64 } from "./base64";
import { preprocessSubscriptionContent } from "./preprocess";

function ssdContent(payload: Record<string, unknown>): string {
  return `ssd://${encodeBase64(JSON.stringify(payload))}`;
}

describe("subscription preprocessors", () => {
  it("unwraps Base64 content before parsing", () => {
    const result = preprocessSubscriptionContent(encodeBase64("ss://example"));

    expect(result).toEqual({
      content: "ss://example",
      errors: [],
      applied: ["base64"],
    });
    expect(preprocessSubscriptionContent("   ")).toEqual({ content: "", errors: [], applied: [] });
    expect(preprocessSubscriptionContent("not base64 content!")).toEqual({
      content: "not base64 content!",
      errors: [],
      applied: [],
    });
    expect(preprocessSubscriptionContent("AA==")).toEqual({
      content: "AA==",
      errors: [],
      applied: [],
    });
  });

  it("stops on HTML pages with a clear error", () => {
    const result = preprocessSubscriptionContent("<!doctype html><html><head></head><body>blocked</body></html>");

    expect(result.content).toBe("");
    expect(result.applied).toEqual([]);
    expect(result.errors[0]).toContain("检测到 HTML 页面内容");

    const htmlByTags = preprocessSubscriptionContent("<html><head></head><body>blocked</body></html>");
    expect(htmlByTags.content).toBe("");
    expect(htmlByTags.errors[0]).toContain("检测到 HTML 页面内容");

    const encodedHtml = preprocessSubscriptionContent(encodeBase64("<html><head></head><body>blocked</body></html>"));
    expect(encodedHtml.content).toBe("");
    expect(encodedHtml.applied).toEqual(["base64"]);
    expect(encodedHtml.errors[0]).toContain("检测到 HTML 页面内容");
  });

  it("converts SSD subscription JSON into SS links", () => {
    const result = preprocessSubscriptionContent(
      ssdContent({
        airport: "Airport",
        port: 8388,
        encryption: "aes-128-gcm",
        password: "secret",
        servers: {
          a: {
            server: "ssd.example.com",
            remarks: "Node A",
            plugin: "obfs-local",
            plugin_options: "obfs=http;obfs-host=cdn.example.com",
          },
        },
      })
    );

    expect(result.applied).toEqual(["ssd"]);
    expect(result.errors).toEqual([]);
    expect(result.content).toContain("ss://");
    expect(result.content).toContain("ssd.example.com:8388");
    expect(result.content).toContain("plugin=");

    const arrayResult = preprocessSubscriptionContent(
      ssdContent({
        airport: "Airport",
        port: 8388,
        encryption: "aes-128-gcm",
        password: "secret",
        servers: [
          null,
          {
            server: "array.example.com",
            remarks: "Array%20Node",
            plugin: "simple-obfs",
          },
          {
            server: "",
          },
        ],
      })
    );
    expect(arrayResult.applied).toEqual(["ssd"]);
    expect(arrayResult.content).toContain("array.example.com:8388");
    expect(arrayResult.content).toContain("Array%20Node");
    expect(arrayResult.content).toContain("plugin=simple-obfs");

    const perServerDefaults = preprocessSubscriptionContent(
      ssdContent({
        servers: [
          {
            server: "per-server.example.com",
            port: 443,
            encryption: "chacha20-ietf-poly1305",
            password: "per-secret",
          },
          {
            server: "bad-port.example.com",
            port: 70000,
            encryption: "aes-128-gcm",
            password: "secret",
          },
        ],
      })
    );
    expect(perServerDefaults.applied).toEqual(["ssd"]);
    expect(perServerDefaults.content).toContain("per-server.example.com:443");
    expect(perServerDefaults.content).toContain("SSD-1");
    expect(perServerDefaults.content).not.toContain("bad-port.example.com");
  });

  it("reports invalid SSD subscriptions without passing bad content through", () => {
    const result = preprocessSubscriptionContent(ssdContent({ servers: [] }));

    expect(result.content).toBe("");
    expect(result.applied).toEqual([]);
    expect(result.errors[0]).toContain("SSD 订阅预处理失败");

    const invalidJson = preprocessSubscriptionContent(`ssd://${encodeBase64("{bad json")}`);
    expect(invalidJson.content).toBe("");
    expect(invalidJson.errors[0]).toContain("SSD 订阅预处理失败");
  });

  it("converts Netch JSON and extracts supported full-config sections", () => {
    const netch = preprocessSubscriptionContent(
      JSON.stringify({
        ModeFileNameType: 1,
        Server: [
          {
            Type: "SS",
            Hostname: "netch.example.com",
            Port: 8388,
          },
        ],
      })
    );
    const fullConfig = preprocessSubscriptionContent(`
[General]
skip = true

[Proxy]
SS = ss, ss.example.com, 8388, encrypt-method=aes-128-gcm, password=secret

[WireGuard main]
WG = wireguard, wg.example.com, 51820
`);

    expect(netch.applied).toEqual(["netch-json"]);
    expect(netch.content).toContain("netch://");
    expect(fullConfig.applied).toEqual(["full-config"]);
    expect(fullConfig.content).toContain("[Proxy]");
    expect(fullConfig.content).toContain("[WireGuard main]");
    expect(fullConfig.content).not.toContain("[General]");

    const netchWithStringServer = preprocessSubscriptionContent(
      JSON.stringify({
        Server: [
          JSON.stringify({
            Type: "VMess",
            Hostname: "vmess.example.com",
            Port: 443,
          }),
          "bad-json",
          123,
        ],
      })
    );
    expect(netchWithStringServer.applied).toEqual(["netch-json"]);
    expect(netchWithStringServer.content).toContain("netch://");

    const badNetch = preprocessSubscriptionContent(JSON.stringify({ ModeFileNameType: 1, Server: [] }));
    expect(badNetch.content).toBe("");
    expect(badNetch.errors[0]).toContain("Netch 配置中未找到可转换的服务器条目");

    const missingServerList = preprocessSubscriptionContent(JSON.stringify({ ModeFileNameType: 1, ServerCount: 1 }));
    expect(missingServerList.content).toBe("");
    expect(missingServerList.errors[0]).toContain("Netch 配置缺少 Server 列表");

    const serverCountOnly = preprocessSubscriptionContent(JSON.stringify({ ServerCount: 1 }));
    expect(serverCountOnly.content).toBe('{"ServerCount":1}');
    expect(serverCountOnly.errors).toEqual([]);

    const invalidNetchJson = preprocessSubscriptionContent('{"ModeFileNameType":1,"Server":[');
    expect(invalidNetchJson.content).toBe("");
    expect(invalidNetchJson.errors[0]).toContain("Unexpected end of JSON input");

    const noConvertedNetch = preprocessSubscriptionContent(
      JSON.stringify({
        Server: ["bad-json", 123, null],
      })
    );
    expect(noConvertedNetch.content).toBe("");
    expect(noConvertedNetch.errors[0]).toContain("Netch 配置中未找到可转换的服务器条目");

    const noProxySection = preprocessSubscriptionContent("[General]\nskip=true");
    expect(noProxySection.content).toBe("[General]\nskip=true");
    expect(noProxySection.errors).toEqual([]);

    const unsupportedProxySection = preprocessSubscriptionContent("[Proxy Extra]\nNode = ss, example.com, 8388");
    expect(unsupportedProxySection.content).toBe("");
    expect(unsupportedProxySection.errors[0]).toContain("未找到可提取的代理配置段");
  });
});
