'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  MAX_RECORDING_MS,
  MAX_AUDIO_BYTES,
  validateNarrationClip
} = require('../src/slides-audio');
const { validateProject } = require('../src/file-service');

const validClip = () => ({
  dataUrl: 'data:audio/webm;codecs=opus;base64,AAAA',
  mimeType: 'audio/webm;codecs=opus',
  durationMs: 1500
});

test('validates and normalizes a locally recorded narration clip', () => {
  const clip = validateNarrationClip(validClip());
  assert.equal(clip.mimeType, 'audio/webm;codecs=opus');
  assert.equal(clip.durationMs, 1500);
  assert.equal(clip.sizeBytes, 3);
  assert.equal(clip.dataUrl, validClip().dataUrl);
});

test('accepts Ogg Opus recordings', () => {
  const clip = validateNarrationClip({
    dataUrl: 'data:audio/ogg;codecs=opus;base64,AAAA',
    mimeType: 'audio/ogg;codecs=opus',
    durationMs: 1000
  });
  assert.equal(clip.mimeType, 'audio/ogg;codecs=opus');
});

test('rejects unsupported audio formats and MIME mismatches', () => {
  assert.throws(() => validateNarrationClip({
    ...validClip(),
    dataUrl: 'data:audio/mpeg;base64,AAAA',
    mimeType: 'audio/mpeg'
  }), /supported audio format/i);
  assert.throws(() => validateNarrationClip({
    ...validClip(),
    mimeType: 'audio/ogg;codecs=opus'
  }), /does not match/i);
});

test('rejects malformed data URLs and invalid base64', () => {
  for (const dataUrl of [
    'https://example.invalid/audio.webm',
    'data:audio/webm;base64,not base64!',
    'data:audio/webm;base64,AAA',
    'data:audio/webm;base64,'
  ]) {
    assert.throws(() => validateNarrationClip({ ...validClip(), dataUrl }));
  }
});

test('rejects empty, excessive or invalid recording durations', () => {
  assert.throws(() => validateNarrationClip({ ...validClip(), durationMs: 0 }), /duration/i);
  assert.throws(() => validateNarrationClip({ ...validClip(), durationMs: -1 }), /duration/i);
  assert.throws(() => validateNarrationClip({ ...validClip(), durationMs: MAX_RECORDING_MS + 1 }), /duration/i);
  assert.throws(() => validateNarrationClip({ ...validClip(), durationMs: 1.5 }), /duration/i);
});

test('rejects audio data larger than the project narration limit', () => {
  const payload = 'A'.repeat(Math.ceil((MAX_AUDIO_BYTES + 1) / 3) * 4);
  const dataUrl = 'data:audio/webm;base64,' + payload;
  assert.throws(() => validateNarrationClip({
    dataUrl,
    mimeType: 'audio/webm',
    durationMs: MAX_RECORDING_MS
  }), /exceeds.*limit/i);
});

test('keeps valid narration when a Brightdesk project is saved', () => {
  const project = {
    title: 'Presentation',
    docs: {
      slides: {
        title: 'Presentation',
        slides: [{ title: 'Welcome', body: 'Hello' }],
        current: 0,
        narration: validClip()
      }
    }
  };
  assert.equal(validateProject(project), project);
});

test('rejects malformed narration while validating Brightdesk projects', () => {
  const project = {
    title: 'Presentation',
    docs: {
      slides: {
        title: 'Presentation',
        slides: [{ title: 'Welcome', body: 'Hello' }],
        current: 0,
        narration: { ...validClip(), dataUrl: 'https://example.invalid/voice.webm' }
      }
    }
  };
  assert.throws(() => validateProject(project), /narration/i);
});


const {
  mayRequestMicrophoneAccess,
  mayCheckMicrophoneAccess
} = require('../src/media-permissions');

test('allows an explicit microphone request from the main local product window', () => {
  assert.equal(mayRequestMicrophoneAccess({
    isMainWindow: true,
    permission: 'media',
    mediaTypes: ['audio'],
    isMainFrame: true,
    requestingUrl: 'file:///Applications/Brightdesk%20Decks.app/Contents/Resources/app/src/index.html'
  }), true);
});

test('denies camera, screen capture, subframes and non-local origins', () => {
  const base = {
    isMainWindow: true,
    permission: 'media',
    mediaTypes: ['audio'],
    isMainFrame: true,
    requestingUrl: 'file:///Brightdesk/index.html'
  };
  assert.equal(mayRequestMicrophoneAccess({ ...base, mediaTypes: ['video'] }), false);
  assert.equal(mayRequestMicrophoneAccess({ ...base, mediaTypes: ['audio', 'video'] }), false);
  assert.equal(mayRequestMicrophoneAccess({ ...base, permission: 'display-capture' }), false);
  assert.equal(mayRequestMicrophoneAccess({ ...base, isMainFrame: false }), false);
  assert.equal(mayRequestMicrophoneAccess({ ...base, isMainWindow: false }), false);
  assert.equal(mayRequestMicrophoneAccess({ ...base, requestingUrl: 'https://example.invalid/' }), false);
});

test('permission checks allow audio only from the main local product window', () => {
  assert.equal(mayCheckMicrophoneAccess({
    isMainWindow: true,
    permission: 'media',
    mediaType: 'audio',
    isMainFrame: true,
    requestingOrigin: 'file://'
  }), true);
  assert.equal(mayCheckMicrophoneAccess({
    isMainWindow: true,
    permission: 'media',
    mediaType: 'video',
    isMainFrame: true,
    requestingOrigin: 'file://'
  }), false);
  assert.equal(mayCheckMicrophoneAccess({
    isMainWindow: true,
    permission: 'media',
    mediaType: 'audio',
    isMainFrame: false,
    requestingOrigin: 'file://'
  }), false);
  assert.equal(mayCheckMicrophoneAccess({
    isMainWindow: true,
    permission: 'media',
    mediaType: 'audio',
    isMainFrame: true,
    requestingOrigin: 'https://example.invalid'
  }), false);
});

test('loads narration support before the editor and permits only local audio media', () => {
  const html = fs.readFileSync(path.join(__dirname, '../src/index.html'), 'utf8');
  const audioScriptPosition = html.indexOf('<script src="slides-audio.js"></script>');
  const appScriptPosition = html.indexOf('<script src="app.js"></script>');
  assert.ok(audioScriptPosition >= 0 && audioScriptPosition < appScriptPosition);
  assert.match(html, /media-src 'self' data: blob:/);
  assert.match(html, /connect-src 'none'/);
});

test('provides user-triggered recording, stop and presentation playback controls', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');
  assert.match(appSource, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(appSource, /textContent = 'Record narration'/);
  assert.match(appSource, /textContent = 'Stop recording'/);
  assert.match(appSource, /className = 'presentation-narration'/);
});
