import { normalizeBaseUrl } from './fileApiClient';

/**
 * An account is a user on a server: "<user id>@http://localhost:4000/api". Clients keep the bound
 * folder and automatic tracking per account, so the next user who signs in never inherits them.
 */
export function accountKey(serverUrl: string, userId: string): string {
  return `${userId}@${normalizeBaseUrl(serverUrl)}`;
}
