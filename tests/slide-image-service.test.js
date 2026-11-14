'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MAX_SLIDE_IMAGE_BYTES,
  detectSlideImageMimeType,
  readSlideImageDimensions,
  inspectSlideImageDataUrl
} = require('../src/slide-image-service');

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==',
  'base64'
);

test('Brightdesk recognises PNG, JPEG and WebP from their file signatures', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  const webp = Buffer.from('RIFF0000WEBPVP8 ', 'ascii');
  assert.equal(detectSlideImageMimeType(onePixelPng), 'image/png');
  assert.equal(detectSlideImageMimeType(jpeg), 'image/jpeg');
  assert.equal(detectSlideImageMimeType(webp), 'image/webp');
  assert.equal(detectSlideImageMimeType(Buffer.from('<svg/>')), null);
});

test('Brightdesk validates embedded image data against its real MIME type and size', () => {
  const dataUrl = 'data:image/png;base64,' + onePixelPng.toString('base64');
  const inspected = inspectSlideImageDataUrl(dataUrl);
  assert.equal(inspected.mimeType, 'image/png');
  assert.equal(inspected.byteLength, onePixelPng.length);
  assert.deepEqual(inspected.buffer, onePixelPng);

  assert.equal(inspectSlideImageDataUrl('https://example.com/photo.png'), null);
  assert.equal(inspectSlideImageDataUrl('data:image/svg+xml;base64,PHN2Zy8+'), null);
  assert.equal(inspectSlideImageDataUrl('data:image/jpeg;base64,' + onePixelPng.toString('base64')), null);
  assert.equal(inspectSlideImageDataUrl('data:image/png;base64,AAAA'), null);
  assert.equal(inspectSlideImageDataUrl('data:image/png;base64,' + Buffer.alloc(MAX_SLIDE_IMAGE_BYTES + 1, 0).toString('base64')), null);
});

test('Brightdesk does not mistake incomplete or malformed image headers for supported images', () => {
  assert.equal(detectSlideImageMimeType(Buffer.from([0x89, 0x50, 0x4e, 0x47])), null);
  assert.equal(detectSlideImageMimeType(Buffer.from('RIFF0000WEBP')), null);
  assert.equal(inspectSlideImageDataUrl('data:image/png;base64,not-base64!'), null);
});

test('Brightdesk reads image dimensions from supported file headers before decoding', () => {
  const jpeg = Buffer.from([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08,
    0x00, 0x01, 0x00, 0x01,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00
  ]);
  const webp = Buffer.from([
    ...Buffer.from('RIFF', 'ascii'), 0, 0, 0, 0,
    ...Buffer.from('WEBPVP8X', 'ascii'), 10, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0
  ]);

  assert.deepEqual(readSlideImageDimensions(onePixelPng), { width: 1, height: 1 });
  assert.deepEqual(readSlideImageDimensions(jpeg), { width: 1, height: 1 });
  assert.deepEqual(readSlideImageDimensions(webp), { width: 1, height: 1 });
  assert.equal(readSlideImageDimensions(Buffer.from([0xff, 0xd8, 0xff])), null);
  assert.equal(readSlideImageDimensions(Buffer.from('not an image')), null);
});

test('Brightdesk rejects image data when its header has no readable pixel dimensions', () => {
  const incompletePng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const dataUrl = 'data:image/png;base64,' + incompletePng.toString('base64');
  assert.equal(inspectSlideImageDataUrl(dataUrl), null);
});

