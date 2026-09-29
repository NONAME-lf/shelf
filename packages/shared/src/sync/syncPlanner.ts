import { Side, SyncStatus, type FileEntryDto, type LocalFile } from '../types';
import { isSyncableName } from './fileNames';
import type { SnapshotEntry, SyncSnapshot } from './snapshot';

export const TIME_TOLERANCE_MS = 2000;

/** One line of the synchronization plan — one file name. */
export type SyncItem = {
  name: string;
  local?: LocalFile;
  remote?: FileEntryDto;
  status: SyncStatus;
  /** The user's choice for a CONFLICT; absent means "the newer version wins". */
  resolution?: Side;
};

export type StatusInput = {
  local?: LocalFile;
  remote?: FileEntryDto;
  snapshot?: SnapshotEntry;
  /** SHA-256 of the local file; required only when both sides exist and there is no snapshot entry. */
  localChecksum?: string;
};

export function needsChecksum(input: StatusInput): boolean {
  return Boolean(input.local && input.remote && !input.snapshot);
}

const differs = (a: number, b: number) => Math.abs(a - b) > TIME_TOLERANCE_MS;

/** Spec §5.2: compares both sides with the snapshot taken after the last synchronization. */
export function computeStatus(input: StatusInput): SyncStatus {
  const { local, remote, snapshot } = input;
  if (local && !remote) return SyncStatus.LOCAL_ONLY;
  if (!local && remote) return SyncStatus.REMOTE_ONLY;
  if (!local || !remote) throw new Error('computeStatus: немає ні локального, ні віддаленого файлу');

  if (!snapshot) {
    if (input.localChecksum === undefined) {
      throw new Error(`computeStatus: для «${local.name}» потрібна контрольна сума — знімка немає`);
    }
    return input.localChecksum === remote.checksum ? SyncStatus.IN_SYNC : SyncStatus.CONFLICT;
  }

  const localChanged = differs(local.modifiedAt, snapshot.localModifiedAt) || local.size !== snapshot.localSize;
  const remoteChanged = differs(Date.parse(remote.modifiedAt), Date.parse(snapshot.remoteModifiedAt));
  if (localChanged && remoteChanged) return SyncStatus.CONFLICT;
  if (localChanged) return SyncStatus.LOCAL_NEWER;
  if (remoteChanged) return SyncStatus.REMOTE_NEWER;
  return SyncStatus.IN_SYNC;
}

/** The side a status transfers from; for a CONFLICT — the newer version (spec §5.3). */
export function defaultSide(item: SyncItem): Side | null {
  switch (item.status) {
    case SyncStatus.LOCAL_ONLY:
    case SyncStatus.LOCAL_NEWER:
      return Side.LOCAL;
    case SyncStatus.REMOTE_ONLY:
    case SyncStatus.REMOTE_NEWER:
      return Side.REMOTE;
    case SyncStatus.CONFLICT: {
      const localTime = item.local?.modifiedAt ?? 0;
      const remoteTime = item.remote ? Date.parse(item.remote.modifiedAt) : 0;
      return localTime > remoteTime ? Side.LOCAL : Side.REMOTE;
    }
    default:
      return null;
  }
}

/** LOCAL → upload, REMOTE → download, null → nothing to transfer. */
export function decideDirection(item: SyncItem): Side | null {
  if (item.status === SyncStatus.CONFLICT && item.resolution) return item.resolution;
  return defaultSide(item);
}

export function buildItems(
  local: readonly LocalFile[],
  remote: readonly FileEntryDto[],
  snapshot: SyncSnapshot,
  checksums: Record<string, string>,
): SyncItem[] {
  const localByName = new Map(local.filter((file) => isSyncableName(file.name)).map((file) => [file.name, file]));
  const remoteByName = new Map(remote.filter((file) => isSyncableName(file.name)).map((file) => [file.name, file]));
  const allNames = [...new Set([...localByName.keys(), ...remoteByName.keys()])].sort();

  return allNames.map((name) => {
    const item: SyncItem = { name, local: localByName.get(name), remote: remoteByName.get(name), status: SyncStatus.IN_SYNC };
    item.status = computeStatus({
      local: item.local,
      remote: item.remote,
      snapshot: snapshot.entries[name],
      localChecksum: checksums[name],
    });
    return item;
  });
}
