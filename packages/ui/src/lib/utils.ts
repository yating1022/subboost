import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { safeParseJsonObject } from "@subboost/core/json";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export async function readApiErrorMessage(res: Response, fallback: string): Promise<string> {
  const text = await res.text().catch(() => "");
  if (text) {
    const data = safeParseJsonObject(text);
    if (typeof data?.error === "string") {
      const msg = data.error.trim();
      if (msg) return msg;
    }
  }
  return `${fallback} (HTTP ${res.status})`;
}
