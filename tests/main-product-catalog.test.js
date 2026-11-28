'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
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
  assert.ok(main.includes('audienceWindow.showInactive()'), 'audience slide must not steal presenter keyboard focus');
  assert.match(main, /screen\.on\(['"]display-removed['"]/);
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
  assert.match(preload, /onPresenterDisplayLost:/);
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


test('Audience renderer keeps both comparison columns and safely draws slide objects', () => {
  const root = path.join(__dirname, '..');
  const renderer = fs.readFileSync(path.join(root, 'src', 'presentation-window.js'), 'utf8');
  class Element {
    constructor() {
      this.className = '';
      this.textContent = '';
      this.hidden = false;
      this.style = {};
      this.children = [];
    }
    append(child) { this.children.push(child); }
    replaceChildren(...children) { this.children = children; }
  }
  const objectLayer = new Element();
  const slideSurface = new Element();
  const elements = Object.fromEntries(
    ['presentation-root', 'audience-title', 'audience-body', 'audience-columns', 'audience-body-secondary']
      .map(id => [id, new Element()])
  );
  elements['presentation-root'].querySelector = selector => ({
    '.audience-slide': slideSurface,
    '.audience-object-layer': objectLayer
  })[selector] || null;
  let render;
  const window = {
    brightdeskPresentation: {
      onPresentationUpdate(callback) { render = callback; }
    }
  };
  const document = {
    getElementById(id) { return elements[id]; },
    createElement() { return new Element(); }
  };

  vm.runInNewContext(renderer, { window, document });
  assert.equal(typeof render, 'function');

  render({
    slide: {
      title: 'Compare',
      body: 'Option A',
      bodySecondary: 'Option B',
      layout: 'two-content',
      backgroundColor: '#202B3B',
      objects: [
        { type: 'rectangle', x: 10, y: 20, width: 30, height: 25, fill: '#F3EBDD', stroke: '#26364D', strokeWidth: 2, text: 'Diagram block' },
        { type: 'text', x: 48, y: 24, width: 25, height: 12, text: 'Plain text object', textColor: '#26364D', fontSize: 24 },
        {
          type: 'image', x: 18, y: 50, width: 30, height: 24,
          imageData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==',
          imageName: 'team-photo.png', imageWidth: 1, imageHeight: 1
        }
      ]
    },
    themeId: 'midnight',
    slideSize: 'standard'
  });
  assert.equal(elements['presentation-root'].className, 'audience-presentation theme-midnight size-standard layout-two-content');
  assert.equal(elements['audience-title'].textContent, 'Compare');
  assert.equal(elements['audience-body'].textContent, 'Option A');
  assert.equal(elements['audience-body-secondary'].textContent, 'Option B');
  assert.equal(elements['audience-body-secondary'].hidden, false);
  assert.equal(elements['audience-columns'].hidden, false);
  assert.equal(slideSurface.style.backgroundColor, '#202B3B');
  assert.equal(objectLayer.children.length, 2);
  assert.equal(objectLayer.children[0].textContent, 'Diagram block');
  assert.equal(objectLayer.children[0].style.left, '10%');
  assert.equal(objectLayer.children[1].textContent, 'Plain text object');
  assert.equal(objectLayer.children.length, 3);
  assert.equal(objectLayer.children[2].children[0].src.startsWith('data:image/png;base64,'), true);
  assert.equal(objectLayer.children[2].children[0].alt, 'team-photo.png');
  assert.equal(objectLayer.children[2].children[0].draggable, false);

  render({
    slide: { title: '<img src=x onerror=alert(1)>', body: 'Ordinary content', bodySecondary: 'Unused', layout: 'title-content', objects: [] },
    themeId: 'paper',
    slideSize: 'widescreen',
    blankMode: 'black'
  });
  assert.equal(elements['presentation-root'].className, 'audience-presentation theme-paper size-widescreen layout-title-content is-blank-black');
  assert.equal(elements['audience-title'].textContent, '<img src=x onerror=alert(1)>');
  assert.equal(elements['audience-body-secondary'].hidden, true);
  assert.equal(elements['audience-columns'].hidden, false);
  assert.equal(objectLayer.children.length, 0);
  assert.doesNotMatch(renderer, /innerHTML/);
});


test('Decks closes the audience window when its external display is disconnected', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  assert.match(source, /presenterDisplayId !== display\.id/);
  assert.match(source, /closePresenterWindow\(\)/);
  assert.match(source, /presentation:display-lost/);
});


test('Decks forwards only bounded slide-object data to the separate audience renderer', () => {
  const root = path.join(__dirname, '..');
  const app = fs.readFileSync(path.join(root, 'src', 'app.js'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'src', 'presentation.html'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'src', 'presentation-window.js'), 'utf8');

  assert.match(app, /objects: currentSlide\.objects \|\| \[\]/);
  assert.match(main, /function normalizePresenterObjects\(/);
  assert.match(main, /objects: normalizePresenterObjects\(slide\.objects\)/);
  assert.match(html, /audience-object-layer/);
  assert.match(renderer, /audience-object-layer/);
  assert.match(renderer, /textContent/);
  assert.doesNotMatch(renderer, /innerHTML/);
});


test('Decks audience output applies slide transitions once per slide and respects the safe allow-list', () => {
  const root = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'src', 'app.js'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'src', 'presentation-window.js'), 'utf8');
  assert.match(main, /supportedPresenterTransitions = new Set\(\['none', 'fade', 'push', 'wipe'\]\)/);
  assert.match(main, /supportedPresenterTransitions\.has\(slide\.transition\)/);
  assert.match(app, /transition: currentSlide\.transition \|\| 'none'/);

  class Element {
    constructor() {
      this.className = '';
      this.textContent = '';
      this.hidden = false;
      this.style = {};
      this.children = [];
      this.offsetWidth = 100;
    }
    append(child) { this.children.push(child); }
    replaceChildren(...children) { this.children = children; }
  }
  const objectLayer = new Element();
  const slideSurface = new Element();
  const elements = Object.fromEntries(
    ['presentation-root', 'audience-title', 'audience-body', 'audience-columns', 'audience-body-secondary']
      .map(id => [id, new Element()])
  );
  elements['presentation-root'].querySelector = selector => ({
    '.audience-slide': slideSurface,
    '.audience-object-layer': objectLayer
  })[selector] || null;
  let render;
  const window = {
    matchMedia() { return { matches: false }; },
    brightdeskPresentation: {
      onPresentationUpdate(callback) { render = callback; }
    }
  };
  const document = {
    getElementById(id) { return elements[id]; },
    createElement() { return new Element(); }
  };

  vm.runInNewContext(renderer, { window, document });
  render({ slide: { id: 'slide-one', title: 'First', body: '', layout: 'title-content', transition: 'fade' }, themeId: 'paper', slideSize: 'widescreen' });
  assert.ok(elements['presentation-root'].className.includes('audience-transition-fade'));

  render({ slide: { id: 'slide-one', title: 'First updated', body: '', layout: 'title-content', transition: 'fade' }, themeId: 'paper', slideSize: 'widescreen' });
  assert.ok(elements['presentation-root'].className.includes('audience-transition-fade'));

  render({ slide: { id: 'slide-two', title: 'Second', body: '', layout: 'title-content', transition: 'none' }, themeId: 'paper', slideSize: 'widescreen' });
  assert.equal(elements['presentation-root'].className.includes('audience-transition-'), false);

  render({ slide: { id: 'slide-three', title: 'Third', body: '', layout: 'title-content', transition: 'morph' }, themeId: 'paper', slideSize: 'widescreen' });
  assert.equal(elements['presentation-root'].className.includes('audience-transition-'), false);
});


test('Decks opens picture files only through a guarded local image picker', () => {
  const root = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'src', 'preload.js'), 'utf8');
  const imageService = fs.readFileSync(path.join(root, 'src', 'slide-image-service.js'), 'utf8');

  assert.match(main, /ipcMain\.handle\(['"]slides:picture:open['"][\s\S]*?senderIsMain\(event\)/);
  assert.match(main, /showOpenDialog\(mainWindow/);
  assert.match(main, /extensions:\s*\['png', 'jpg', 'jpeg', 'webp'\]/);
  assert.match(imageService, /image\/(?:png|jpeg|webp)/);
  assert.match(main, /MAX_SLIDE_IMAGE_BYTES/);
  assert.match(main, /nativeImage\.createFromBuffer/);
  assert.match(preload, /openSlidePicture:\s*\(\)\s*=>\s*ipcRenderer\.invoke\(['"]slides:picture:open['"]\)/);
});


test('Decks stores picture bytes in its private device data folder with guarded read and cleanup IPC', () => {
  const root = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'src', 'preload.js'), 'utf8');

  assert.match(main, /function getSlidePictureAssetPath\(assetId\)/);
  assert.match(main, /app\.getPath\('userData'\)/);
  assert.match(main, /async function storeSlidePictureAsset\(imageData\)/);
  assert.match(main, /async function loadSlidePictureAsset\(assetId\)/);
  assert.match(main, /async function prepareProjectSlidePictures\(value\)/);
  assert.match(main, /ipcMain\.handle\(['"]slides:picture:store['"][\s\S]*?senderIsMain\(event\)/);
  assert.match(main, /ipcMain\.handle\(['"]slides:picture:load['"][\s\S]*?senderIsMain\(event\)/);
  assert.match(main, /ipcMain\.handle\(['"]slides:picture:prune['"][\s\S]*?senderIsMain\(event\)/);
  assert.match(main, /return prepareProjectSlidePictures\(imported\)/);
  assert.match(main, /return prepareProjectSlidePictures\(opened\)/);
  assert.match(preload, /storeSlidePicture:/);
  assert.match(preload, /loadSlidePicture:/);
  assert.match(preload, /pruneSlidePictures:/);
});

