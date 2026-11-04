export const ADMIN_TOKEN_STORAGE_KEY = "subboost-worker-admin-token";

function resolveStorage(storage?: Storage): Storage | null {
  if (storage) return storage;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readAdminToken(storage?: Storage): string | null {
  const target = resolveStorage(storage);
  if (!target) return null;
  try {
    const value = target.getItem(ADMIN_TOKEN_STORAGE_KEY);
    return value && value.trim() ? value : null;
  } catch {
    return null;
  }
}

export function writeAdminToken(token: string, storage?: Storage): void {
  const target = resolveStorage(storage);
  if (!target) return;
  try {
    target.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
  } catch {
    // 存储不可用时仅本次会话生效
  }
}

export function clearAdminToken(storage?: Storage): void {
  const target = resolveStorage(storage);
  if (!target) return;
  try {
    target.removeItem(ADMIN_TOKEN_STORAGE_KEY);
  } catch {
    // ignore
  }
}
