import { describe, expect, it } from "vitest";
import { parseUrlWithNeutralScheme, safeDecodeFormUrlEncoded, safeDecodeURIComponent } from "./url-decode";

describe("URL decode helpers", () => {
  it("splits neutral URLs without decoding the authority fields", () => {
    const url = parseUrlWithNeutralScheme(
      "hysteria2://user:p%40ss@[2001:db8::1]:443/path/to?remarks=Node+One&empty=#Hash"
    );

    expect(url).toMatchObject({
      protocol: "hysteria2:",
      username: "user",
      password: "p%40ss",
      hostname: "2001:db8::1",
      port: "443",
      pathname: "/path/to",
      search: "?remarks=Node+One&empty=",
      hash: "#Hash",
    });
    expect(url.searchParams.get("remarks")).toBe("Node One");
    expect(url.searchParams.get("empty")).toBe("");
  });

  it("accepts URLs without path/query/hash and rejects malformed authority", () => {
    expect(parseUrlWithNeutralScheme("ssh://user@ssh.example.com")).toMatchObject({
      protocol: "ssh:",
      username: "user",
      password: "",
      hostname: "ssh.example.com",
      port: "",
      pathname: "",
      search: "",
      hash: "",
    });

    expect(() => parseUrlWithNeutralScheme("missing-scheme")).toThrow("Invalid URL");
    expect(() => parseUrlWithNeutralScheme("ssh://[2001:db8::1")).toThrow("Invalid URL");
    expect(() => parseUrlWithNeutralScheme("ssh://[2001:db8::1]extra")).toThrow("Invalid URL");
  });

  it("decodes form-style names and preserves malformed escape sequences", () => {
    expect(safeDecodeURIComponent("Node%20One")).toBe("Node One");
    expect(safeDecodeURIComponent("bad%")).toBe("bad%");
    expect(safeDecodeFormUrlEncoded("Node+One%20Two")).toBe("Node One Two");
    expect(safeDecodeFormUrlEncoded("bad%")).toBe("bad%");
    expect(safeDecodeFormUrlEncoded("")).toBe("");
  });
});
