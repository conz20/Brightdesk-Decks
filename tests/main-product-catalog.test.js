'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { APP_SLUGS } = require('../src/standalone-downloads');

test('Electron main process imports the shared standalone app catalogue before validating its product ID', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  assert.match(
    source,
    /const\s+\{\s*APP_SLUGS\s*\}\s*=\s*require\(['"]\.\/standalone-downloads['"]\);/
  );
  assert.deepEqual(Object.keys(APP_SLUGS).sort(), ["database","forms","lists","loop","notes","pages","planner","sheets","slides","todo"]);
});


test('Decks Presenter View uses a separate secure audience window on an external display', () => {
  const root = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'src', 'preload.js'), 'utf8');
  const presenterPreload = fs.readFileSync(path.join(root, 'src', 'presentation-preload.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'src', 'presentation.html'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'src', 'presentation-window.js'), 'utf8');

  assert.match(main, /screen\.getAllDisplays\(\)/);
  assert.match(main, /function createPresenterWindow/);
  assert.match(main, /display\.id !== primaryDisplay\.id/);
  assert.match(main, /presentation:start/);
  assert.match(main, /presentation:update/);
  assert.match(main, /presentation:end/);
  assert.match(main, /presentation-preload\.js/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /contextIsolation:\s*true/);
  assert.match(preload, /startPresenter:/);
  assert.match(preload, /updatePresenter:/);
  assert.match(preload, /endPresenter:/);
  assert.match(presenterPreload, /exposeInMainWorld\(['"]brightdeskPresentation['"]/);
  assert.match(presenterPreload, /onPresentationUpdate/);
  assert.match(html, /presentation-window\.css/);
  assert.match(html, /presentation-window\.js/);
  assert.match(renderer, /onPresentationUpdate/);
  assert.match(renderer, /textContent/);
  assert.doesNotMatch(renderer, /innerHTML/);
});

test('Decks only starts and updates its audience window from the main application renderer', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  assert.match(source, /ipcMain\.handle\(['"]presentation:start['"][\s\S]*?senderIsMain\(event\)/);
  assert.match(source, /ipcMain\.on\(['"]presentation:update['"][\s\S]*?senderIsMain\(event\)/);
  assert.match(source, /ipcMain\.handle\(['"]presentation:end['"][\s\S]*?senderIsMain\(event\)/);
});
