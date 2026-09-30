export type AccessMode = 'read' | 'readwrite';
type PermissionDescriptor = { mode: AccessMode };

/** Chromium's permission methods of a handle; TypeScript's lib.dom does not declare them yet. */
type HandleWithPermissions = FileSystemHandle & {
  queryPermission?: (descriptor: PermissionDescriptor) => Promise<PermissionState>;
  requestPermission?: (descriptor: PermissionDescriptor) => Promise<PermissionState>;
};

export type DirectoryPicker = (options?: { id?: string; mode?: AccessMode }) => Promise<FileSystemDirectoryHandle>;

/**
 * `window.showDirectoryPicker`, or null where the File System Access API is missing: Firefox, Safari, and
 * any page that is not a secure context (plain http on an address other than localhost).
 */
export function directoryPicker(scope: object = globalThis): DirectoryPicker | null {
  const picker = (scope as { showDirectoryPicker?: unknown }).showDirectoryPicker;
  return typeof picker === 'function' ? (options) => (picker as DirectoryPicker).call(scope, options) : null;
}

/**
 * true when the page may read and write the folder. After a reload Chrome answers 'prompt' until the user
 * allows access again; `ask` shows that prompt, which needs a click — only manual actions ask.
 */
export async function hasFolderPermission(handle: FileSystemHandle, ask: boolean): Promise<boolean> {
  const permissions = handle as HandleWithPermissions;
  const descriptor: PermissionDescriptor = { mode: 'readwrite' };
  if (!permissions.queryPermission) return true;
  if ((await permissions.queryPermission(descriptor)) === 'granted') return true;
  if (!ask || !permissions.requestPermission) return false;
  return (await permissions.requestPermission(descriptor)) === 'granted';
}
