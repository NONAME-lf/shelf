/**
 * Saves downloaded bytes under the file's name. The API wants `Authorization: Bearer`, which a plain
 * <a href> cannot send, so the page fetches the bytes with the token and saves them through a temporary
 * object URL and <a download>.
 */
export function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  // the download has taken the data over by then
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
