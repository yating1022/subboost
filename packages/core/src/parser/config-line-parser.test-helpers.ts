import { parseNodeLink } from "./index";
import { parseConfigLine } from "./config-line-parser";

function toBase64(value: string): string {
  return Buffer.from(value).toString("base64");
}

export function mustParseConfigLine(line: string) {
  const node = parseConfigLine(line);
  if (!node) throw new Error(`Expected config line to parse: ${line}`);
  return node;
}

export function mustParseNodeLink(link: string) {
  const node = parseNodeLink(link);
  if (!node) throw new Error(`Expected node link to parse: ${link}`);
  return node;
}

export function netchLink(config: Record<string, unknown>): string {
  return `netch://${toBase64(JSON.stringify(config))}`;
}
