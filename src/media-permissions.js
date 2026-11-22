'use strict';

function isLocalFileUrl(value) {
  if (typeof value !== 'string') return false;
  if (value.toLowerCase() === 'file://') return true;

  // WHATWG URL parsing normalises "file:relative/path" into an absolute
  // file URL. Require the explicit absolute form before parsing so a
  // relative or UNC-style origin cannot be mistaken for a local file.
  if (!/^file:\/\/\/(?!\/)/i.test(value)) return false;

  try {
    const url = new URL(value);
    return url.protocol === 'file:' && url.hostname === '';
  } catch {
    return false;
  }
}

function mayRequestMicrophoneAccess({
  isMainWindow,
  permission,
  mediaTypes,
  isMainFrame,
  requestingUrl
} = {}) {
  return isMainWindow === true &&
    permission === 'media' &&
    isMainFrame === true &&
    Array.isArray(mediaTypes) &&
    mediaTypes.length === 1 &&
    mediaTypes[0] === 'audio' &&
    isLocalFileUrl(requestingUrl);
}

function mayCheckMicrophoneAccess({
  isMainWindow,
  permission,
  mediaType,
  isMainFrame,
  requestingOrigin
} = {}) {
  return isMainWindow === true &&
    permission === 'media' &&
    mediaType === 'audio' &&
    isMainFrame === true &&
    isLocalFileUrl(requestingOrigin);
}

module.exports = {
  isLocalFileUrl,
  mayRequestMicrophoneAccess,
  mayCheckMicrophoneAccess
};
