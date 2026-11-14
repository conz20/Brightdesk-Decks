'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('Decks exports and imports the selected presentation theme', () => {
  const app = read('src/app.js');
  assert.match(app, /kind:'slides',title,slideSize:doc\.slideSize\|\|'widescreen',themeId:doc\.themeId\|\|'lavender',slides:doc\.slides\|\|\[\]/);
  assert.match(app, /themeId:data\.themeId\|\|'lavender'/);
});

test('Decks Design ribbon provides an accessible per-slide colour picker and reset action', () => {
  const app = read('src/app.js');
  const translations = read('src/i18n.js');
  const css = read('src/styles.css');
  assert.match(app, /backgroundInput\.type = 'color'/);
  assert.match(app, /backgroundInput\.setAttribute\('aria-label', label\('backgroundColour'\)\)/);
  assert.match(app, /setSlideBackgroundColor\(backgroundInput\.value\)/);
  assert.match(app, /addButton\(backgroundGroup, label\('resetBackground'\), \(\) => setSlideBackgroundColor\(null\)\)/);
  assert.match(translations, /common\.backgroundColour/);
  assert.match(translations, /common\.resetBackground/);
  assert.match(css, /\.slide-background-colour:focus-visible/);
  assert.match(css, /\.slide-stage\.has-custom-background \.slide-title::placeholder/);
  assert.match(css, /color:currentColor!important/);
});

test('Decks renders custom backgrounds and readable text in editor, sorter and presenter', () => {
  const app = read('src/app.js');
  const service = read('src/slides-service.js');
  assert.match(service, /function getReadableTextColor/);
  assert.match(app, /stage\.style\.backgroundColor = slide\.backgroundColor \|\| ''/);
  assert.match(app, /stage\.classList\.toggle\('has-custom-background', Boolean\(slide\.backgroundColor\)\)/);
  assert.match(app, /body\.style\.backgroundColor = slide\.backgroundColor \|\| ''/);
  assert.match(app, /second\.style\.backgroundColor = slide\.backgroundColor \|\| ''/);
  assert.match(app, /preview\.style\.backgroundColor = slide\.backgroundColor \|\| ''/);
  assert.match(app, /slide\.style\.backgroundColor = currentSlide\.backgroundColor \|\| ''/);
  assert.match(app, /body\.style\.backgroundColor = currentSlide\.backgroundColor \|\| ''/);
  assert.match(app, /nextPreviewBody\.style\.backgroundColor = snapshot\.nextSlide\.backgroundColor \|\| ''/);
  assert.match(app, /backgroundColor: currentSlide\.backgroundColor/);
});

test('The separate audience window applies custom colour to the slide surface without breaking blank mode', () => {
  const audience = read('src/presentation-window.js');
  const html = read('src/presentation.html');
  const css = read('src/presentation-window.css');
  assert.match(html, /class="audience-slide"/);
  assert.match(audience, /root\.querySelector\('\.audience-slide'\)/);
  assert.match(audience, /slideSurface\.style\.backgroundColor = backgroundColor/);
  assert.match(audience, /body\.style\.backgroundColor = backgroundColor/);
  assert.match(audience, /secondaryBody\.style\.backgroundColor = backgroundColor/);
  assert.match(audience, /root\.style\.backgroundColor = ''/);
  assert.match(css, /\.audience-presentation\.is-blank-black/);
  assert.match(css, /\.audience-presentation\.is-blank-white/);
});

test('Slide project and PowerPoint paths validate, save and restore solid background colours', () => {
  const files = read('src/file-service.js');
  const slides = read('src/slides-service.js');
  assert.match(files, /SLIDE_BACKGROUND_COLOR_PATTERN/);
  assert.match(files, /readPptxSlideSolidBackground\(xml\)/);
  assert.match(files, /backgroundColor \? \{ backgroundColor \} : \{\}/);
  assert.match(files, /getReadablePptxTextColor\(backgroundColor\)/);
  assert.match(slides, /function setSlideBackgroundColor/);
  assert.match(slides, /function getSlideBackgroundColor/);
});


test('Decks provides a guarded Reuse Slides workflow from the Home ribbon', () => {
  const app = read('src/app.js');
  const main = read('src/main.js');
  const preload = read('src/preload.js');
  const translations = read('src/i18n.js');

  assert.match(app, /addButton\(slides, label\('reuseSlides'\), reuseSlides\)/);
  assert.match(app, /async function reuseSlides\(\)/);
  assert.match(app, /window\.brightdesk\.reuseSlides\(\)/);
  assert.match(app, /insertSlidesAfterCurrent\(doc, data\.slides\)/);
  assert.match(app, /commitSlideChange\(doc\)/);
  assert.match(main, /ipcMain\.handle\('slides:reuse'/);
  assert.match(main, /extensions: \['pptx'\]/);
  assert.match(preload, /reuseSlides: \(\) => ipcRenderer\.invoke\('slides:reuse'\)/);
  assert.match(translations, /'common\.reuseSlides':'Reuse slides/);
});


test('Decks provides a Draw workspace with selectable and editable slide objects', () => {
  const app = read('src/app.js');
  const css = read('src/styles.css');

  assert.match(app, /slides: \['home', 'insert', 'draw', 'design'/);
  assert.match(app, /function insertSlideObject\(/);
  assert.match(app, /function renderSlideObjects\(/);
  assert.match(app, /data-slide-object/);
  assert.match(app, /selectedSlideObjectId/);
  assert.match(app, /Shape Format/);
  assert.match(css, /\.slide-object/);
  assert.match(css, /\.slide-object-selected/);
});

test('Decks renders saved slide objects in both editing and full-screen playback', () => {
  const app = read('src/app.js');

  assert.match(app, /renderSlideObjects\(stage, slide\.objects/);
  assert.match(app, /renderPresentationObjects\(objectLayer, currentSlide\.objects/);
});


test('Decks Draw ribbon inserts, selects, moves, resizes, formats and deletes editable slide objects', () => {
  const app = read('src/app.js');
  const service = read('src/slides-service.js');
  const css = read('src/styles.css');

  assert.match(app, /addButton\(shapes, 'Text box', \(\) => insertSlideObject\('text'\)\)/);
  assert.match(app, /addButton\(shapes, 'Rectangle', \(\) => insertSlideObject\('rectangle'\)\)/);
  assert.match(app, /addButton\(shapes, 'Ellipse', \(\) => insertSlideObject\('ellipse'\)\)/);
  assert.match(app, /addButton\(shapes, 'Line', \(\) => insertSlideObject\('line'\)\)/);
  assert.match(app, /textEditor\.contentEditable = editable \? 'true' : 'false'/);
  assert.match(app, /moveHandle\.addEventListener\('pointerdown'/);
  assert.match(app, /resizeHandle\.addEventListener\('pointerdown'/);
  assert.match(app, /function updateSelectedSlideObject\(/);
  assert.match(app, /function deleteSelectedSlideObject\(/);
  assert.match(service, /function addSlideObject\(/);
  assert.match(service, /function updateSlideObject\(/);
  assert.match(service, /function deleteSlideObject\(/);
  assert.match(css, /\.slide-object-drag-handle/);
  assert.match(css, /\.slide-object-resize-handle/);
});

test('Decks PowerPoint export creates native editable object shapes instead of raster images', () => {
  const files = read('src/file-service.js');
  assert.match(files, /slide\.addText\(typeof object\.text === 'string' \? object\.text : ''/);
  assert.match(files, /slide\.addShape\(shapeType/);
  assert.match(files, /pptx\.ShapeType\.rect/);
  assert.match(files, /pptx\.ShapeType\.ellipse/);
  assert.match(files, /pptx\.ShapeType\.line/);
  assert.match(files, /objectName/);
});


test('Decks Transitions ribbon persists choices and labels each thumbnail', () => {
  const app = read('src/app.js');
  const styles = read('src/styles.css');
  const service = read('src/slides-service.js');

  assert.match(app, /slides: \['home', 'insert', 'draw', 'design', 'transitions'/);
  assert.match(app, /function setSlideTransition\(transition\)/);
  assert.match(app, /BrightdeskSlidesService\.setSlideTransition\(doc, doc\.current, transition\)/);
  assert.match(app, /slide-thumbnail-transition/);
  assert.match(app, /slide-sorter-transition/);
  assert.match(service, /function setSlideTransition\(/);
  assert.match(styles, /\.slide-thumbnail-transition/);
});

test('Decks applies the selected slide transition during playback', () => {
  const app = read('src/app.js');
  const styles = read('src/styles.css');
  const audience = read('src/presentation-window.js');
  const audienceStyles = read('src/presentation-window.css');

  assert.match(app, /slide-transition-\$\{transition\}/);
  assert.match(styles, /@keyframes bd-slide-fade/);
  assert.match(styles, /@keyframes bd-slide-push/);
  assert.match(styles, /@keyframes bd-slide-wipe/);
  assert.match(audience, /audience-transition-\$\{transition\}/);
  assert.match(audienceStyles, /@keyframes bd-audience-fade/);
});


test('Decks shows a contextual Format Shape pane beside the selected slide', () => {
  const app = read('src/app.js');
  const styles = read('src/styles.css');

  assert.match(app, /function renderSlideFormatPane\(/);
  assert.match(app, /existingPane\?\.remove\(\)/);
  assert.match(app, /canvasRow\.append\(renderSlideFormatPane\(selectedObject\)\)/);
  assert.match(app, /slide-editor-canvas-row/);
  assert.match(app, /slide-format-pane/);
  assert.ok(app.includes("addControl(size, 'Horizontal position (%)', 'x', 'number'"));
  assert.ok(app.includes("addControl(size, 'Width (%)', 'width', 'number'"));
  assert.ok(app.includes("addControl(size, 'Rotation (degrees)', 'rotation', 'number'"));
  assert.match(app, /Fill & Line/);
  assert.match(app, /Size & Properties/);
  assert.match(styles, /\.slide-format-pane/);
  assert.match(styles, /\.slide-editor-canvas-row/);
});
