// src/utils/dataurl.ts
export function dataUrlToFile(dataUrl: string, filename: string): File {
  const [meta, b64] = dataUrl.split(',');
  const mimeMatch = /^data:(.*?);base64$/.exec(meta || '');
  const mime = mimeMatch?.[1] || 'application/octet-stream';
  const binStr = atob(b64 || '');
  const len = binStr.length;
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) arr[i] = binStr.charCodeAt(i);
  return new File([arr], filename, { type: mime });
}
