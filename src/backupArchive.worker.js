import { decodeBoundedZip } from './boundedZip.js';

self.onmessage = ({ data }) => {
  try {
    const entries = decodeBoundedZip(data.bytes, data.limits);
    self.postMessage({ entries }, Object.values(entries).map(bytes => bytes.buffer));
  } catch (error) {
    self.postMessage({ error: { code: error.code || 'wrong-file-type', message: error.message || 'Invalid archive.' } });
  }
};
