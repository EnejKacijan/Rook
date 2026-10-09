import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { rookPlatform } from './platform.js';

function base64Bytes(bytes) {
  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)));
  return btoa(chunks.join(''));
}

// Returns null on web so existing Web Share/download behavior stays authoritative.
// Native files are temporary share copies, never canonical training storage.
export async function presentNativeFile(file, { title = 'ROOK file', platform = rookPlatform,
  filesystem = Filesystem, share = Share, now = Date.now } = {}) {
  if (!platform.isIOSNative) return null;
  if (!platform.hasPlugin('Filesystem') || !platform.hasPlugin('Share'))
    throw new Error('iOS file sharing is unavailable. Your ROOK data is unchanged.');
  const safeName = String(file.name || 'rook-export').replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `rook-share/${now()}-${safeName}`;
  const data = base64Bytes(new Uint8Array(await file.arrayBuffer()));
  await filesystem.mkdir({ path: 'rook-share', directory: Directory.Cache, recursive: true });
  await filesystem.writeFile({ path, directory: Directory.Cache, data });
  try {
    const { uri } = await filesystem.getUri({ path, directory: Directory.Cache });
    await share.share({ title, url: uri, dialogTitle: title });
    return 'shared';
  } catch (error) {
    if (String(error?.message || '').toLowerCase().includes('cancel')) return 'cancelled';
    throw error;
  } finally {
    try { await filesystem.deleteFile({ path, directory: Directory.Cache }); }
    catch { /* Cache is noncanonical; iOS may retain a share copy temporarily. */ }
  }
}
