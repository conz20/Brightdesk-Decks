'use strict';

function isLocalFileUrl(value) {
  return typeof value === 'string' && value.toLowerCase().startsWith('file:');
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
  mayRequestMicrophoneAccess,
  mayCheckMicrophoneAccess
};
