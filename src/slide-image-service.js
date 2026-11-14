'use strict';

const MAX_SLIDE_IMAGE_BYTES = 5 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function detectSlideImageMimeType(value) {
  if (!Buffer.isBuffer(value) || value.length < 3) return null;
  if (value.length >= PNG_SIGNATURE.length && value.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    return 'image/png';
  }
  if (value[0] === 0xff && value[1] === 0xd8 && value[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    value.length >= 12 &&
    value.toString('ascii', 0, 4) === 'RIFF' &&
    value.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}


function readSlideImageDimensions(buffer, mimeType = detectSlideImageMimeType(buffer)) {
  if (!Buffer.isBuffer(buffer) || !mimeType || detectSlideImageMimeType(buffer) !== mimeType) return null;

  if (mimeType === 'image/png') {
    if (buffer.length < 24) return null;
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return width > 0 && height > 0 ? { width, height } : null;
  }

  if (mimeType === 'image/jpeg') {
    let offset = 2;
    const frameMarkers = new Set([
      0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
      0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf
    ]);
    while (offset + 4 <= buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset++;
        continue;
      }
      while (offset < buffer.length && buffer[offset] === 0xff) offset++;
      if (offset >= buffer.length) break;
      const marker = buffer[offset++];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (marker === 0xd9 || marker === 0xda) break;
      if (offset + 2 > buffer.length) break;
      const segmentLength = buffer.readUInt16BE(offset);
      if (segmentLength < 2 || offset + segmentLength > buffer.length) break;
      if (frameMarkers.has(marker)) {
        if (segmentLength < 7) return null;
        const height = buffer.readUInt16BE(offset + 3);
        const width = buffer.readUInt16BE(offset + 5);
        return width > 0 && height > 0 ? { width, height } : null;
      }
      offset += segmentLength;
    }
    return null;
  }

  if (mimeType === 'image/webp') {
    if (buffer.length < 21) return null;
    const chunkType = buffer.toString('ascii', 12, 16);
    if (chunkType === 'VP8X' && buffer.length >= 30) {
      const width = 1 + buffer.readUIntLE(24, 3);
      const height = 1 + buffer.readUIntLE(27, 3);
      return { width, height };
    }
    if (chunkType === 'VP8L' && buffer.length >= 25 && buffer[20] === 0x2f) {
      const b1 = buffer[21];
      const b2 = buffer[22];
      const b3 = buffer[23];
      const b4 = buffer[24];
      const width = 1 + (((b2 & 0x3f) << 8) | b1);
      const height = 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6));
      return { width, height };
    }
    if (chunkType === 'VP8 ' && buffer.length >= 30) {
      const frameStart = buffer.indexOf(Buffer.from([0x9d, 0x01, 0x2a]), 20);
      if (frameStart >= 0 && frameStart + 7 <= buffer.length) {
        const width = buffer.readUInt16LE(frameStart + 3) & 0x3fff;
        const height = buffer.readUInt16LE(frameStart + 5) & 0x3fff;
        return width > 0 && height > 0 ? { width, height } : null;
      }
    }
  }
  return null;
}

function inspectSlideImageDataUrl(value) {
  if (typeof value !== 'string' || value.length > 7 * 1024 * 1024) return null;
  const match = value.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match || match[2].length % 4 !== 0) return null;

  const buffer = Buffer.from(match[2], 'base64');
  if (
    buffer.length === 0 ||
    buffer.length > MAX_SLIDE_IMAGE_BYTES ||
    buffer.toString('base64') !== match[2]
  ) return null;

  const mimeType = detectSlideImageMimeType(buffer);
  if (mimeType !== match[1]) return null;
  const dimensions = readSlideImageDimensions(buffer, mimeType);
  if (!dimensions) return null;
  return { buffer, mimeType, byteLength: buffer.length, ...dimensions };
}

function createSlideImageDataUrl(buffer) {
  const mimeType = detectSlideImageMimeType(buffer);
  if (!mimeType || buffer.length > MAX_SLIDE_IMAGE_BYTES) {
    throw new TypeError('Choose a PNG, JPEG or WebP picture no larger than 5 MB.');
  }
  return 'data:' + mimeType + ';base64,' + buffer.toString('base64');
}

module.exports = {
  MAX_SLIDE_IMAGE_BYTES,
  detectSlideImageMimeType,
  readSlideImageDimensions,
  inspectSlideImageDataUrl,
  createSlideImageDataUrl
};
