'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ensurePresentation,
  addSlide,
  duplicateSlide,
  deleteSlide,
  updateSlide,
  moveSlide,
  setCurrentSlide
} = require('../src/slides-service');

test('Decks creates an editable presentation with one starter slide', () => {
  const presentation = ensurePresentation({ title: 'Quarterly review', slides: [], current: 0 });

  assert.equal(presentation.title, 'Quarterly review');
  assert.equal(presentation.slides.length, 1);
  assert.deepEqual(presentation.slides[0], { title: 'Slide 1', body: '', bodySecondary: '', notes: '', layout: 'title-content' });
  assert.equal(presentation.current, 0);
});

test('Decks migrates legacy slides without losing titles or body text', () => {
  const presentation = ensurePresentation({
    title: 'Legacy deck',
    slides: [{ title: 'Welcome', body: 'Existing content' }],
    current: 0
  });

  assert.deepEqual(presentation.slides[0], {
    title: 'Welcome',
    body: 'Existing content',
    bodySecondary: '',
    notes: '',
    layout: 'title-content'
  });
});

test('Decks preserves existing speaker notes when normalizing a presentation', () => {
  const presentation = ensurePresentation({
    slides: [{ title: 'Welcome', body: 'Hello', notes: 'Introduce the team.' }],
    current: 0
  });

  assert.equal(presentation.slides[0].notes, 'Introduce the team.');
});

test('Decks adds a slide and selects the new slide', () => {
  const presentation = { slides: [{ title: 'Welcome', body: 'Hello', notes: 'Say hello.' }], current: 0 };

  const slide = addSlide(presentation, { title: 'Priorities', body: 'Plan the work' });

  assert.deepEqual(slide, { title: 'Priorities', body: 'Plan the work', bodySecondary: '', notes: '', layout: 'title-content' });
  assert.equal(presentation.slides.length, 2);
  assert.equal(presentation.current, 1);
});

test('Decks duplicates the selected slide and its speaker notes without sharing its object', () => {
  const original = { title: 'Review', body: 'Progress so far', bodySecondary: '', notes: 'Mention the milestone.', layout: 'title-content' };
  const presentation = { slides: [original], current: 0 };

  const copy = duplicateSlide(presentation);

  assert.deepEqual(copy, original);
  assert.notEqual(copy, original);
  assert.equal(presentation.slides.length, 2);
  assert.equal(presentation.current, 1);
  copy.title = 'Updated copy';
  copy.notes = 'New notes';
  assert.equal(original.title, 'Review');
  assert.equal(original.notes, 'Mention the milestone.');
});

test('Decks refuses to delete the final remaining slide', () => {
  const presentation = { slides: [{ title: 'Only slide', body: '', notes: '' }], current: 0 };

  assert.equal(deleteSlide(presentation), false);
  assert.equal(presentation.slides.length, 1);
  assert.equal(presentation.current, 0);
});

test('Decks deletes the selected slide and keeps the active index valid', () => {
  const presentation = {
    slides: [
      { title: 'One', body: '', notes: '' },
      { title: 'Two', body: '', notes: '' },
      { title: 'Three', body: '', notes: '' }
    ],
    current: 1
  };

  assert.equal(deleteSlide(presentation), true);
  assert.deepEqual(presentation.slides.map(slide => slide.title), ['One', 'Three']);
  assert.equal(presentation.current, 0);
});

test('Decks edits slide title, body and speaker notes as text', () => {
  const presentation = { slides: [{ title: 'Draft', body: 'Text', notes: '' }], current: 0 };

  const updated = updateSlide(presentation, 0, {
    title: 'Final',
    body: 'Approved text',
    notes: 'Pause here for questions.'
  });

  assert.deepEqual(updated, {
    title: 'Final',
    body: 'Approved text',
    bodySecondary: '',
    notes: 'Pause here for questions.',
    layout: 'title-content'
  });
});

test('Decks reorders slides and keeps the same selected slide active', () => {
  const selected = { title: 'Two', body: 'Content', notes: 'Speaker notes' };
  const presentation = {
    slides: [
      { title: 'One', body: '', notes: '' },
      selected,
      { title: 'Three', body: '', notes: '' }
    ],
    current: 1
  };

  const moved = moveSlide(presentation, 1, 2);

  assert.equal(moved, selected);
  assert.deepEqual(presentation.slides.map(slide => slide.title), ['One', 'Three', 'Two']);
  assert.equal(presentation.current, 2);
  assert.equal(presentation.slides[presentation.current].notes, 'Speaker notes');
});

test('Decks reorders a slide before the current slide without changing the selected slide', () => {
  const presentation = {
    slides: [
      { title: 'One', body: '', notes: '' },
      { title: 'Two', body: '', notes: '' },
      { title: 'Three', body: '', notes: '' }
    ],
    current: 2
  };

  moveSlide(presentation, 0, 1);

  assert.deepEqual(presentation.slides.map(slide => slide.title), ['Two', 'One', 'Three']);
  assert.equal(presentation.current, 2);
  assert.equal(presentation.slides[presentation.current].title, 'Three');
});

test('Decks rejects invalid slide indexes instead of mutating another slide', () => {
  const presentation = { slides: [{ title: 'Only', body: '', notes: '' }], current: 0 };

  assert.throws(() => updateSlide(presentation, 2, { title: 'Wrong slide' }), RangeError);
  assert.throws(() => moveSlide(presentation, 0, 1), RangeError);
  assert.throws(() => setCurrentSlide(presentation, -1), RangeError);
});


test('Decks connects thumbnail navigation and per-slide notes to the editor', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '..');
  const app = fs.readFileSync(path.join(root, 'src', 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'src', 'index.html'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');

  assert.match(app, /slide-thumbnail-card/);
  assert.match(app, /slidesService\.moveSlide\(doc,/);
  assert.match(app, /slide-speaker-notes-editor/);
  assert.match(app, /updateSlide\(doc, doc\.current, \{ notes: notes\.value \}\)/);
  assert.match(html, /id="slide-wrap"/);
  assert.match(html, /src="slides-service\.js"/);
  assert.match(styles, /\.slide-editor-shell/);
  assert.match(styles, /\.slide-speaker-notes/);
});


test('Decks starts the show with F5 or from the selected slide with Shift+F5', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');

  assert.match(app, /function presentSlides\(startFromFirst = false\)/);
  assert.match(app, /presentSlides\(!event\.shiftKey\)/);
  assert.match(app, /event\.key !== 'F5'/);
});


test('Decks migrates existing slides to the default title and content layout', () => {
  const presentation = ensurePresentation({
    slides: [{ title: 'Legacy', body: 'Existing body', notes: 'Existing notes' }],
    current: 0
  });

  assert.equal(presentation.slides[0].layout, 'title-content');
  assert.equal(presentation.slides[0].bodySecondary, '');
  assert.equal(presentation.slides[0].body, 'Existing body');
  assert.equal(presentation.slides[0].notes, 'Existing notes');
});

test('Decks preserves a valid slide layout and secondary content when normalizing', () => {
  const presentation = ensurePresentation({
    slides: [{ title: 'Compare', body: 'Left', bodySecondary: 'Right', layout: 'two-content' }],
    current: 0
  });

  assert.equal(presentation.slides[0].layout, 'two-content');
  assert.equal(presentation.slides[0].body, 'Left');
  assert.equal(presentation.slides[0].bodySecondary, 'Right');
});

test('Decks replaces unknown stored layouts with the safe default', () => {
  const presentation = ensurePresentation({
    slides: [{ title: 'Legacy', body: 'Text', layout: 'remote-layout' }],
    current: 0
  });

  assert.equal(presentation.slides[0].layout, 'title-content');
});

test('Decks changes the selected slide layout without losing text or notes', () => {
  const presentation = {
    slides: [{ title: 'Compare', body: 'First column', bodySecondary: 'Second column', notes: 'Compare both sides.' }],
    current: 0
  };

  const slide = setSlideLayout(presentation, 0, 'two-content');

  assert.equal(slide.layout, 'two-content');
  assert.equal(slide.body, 'First column');
  assert.equal(slide.bodySecondary, 'Second column');
  assert.equal(slide.notes, 'Compare both sides.');
});

test('Decks rejects unknown slide layout selections', () => {
  const presentation = { slides: [{ title: 'Title', body: 'Body' }], current: 0 };

  assert.throws(() => setSlideLayout(presentation, 0, 'unknown-layout'), RangeError);
});

test('Decks can edit secondary placeholder text without changing the primary body', () => {
  const presentation = {
    slides: [{ title: 'Compare', body: 'Left side', bodySecondary: 'Right side', layout: 'two-content' }],
    current: 0
  };

  const updated = updateSlide(presentation, 0, { bodySecondary: 'Updated right side' });

  assert.equal(updated.body, 'Left side');
  assert.equal(updated.bodySecondary, 'Updated right side');
});

test('Decks connects slide layout selection and Slide Sorter to its ribbon', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '..', 'src', 'styles.css'), 'utf8');

  assert.match(app, /slide-layout-select/);
  assert.match(app, /setSlideLayout\(/);
  assert.match(app, /state\.slideView === 'sorter'/);
  assert.match(app, /Slide Sorter/);
  assert.match(styles, /\.slide-sorter-grid/);
  assert.match(styles, /\.slide-layout-two-content/);
});
