import { describe, expect, it, vi } from 'vitest';
import { ApiError, FileApiClient, normalizeBaseUrl } from './fileApiClient';
import { fileEntry } from './test/fixtures';

type Call = { url: string; init: RequestInit };

function fakeFetch(respond: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fn = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const call = { url: String(input), init };
    calls.push(call);
    return respond(call);
  }) as typeof fetch;
  return { fn, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const headerOf = (call: Call, name: string) => new Headers(call.init.headers).get(name);

describe('normalizeBaseUrl', () => {
  it.each([
    ['http://localhost:4000', 'http://localhost:4000/api'],
    ['http://localhost:4000/', 'http://localhost:4000/api'],
    ['http://host/api/', 'http://host/api'],
    [' https://shelf-api.onrender.com ', 'https://shelf-api.onrender.com/api'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeBaseUrl(input)).toBe(expected);
  });
});

describe('FileApiClient', () => {
  it('logs in with a JSON body and no Authorization header', async () => {
    const auth = { accessToken: 'jwt', user: { id: 'u1', email: 'a@b.c', displayName: 'Артем' } };
    const { fn, calls } = fakeFetch(() => json(auth));
    const api = new FileApiClient({ baseUrl: 'http://localhost:4000', fetch: fn });
    await expect(api.login({ email: 'a@b.c', password: 'secret123' })).resolves.toEqual(auth);
    expect(calls[0].url).toBe('http://localhost:4000/api/auth/login');
    expect(calls[0].init.method).toBe('POST');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ email: 'a@b.c', password: 'secret123' });
    expect(headerOf(calls[0], 'Authorization')).toBeNull();
  });

  it('sends the bearer token when listing files', async () => {
    const files = [fileEntry('Main.kt')];
    const { fn, calls } = fakeFetch(() => json(files));
    const api = new FileApiClient({ baseUrl: 'http://h', token: 'jwt', fetch: fn });
    await expect(api.listFiles()).resolves.toEqual(files);
    expect(calls[0].url).toBe('http://h/api/workspace/files');
    expect(headerOf(calls[0], 'Authorization')).toBe('Bearer jwt');
  });

  it('uploads a multipart form and reports whether the entry was created', async () => {
    const entry = fileEntry('Main.kt');
    let status = 201;
    const { fn, calls } = fakeFetch(() => json(entry, status));
    const api = new FileApiClient({ baseUrl: 'http://h', token: 'jwt', fetch: fn });

    await expect(api.upload('Main.kt', new TextEncoder().encode('fun main() {}'))).resolves.toEqual({
      entry,
      created: true,
    });
    const form = calls[0].init.body as FormData;
    const part = form.get('file') as File;
    expect(part.name).toBe('Main.kt');
    expect(await part.text()).toBe('fun main() {}');

    status = 200;
    await expect(api.upload('Main.kt', new Blob(['v2']))).resolves.toEqual({ entry, created: false });
  });

  it('downloads file content as a Blob', async () => {
    const { fn, calls } = fakeFetch(() => new Response('bytes'));
    const api = new FileApiClient({ baseUrl: 'http://h', token: 'jwt', fetch: fn });
    const blob = await api.download('id 1');
    expect(await blob.text()).toBe('bytes');
    expect(calls[0].url).toBe('http://h/api/workspace/files/id%201/content');
  });

  it('deletes a file', async () => {
    const { fn, calls } = fakeFetch(() => new Response(null, { status: 204 }));
    const api = new FileApiClient({ baseUrl: 'http://h', token: 'jwt', fetch: fn });
    await expect(api.remove('f1')).resolves.toBeUndefined();
    expect(calls[0].init.method).toBe('DELETE');
  });

  it('turns an error response into ApiError with the server message', async () => {
    const { fn } = fakeFetch(() => json({ message: 'Цей email уже зареєстровано' }, 409));
    const api = new FileApiClient({ baseUrl: 'http://h', fetch: fn });
    await expect(api.register({ email: 'a@b.c', password: 'x', displayName: 'A' })).rejects.toMatchObject({
      status: 409,
      message: 'Цей email уже зареєстровано',
    });
  });

  it('joins validation messages', async () => {
    const { fn } = fakeFetch(() => json({ message: ['email must be an email', 'password too short'] }, 400));
    const api = new FileApiClient({ baseUrl: 'http://h', fetch: fn });
    await expect(api.login({ email: 'x', password: 'y' })).rejects.toThrow('email must be an email; password too short');
  });

  it('calls onUnauthorized when a signed-in request gets 401', async () => {
    const onUnauthorized = vi.fn();
    const { fn } = fakeFetch(() => json({ message: 'Unauthorized' }, 401));
    const api = new FileApiClient({ baseUrl: 'http://h', token: 'expired', fetch: fn, onUnauthorized });
    await expect(api.listFiles()).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('does not call onUnauthorized for a wrong password on the login form', async () => {
    const onUnauthorized = vi.fn();
    const { fn } = fakeFetch(() => json({ message: 'Невірний email або пароль' }, 401));
    const api = new FileApiClient({ baseUrl: 'http://h', fetch: fn, onUnauthorized });
    await expect(api.login({ email: 'a@b.c', password: 'bad' })).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('turns a network failure into ApiError(0)', async () => {
    const { fn } = fakeFetch(() => {
      throw new TypeError('fetch failed');
    });
    const api = new FileApiClient({ baseUrl: 'http://h', token: 'jwt', fetch: fn });
    await expect(api.listFiles()).rejects.toMatchObject({ status: 0, message: "Сервер недоступний — перевірте з'єднання" });
  });
});
