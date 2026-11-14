'use strict';

const MAX_SLIDE_IMAGE_BYTES = 5 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function detectSlideImageMimeType(value) {
  if (!Buffer.isBuffer(value) || value.length < 12) return null;
  if (value.length >= PNG_SIGNATURE.length && value.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    return 'image/png';
  }
  if (value[0] === 0xff && value[1] === 0xd8 && value[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    value.toString('ascii', 0, 4) === 'RIFF' &&
    value.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

function inspectSlideImageDataUrl(value) {
  if (typeof value !== 'string' || value.length > 7 * 1024 * 1024) return null;
  const match = value.match(/^data:(image\\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match || match[2].length % 4 !== 0) return null;

  const buffer = Buffer.from(match[2], 'base64');
  if (
    buffer.length === 0 ||
    buffer.length > MAX_SLIDE_IMAGE_BYTES ||
    buffer.toString('base64') !== match[2]
  ) return null;

  const mimeType = detectSlideImageMimeType(buffer);
  if (mimeType !== match[1]) return null;
  return { buffer, mimeType, byteLength: buffer.length };
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
  inspectSlideImageDataUrl,
  createSlideImageDataUrl
};
