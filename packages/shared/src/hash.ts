/** SHA-256 of the bytes as lowercase hex — the same format the server stores in FileEntry.checksum. */
export async function sha256Hex(data: Uint8Array | ArrayBuffer): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new Uint8Array(data));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
