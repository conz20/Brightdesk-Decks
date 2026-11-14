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
