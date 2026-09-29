export const SortDirection = { ASCENDING: 'ASCENDING', DESCENDING: 'DESCENDING' } as const;
export type SortDirection = (typeof SortDirection)[keyof typeof SortDirection];

export const TypeFilter = { ALL_FILES: 'ALL_FILES', ONLY_CPP: 'ONLY_CPP', ONLY_PNG: 'ONLY_PNG' } as const;
export type TypeFilter = (typeof TypeFilter)[keyof typeof TypeFilter];

export const PreviewKind = { TEXT: 'TEXT', IMAGE: 'IMAGE', NONE: 'NONE' } as const;
export type PreviewKind = (typeof PreviewKind)[keyof typeof PreviewKind];

export const SyncStatus = {
  IN_SYNC: 'IN_SYNC',
  LOCAL_ONLY: 'LOCAL_ONLY',
  REMOTE_ONLY: 'REMOTE_ONLY',
  LOCAL_NEWER: 'LOCAL_NEWER',
  REMOTE_NEWER: 'REMOTE_NEWER',
  CONFLICT: 'CONFLICT',
} as const;
export type SyncStatus = (typeof SyncStatus)[keyof typeof SyncStatus];

export const Side = { LOCAL: 'LOCAL', REMOTE: 'REMOTE' } as const;
export type Side = (typeof Side)[keyof typeof Side];

export type UserDto = { id: string; email: string; displayName: string };
export type AuthResponseDto = { accessToken: string; user: UserDto };
export type RegisterDto = { email: string; password: string; displayName: string };
export type LoginDto = { email: string; password: string };
export type WorkspaceDto = { id: string; owner: UserDto; fileCount: number };

/** Metadata of one file in a workspace, as returned by the REST API. Dates are ISO strings. */
export type FileEntryDto = {
  id: string;
  name: string;
  extension: string;
  size: number;
  checksum: string;
  createdAt: string;
  modifiedAt: string;
  /** Display name of the user who created the entry. */
  uploadedBy: string;
  /** Display name of the user who uploaded the latest version. */
  editedBy: string;
};

/** A file in the bound local folder. `modifiedAt` is epoch milliseconds. */
export type LocalFile = { name: string; path: string; size: number; modifiedAt: number };
