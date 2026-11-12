'use strict';

const MAX_RECORDING_MS = 3 * 60 * 1000;
const MAX_AUDIO_BYTES = 1_000_000;
const SUPPORTED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/ogg;codecs=opus',
  'audio/webm',
  'audio/ogg'
];

function normalizeMimeType(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function mimeTypeFromDataUrl(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^data:(audio\/(?:webm|ogg)(?:;codecs=opus)?);base64,([a-z0-9+/]*={0,2})$/i);
  if (!match || !match[2] || match[2].length % 4 !== 0) return null;
  return {
    mimeType: normalizeMimeType(match[1]),
    encoded: match[2]
  };
}

function decodedBase64Length(encoded) {
  if (typeof encoded !== 'string' || !encoded || encoded.length % 4 !== 0) return -1;
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
  return (encoded.length / 4) * 3 - padding;
}

function validateNarrationClip(clip) {
  if (!clip || typeof clip !== 'object' || Array.isArray(clip)) {
    throw new Error('The presentation narration data is invalid.');
  }

  const parsed = mimeTypeFromDataUrl(clip.dataUrl);
  if (!parsed) throw new Error('The presentation narration data URL is invalid.');

  const mimeType = normalizeMimeType(clip.mimeType);
  if (!SUPPORTED_MIME_TYPES.includes(mimeType)) {
    throw new Error('The presentation narration uses an unsupported audio format.');
  }
  if (parsed.mimeType !== mimeType) {
    throw new Error('The presentation narration MIME type does not match its audio data.');
  }

  if (!Number.isSafeInteger(clip.durationMs) || clip.durationMs < 1 || clip.durationMs > MAX_RECORDING_MS) {
    throw new Error('The presentation narration duration is outside the supported limit.');
  }

  const sizeBytes = decodedBase64Length(parsed.encoded);
  if (sizeBytes < 1) throw new Error('The presentation narration contains no audio data.');
  if (sizeBytes > MAX_AUDIO_BYTES) {
    throw new Error('The presentation narration exceeds the local recording size limit.');
  }

  return {
    dataUrl: clip.dataUrl,
    mimeType,
    durationMs: clip.durationMs,
    sizeBytes
  };
}

function selectSupportedMimeType(MediaRecorderConstructor) {
  if (!MediaRecorderConstructor || typeof MediaRecorderConstructor.isTypeSupported !== 'function') return '';
  return SUPPORTED_MIME_TYPES.find(type => {
    try { return MediaRecorderConstructor.isTypeSupported(type); }
    catch { return false; }
  }) || '';
}

function blobToDataUrl(blob) {
  if (typeof FileReader === 'undefined') {
    return Promise.reject(new Error('Audio recording could not be read in this environment.'));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The recorded audio could not be read.'));
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('The recorded audio could not be converted to a local project clip.'));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsDataURL(blob);
  });
}

const api = {
  MAX_RECORDING_MS,
  MAX_AUDIO_BYTES,
  SUPPORTED_MIME_TYPES: [...SUPPORTED_MIME_TYPES],
  validateNarrationClip,
  selectSupportedMimeType,
  blobToDataUrl
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.BrightdeskSlidesAudio = api;
