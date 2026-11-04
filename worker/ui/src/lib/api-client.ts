import { readApiErrorMessage } from "@subboost/ui/lib/utils";

export type ApiMethod = "GET" | "PUT" | "POST" | "PATCH" | "DELETE";

export type ApiClient = {
  get<T>(path: string): Promise<T>;
  send<T>(method: Exclude<ApiMethod, "GET">, path: string, body?: unknown): Promise<T>;
};

export type ApiClientOptions = {
  getToken: () => string | null;
  onUnauthorized: () => void;
  fetchImpl?: typeof fetch;
};

export function createApiClient(options: ApiClientOptions): ApiClient {
  const fetchImpl = options.fetchImpl ?? fetch;

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {};
    const token = options.getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";

    const response = await fetchImpl(path, {
      method,
      headers,
      cache: "no-store",
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    if (!response.ok) {
      if (response.status === 401) options.onUnauthorized();
      throw new Error(await readApiErrorMessage(response, "请求失败"));
    }

    if (response.status === 204) return undefined as T;
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  return {
    get<T>(path: string) {
      return request<T>("GET", path);
    },
    send<T>(method: Exclude<ApiMethod, "GET">, path: string, body?: unknown) {
      return request<T>(method, path, body);
    },
  };
}
