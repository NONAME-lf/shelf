import { messageOf } from '@shelf/ui';

/** "Error invoking remote method 'sync:scan': Error: Спочатку…" → "Спочатку…" */
export function cleanIpcError(error: unknown): string {
  return messageOf(error).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
}
