export async function sha256(value) {
  const bytes=typeof value==='string'?new TextEncoder().encode(value):value instanceof Blob?await value.arrayBuffer():value;
  const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');
}
