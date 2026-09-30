export const DEFAULT_API_URL = 'http://localhost:4000';

/** An empty or blank value means "the local stack". */
export function apiUrlFrom(value: string | undefined): string {
  return value?.trim() || DEFAULT_API_URL;
}

/**
 * The REST API of this deployment. Next inlines `process.env.NEXT_PUBLIC_API_URL` into the client bundle at
 * build time, so the address is fixed per build (Vercel: a project environment variable).
 */
export const API_URL = apiUrlFrom(process.env.NEXT_PUBLIC_API_URL);
