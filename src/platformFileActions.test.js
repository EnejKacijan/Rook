import { expect, it, vi } from 'vitest';
import { presentNativeFile } from './platformFileActions.js';

const file = { name: 'rook backup.zip', arrayBuffer: async () => Uint8Array.from([0, 1, 254, 255]).buffer };
const native = { isIOSNative: true, hasPlugin: () => true };

it('leaves web/PWA file handling untouched', async () => {
  const filesystem = { writeFile: vi.fn() };
  expect(await presentNativeFile(file, { platform: { isIOSNative: false }, filesystem })).toBe(null);
  expect(filesystem.writeFile).not.toHaveBeenCalled();
});

it('shares a temporary iOS cache copy without changing canonical storage', async () => {
  const filesystem = {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    getUri: vi.fn().mockResolvedValue({ uri: 'file:///rook-share/1-rook_backup.zip' }),
    deleteFile: vi.fn().mockResolvedValue(undefined),
  };
  const share = { share: vi.fn().mockResolvedValue(undefined) };
  expect(await presentNativeFile(file, { platform: native, filesystem, share, now: () => 1 })).toBe('shared');
  expect(filesystem.writeFile).toHaveBeenCalledWith(expect.objectContaining({
    path: 'rook-share/1-rook_backup.zip', data: 'AAH+/w==',
  }));
  expect(share.share).toHaveBeenCalledWith(expect.objectContaining({ url: 'file:///rook-share/1-rook_backup.zip' }));
  expect(filesystem.deleteFile).toHaveBeenCalledOnce();
});

it('fails closed without native plugins and cleans a cancelled share', async () => {
  await expect(presentNativeFile(file, { platform: { isIOSNative: true, hasPlugin: () => false } }))
    .rejects.toThrow('iOS file sharing is unavailable');
  const filesystem = {
    mkdir: vi.fn().mockResolvedValue(undefined), writeFile: vi.fn().mockResolvedValue(undefined),
    getUri: vi.fn().mockResolvedValue({ uri: 'file:///temporary' }), deleteFile: vi.fn().mockResolvedValue(undefined),
  };
  const share = { share: vi.fn().mockRejectedValue(new Error('User cancelled')) };
  expect(await presentNativeFile(file, { platform: native, filesystem, share, now: () => 2 })).toBe('cancelled');
  expect(filesystem.deleteFile).toHaveBeenCalledOnce();
});
