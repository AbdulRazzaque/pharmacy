/**
 * Save a Blob as a file download (replacement for file-saver to avoid build issues).
 * @param {Blob} blob
 * @param {string} filename
 */
export function saveAs(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'download';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
