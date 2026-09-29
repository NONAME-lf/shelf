import type { AuthResponseDto, FileEntryDto, LoginDto, RegisterDto, UserDto, WorkspaceDto } from './types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** "http://host:4000/" → "http://host:4000/api"; an address that already ends with /api is kept. */
export function normalizeBaseUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}

export type FileApiClientOptions = {
  baseUrl: string;
  token?: string | null;
  fetch?: typeof fetch;
  onUnauthorized?: () => void;
};

export type UploadResult = { entry: FileEntryDto; created: boolean };

export class FileApiClient {
  readonly baseUrl: string;
  token: string | null;
  private readonly fetchFn: typeof fetch;
  private readonly onUnauthorized?: () => void;

  constructor(options: FileApiClientOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.token = options.token ?? null;
    this.fetchFn = options.fetch ?? (((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init)) as typeof fetch);
    this.onUnauthorized = options.onUnauthorized;
  }

  register(dto: RegisterDto): Promise<AuthResponseDto> {
    return this.json('POST', '/auth/register', dto);
  }

  login(dto: LoginDto): Promise<AuthResponseDto> {
    return this.json('POST', '/auth/login', dto);
  }

  me(): Promise<UserDto> {
    return this.json('GET', '/auth/me');
  }

  workspace(): Promise<WorkspaceDto> {
    return this.json('GET', '/workspace');
  }

  listFiles(): Promise<FileEntryDto[]> {
    return this.json('GET', '/workspace/files');
  }

  getFile(id: string): Promise<FileEntryDto> {
    return this.json('GET', `/workspace/files/${encodeURIComponent(id)}`);
  }

  async upload(name: string, data: Blob | Uint8Array): Promise<UploadResult> {
    const blob = data instanceof Blob ? data : new Blob([new Uint8Array(data)]);
    const form = new FormData();
    form.append('file', blob, name);
    const response = await this.request('POST', '/workspace/files', form);
    return { entry: (await response.json()) as FileEntryDto, created: response.status === 201 };
  }

  async download(id: string): Promise<Blob> {
    const response = await this.request('GET', `/workspace/files/${encodeURIComponent(id)}/content`);
    return response.blob();
  }

  async remove(id: string): Promise<void> {
    await this.request('DELETE', `/workspace/files/${encodeURIComponent(id)}`);
  }

  private async json<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response =
      body === undefined
        ? await this.request(method, path)
        : await this.request(method, path, JSON.stringify(body), 'application/json');
    return (await response.json()) as T;
  }

  private async request(method: string, path: string, body?: BodyInit, contentType?: string): Promise<Response> {
    const headers: Record<string, string> = {};
    if (contentType) headers['Content-Type'] = contentType;
    if (this.token) headers.Authorization = `Bearer ${this.token}`;

    let response: Response;
    try {
      response = await this.fetchFn(`${this.baseUrl}${path}`, { method, headers, body });
    } catch (error) {
      throw new ApiError(0, `Сервер недоступний: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (response.ok) return response;
    if (response.status === 401 && this.token) this.onUnauthorized?.();
    throw new ApiError(response.status, await errorMessage(response));
  }
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string | string[] };
    if (Array.isArray(body.message)) return body.message.join('; ');
    if (body.message) return body.message;
  } catch {
    // The body is not JSON; fall back to the status code.
  }
  return `HTTP ${response.status}`;
}
