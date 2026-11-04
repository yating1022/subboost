import { describe, expect, it } from "vitest";
import {
  ADMIN_TOKEN_STORAGE_KEY,
  clearAdminToken,
  readAdminToken,
  writeAdminToken,
} from "./admin-token";

class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }

  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

describe("admin token storage", () => {
  it("uses the documented localStorage key", () => {
    expect(ADMIN_TOKEN_STORAGE_KEY).toBe("subboost-worker-admin-token");
  });

  it("reads, writes and clears the token", () => {
    const storage = new MemoryStorage();
    expect(readAdminToken(storage)).toBeNull();
    writeAdminToken("secret-token", storage);
    expect(storage.getItem(ADMIN_TOKEN_STORAGE_KEY)).toBe("secret-token");
    expect(readAdminToken(storage)).toBe("secret-token");
    clearAdminToken(storage);
    expect(readAdminToken(storage)).toBeNull();
  });

  it("treats blank values as absent", () => {
    const storage = new MemoryStorage();
    storage.setItem(ADMIN_TOKEN_STORAGE_KEY, "   ");
    expect(readAdminToken(storage)).toBeNull();
  });
});
