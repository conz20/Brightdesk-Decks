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
  setSlideLayout,
  getSlideLayoutDefinition,
  resetSlideLayout,
  setCurrentSlide,
  getPresenterSnapshot,
  createHistory,
  setSlideTheme,
  setSlideBackgroundColor,
  setSlideTransition,
  getReadableTextColor,
  addSlideObject,
  updateSlideObject,
  deleteSlideObject,
  moveSlideObject,
  reorderSlideObject,
  insertSlidesAfterCurrent
} = require('../src/slides-service');

function withoutSlideId(slide) {
  const { id, layoutId, transition, ...content } = slide;
  return content;
}

test('Decks creates an editable presentation with one starter slide', () => {
  const presentation = ensurePresentation({ title: 'Quarterly review', slides: [], current: 0 });

  assert.equal(presentation.title, 'Quarterly review');
  assert.equal(presentation.slides.length, 1);
  assert.deepEqual(withoutSlideId(presentation.slides[0]), { title: 'Slide 1', body: '', bodySecondary: '', notes: '', layout: 'title-content' });
  assert.equal(presentation.current, 0);
});

test('Decks migrates legacy slides without losing titles or body text', () => {
  const presentation = ensurePresentation({
    title: 'Legacy deck',
    slides: [{ title: 'Welcome', body: 'Existing content' }],
    current: 0
  });

  assert.deepEqual(withoutSlideId(presentation.slides[0]), {
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

  assert.deepEqual(withoutSlideId(slide), { title: 'Priorities', body: 'Plan the work', bodySecondary: '', notes: '', layout: 'title-content' });
  assert.equal(presentation.slides.length, 2);
  assert.equal(presentation.current, 1);
});

test('Decks duplicates the selected slide and its speaker notes without sharing its object', () => {
  const original = { title: 'Review', body: 'Progress so far', bodySecondary: '', notes: 'Mention the milestone.', layout: 'title-content' };
  const presentation = { slides: [original], current: 0 };

  const copy = duplicateSlide(presentation);

  assert.deepEqual(withoutSlideId(copy), original);
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

  assert.deepEqual(withoutSlideId(updated), {
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

  assert.deepEqual(withoutSlideId(moved), { title: 'Two', body: 'Content', bodySecondary: '', notes: 'Speaker notes', layout: 'title-content' });
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
  assert.match(styles, /\.layout-two-content/);
});


test('Decks can undo and redo a slide edit without losing the edited content', () => {
  const { createHistory } = require('../src/slides-service');
  const presentation = { slides: [{ title: 'Draft', body: 'Original', notes: '' }], current: 0 };
  const history = createHistory(presentation);

  updateSlide(presentation, 0, { body: 'Revised' });
  history.commit(presentation);

  assert.equal(history.canUndo(), true);
  assert.equal(history.undo(presentation), true);
  assert.equal(presentation.slides[0].body, 'Original');
  assert.equal(history.canRedo(), true);
  assert.equal(history.redo(presentation), true);
  assert.equal(presentation.slides[0].body, 'Revised');
});

test('Decks groups consecutive typing in the same field into one undo step', () => {
  const { createHistory } = require('../src/slides-service');
  const presentation = { slides: [{ title: '', body: '', notes: '' }], current: 0 };
  const history = createHistory(presentation);

  updateSlide(presentation, 0, { title: 'D' });
  history.commit(presentation, 'slide:0:title', 1000);
  updateSlide(presentation, 0, { title: 'Dr' });
  history.commit(presentation, 'slide:0:title', 1100);
  updateSlide(presentation, 0, { title: 'Draft' });
  history.commit(presentation, 'slide:0:title', 1200);

  assert.equal(history.undo(presentation), true);
  assert.equal(presentation.slides[0].title, '');
  assert.equal(history.canUndo(), false);
});

test('Decks clears redo history when a new edit is made after undo', () => {
  const { createHistory } = require('../src/slides-service');
  const presentation = { slides: [{ title: 'One', body: '', notes: '' }], current: 0 };
  const history = createHistory(presentation);

  updateSlide(presentation, 0, { title: 'Two' });
  history.commit(presentation);
  history.undo(presentation);
  updateSlide(presentation, 0, { title: 'Three' });
  history.commit(presentation);

  assert.equal(history.canRedo(), false);
  assert.equal(history.redo(presentation), false);
  assert.equal(presentation.slides[0].title, 'Three');
});

test('Decks bounds undo history and restores slide structure and selection', () => {
  const { createHistory } = require('../src/slides-service');
  const presentation = {
    slides: [{ title: 'One', body: '', notes: '' }],
    current: 0
  };
  const history = createHistory(presentation, { limit: 2 });

  addSlide(presentation, { title: 'Two' });
  history.commit(presentation);
  addSlide(presentation, { title: 'Three' });
  history.commit(presentation);
  addSlide(presentation, { title: 'Four' });
  history.commit(presentation);

  assert.equal(history.undo(presentation), true);
  assert.deepEqual(presentation.slides.map(slide => slide.title), ['One', 'Two', 'Three']);
  assert.equal(presentation.current, 2);
  assert.equal(history.undo(presentation), true);
  assert.deepEqual(presentation.slides.map(slide => slide.title), ['One', 'Two']);
  assert.equal(presentation.current, 1);
  assert.equal(history.undo(presentation), false);
});

test('Decks exposes undo and redo controls and keyboard shortcuts in the editor', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');

  assert.match(app, /data-slide-undo/);
  assert.match(app, /data-slide-redo/);
  assert.match(app, /event\.key\.toLowerCase\(\) === 'z'/);
  assert.match(app, /event\.shiftKey/);
  assert.match(app, /history\.undo\(doc\)/);
  assert.match(app, /history\.redo\(doc\)/);
});


test('Decks restores undo and redo history after the editor is reopened', () => {
  const { createHistory } = require('../src/slides-service');
  const presentation = { slides: [{ title: 'Draft', body: 'Original', notes: '' }], current: 0 };
  const firstSession = createHistory(presentation);

  updateSlide(presentation, 0, { body: 'Revised' });
  firstSession.commit(presentation);
  const savedHistory = firstSession.exportState();

  const reopenedPresentation = structuredClone(presentation);
  const reopenedSession = createHistory(reopenedPresentation, { state: savedHistory });

  assert.equal(reopenedSession.restored, true);
  assert.equal(reopenedSession.canUndo(), true);
  assert.equal(reopenedSession.undo(reopenedPresentation), true);
  assert.equal(reopenedPresentation.slides[0].body, 'Original');
  assert.equal(reopenedSession.redo(reopenedPresentation), true);
  assert.equal(reopenedPresentation.slides[0].body, 'Revised');
});

test('Decks does not restore saved history onto a different imported presentation', () => {
  const { createHistory } = require('../src/slides-service');
  const original = { slides: [{ title: 'Old deck', body: 'Old text', notes: '' }], current: 0 };
  const oldSession = createHistory(original);
  updateSlide(original, 0, { body: 'Edited old text' });
  oldSession.commit(original);

  const imported = { slides: [{ title: 'New deck', body: 'New text', notes: '' }], current: 0 };
  const newSession = createHistory(imported, { state: oldSession.exportState() });

  assert.equal(newSession.restored, false);
  assert.equal(newSession.canUndo(), false);
  assert.equal(newSession.undo(imported), false);
  assert.equal(imported.slides[0].body, 'New text');
});

test('Decks preserves redo history when reopening after an undo', () => {
  const { createHistory } = require('../src/slides-service');
  const presentation = { slides: [{ title: 'One', body: '', notes: '' }], current: 0 };
  const firstSession = createHistory(presentation);
  updateSlide(presentation, 0, { title: 'Two' });
  firstSession.commit(presentation);
  firstSession.undo(presentation);

  const reopened = structuredClone(presentation);
  const secondSession = createHistory(reopened, { state: firstSession.exportState() });

  assert.equal(secondSession.restored, true);
  assert.equal(secondSession.canRedo(), true);
  assert.equal(secondSession.redo(reopened), true);
  assert.equal(reopened.slides[0].title, 'Two');
});


test('Decks breaks a grouped typing sequence when the user changes slides', () => {
  const { createHistory } = require('../src/slides-service');
  const presentation = {
    slides: [
      { title: '', body: '', notes: '' },
      { title: '', body: '', notes: '' }
    ],
    current: 0
  };
  const history = createHistory(presentation);

  updateSlide(presentation, 0, { title: 'First' });
  history.commit(presentation, 'slide:0:title', 1000);
  setCurrentSlide(presentation, 1);
  history.sync(presentation);
  updateSlide(presentation, 1, { title: 'Second' });
  history.commit(presentation, 'slide:1:title', 1050);

  assert.equal(history.undo(presentation), true);
  assert.equal(presentation.slides[0].title, 'First');
  assert.equal(presentation.slides[1].title, '');
});

test('Decks reads, writes and clears device-local slide history separately from documents', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');

  assert.match(app, /brightdesk-decks-history-v1/);
  assert.match(app, /localStorage\.getItem\(SLIDE_HISTORY_STORAGE_KEY\)/);
  assert.match(app, /localStorage\.setItem\(SLIDE_HISTORY_STORAGE_KEY/);
  assert.match(app, /localStorage\.removeItem\(SLIDE_HISTORY_STORAGE_KEY\)/);
  assert.match(app, /createHistory\(doc, \{ state: savedState \}\)/);
  assert.match(app, /clearSavedSlideHistory\(\)/);
});


test('Decks keeps existing presentations widescreen when no slide size is stored', () => {
  const presentation = ensurePresentation({
    slides: [{ title: 'Legacy slide', body: 'Legacy content' }],
    current: 0
  });

  assert.equal(presentation.slideSize, 'widescreen');
  assert.equal(presentation.slides[0].body, 'Legacy content');
});

test('Decks accepts supported slide sizes and rejects unsupported sizes', () => {
  const { setSlideSize } = require('../src/slides-service');
  const presentation = { slides: [{ title: 'Welcome', body: 'Hello' }], current: 0 };

  assert.equal(setSlideSize(presentation, 'standard'), 'standard');
  assert.equal(presentation.slideSize, 'standard');
  assert.throws(() => setSlideSize(presentation, 'cinemascope'), RangeError);
  assert.equal(presentation.slideSize, 'standard');
});

test('Decks includes presentation size changes in undo and redo history', () => {
  const { createHistory, setSlideSize } = require('../src/slides-service');
  const presentation = { slides: [{ title: 'Welcome', body: 'Hello' }], current: 0 };
  const history = createHistory(presentation);

  setSlideSize(presentation, 'standard');
  history.commit(presentation);

  assert.equal(presentation.slideSize, 'standard');
  assert.equal(history.undo(presentation), true);
  assert.equal(presentation.slideSize, 'widescreen');
  assert.equal(history.redo(presentation), true);
  assert.equal(presentation.slideSize, 'standard');
});

test('Decks saves and restores slide size in persisted undo history', () => {
  const { createHistory, setSlideSize } = require('../src/slides-service');
  const presentation = { slides: [{ title: 'Welcome', body: 'Hello' }], current: 0 };
  const firstSession = createHistory(presentation);

  setSlideSize(presentation, 'standard');
  firstSession.commit(presentation);
  const reopened = structuredClone(presentation);
  const secondSession = createHistory(reopened, { state: firstSession.exportState() });

  assert.equal(secondSession.restored, true);
  assert.equal(secondSession.undo(reopened), true);
  assert.equal(reopened.slideSize, 'widescreen');
  assert.equal(secondSession.redo(reopened), true);
  assert.equal(reopened.slideSize, 'standard');
});


test('Decks exposes slide size choices in the Design ribbon and applies the ratio to every view', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '..');
  const app = fs.readFileSync(path.join(root, 'src', 'app.js'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');

  assert.match(app, /slide-size-select/);
  assert.match(app, /Widescreen \(16:9\)/);
  assert.match(app, /Standard \(4:3\)/);
  assert.match(app, /setSlideSize\(sizeSelect\.value\)/);
  assert.match(app, /slideSize:doc\.slideSize\|\|'widescreen'/);
  assert.match(app, /size-\$\{doc\.slideSize\}/);
  assert.match(styles, /\.slide-stage\.size-standard/);
  assert.match(styles, /\.slide-sorter-preview\.size-standard/);
  assert.match(styles, /\.presentation-slide\.size-standard/);
});


test('Decks puts the current slide layout control on Home and supports New Slide shortcut', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');

  const homeTab = app.indexOf("if (tab === 'home')", app.indexOf("app === 'slides'"));
  const insertTab = app.indexOf("} else if (tab === 'insert')", homeTab);
  const layoutControl = app.indexOf("const layoutGroup = ribbonGroup(toolbar, 'Layout')", homeTab);
  assert.ok(homeTab >= 0 && layoutControl > homeTab && layoutControl < insertTab, 'layout control belongs to Home ribbon');
  assert.match(app, /event\.shiftKey && event\.key\.toLowerCase\(\) === 'n'/);
  assert.match(app, /addSlide\(\);\s*return;/);
});


test('Decks migrates presentations without sections and preserves existing slide content', () => {
  const { ensurePresentation } = require('../src/slides-service');
  const presentation = ensurePresentation({
    slides: [{ title: 'Old slide', body: 'Do not lose this' }],
    current: 0
  });

  assert.deepEqual(presentation.sections, []);
  assert.equal(presentation.slides[0].title, 'Old slide');
  assert.equal(presentation.slides[0].body, 'Do not lose this');
  assert.equal(presentation.slides[0].sectionId, undefined);
});

test('Decks creates a named section from the selected slide to the next section boundary', () => {
  const { createSection } = require('../src/slides-service');
  const presentation = {
    slides: [
      { title: 'Intro', body: '' },
      { title: 'Overview', body: '' },
      { title: 'Details', body: '' },
      { title: 'Appendix', body: '' }
    ],
    current: 1
  };

  const first = createSection(presentation, 'Main section');
  assert.equal(first.name, 'Main section');
  assert.equal(presentation.slides[0].sectionId, undefined);
  assert.equal(presentation.slides[1].sectionId, first.id);
  assert.equal(presentation.slides[2].sectionId, first.id);
  assert.equal(presentation.slides[3].sectionId, first.id);
});

test('Decks creates a section without absorbing slides from a later named section', () => {
  const { createSection } = require('../src/slides-service');
  const presentation = {
    sections: [{ id: 'appendix', name: 'Appendix' }],
    slides: [
      { title: 'Intro', body: '' },
      { title: 'Main', body: '' },
      { title: 'Appendix', body: '', sectionId: 'appendix' }
    ],
    current: 1
  };

  const section = createSection(presentation, 'Main');
  assert.equal(presentation.slides[1].sectionId, section.id);
  assert.equal(presentation.slides[2].sectionId, 'appendix');
  assert.deepEqual(presentation.sections.map(item => item.name), ['Main', 'Appendix']);
});

test('Decks can rename sections, move slides between sections, and remove a section', () => {
  const { createSection, renameSection, moveSlideToSection, deleteSection } = require('../src/slides-service');
  const presentation = {
    slides: [
      { title: 'One', body: '' },
      { title: 'Two', body: '' },
      { title: 'Three', body: '' }
    ],
    current: 0
  };

  const first = createSection(presentation, 'First');
  presentation.current = 2;
  const second = createSection(presentation, 'Second');
  renameSection(presentation, first.id, 'Opening');
  moveSlideToSection(presentation, 2, first.id);

  assert.equal(presentation.sections.find(item => item.id === first.id).name, 'Opening');
  assert.equal(presentation.slides[2].sectionId, first.id);
  assert.equal(presentation.sections.some(item => item.id === second.id), false);

  deleteSection(presentation, first.id);
  assert.deepEqual(presentation.sections, []);
  assert.ok(presentation.slides.every(slide => slide.sectionId === undefined));
});

test('Decks rejects empty section names and unknown section targets', () => {
  const { createSection, moveSlideToSection, renameSection } = require('../src/slides-service');
  const presentation = { slides: [{ title: 'One', body: '' }], current: 0 };

  assert.throws(() => createSection(presentation, '   '), /section name/);
  assert.throws(() => moveSlideToSection(presentation, 0, 'missing'), /section/);
  assert.throws(() => renameSection(presentation, 'missing', 'Renamed'), /section/);
});

test('Decks includes section metadata in undo and redo snapshots', () => {
  const { createSection, createHistory } = require('../src/slides-service');
  const presentation = {
    slides: [{ title: 'One', body: '' }, { title: 'Two', body: '' }],
    current: 0
  };
  const history = createHistory(presentation);

  const section = createSection(presentation, 'Opening');
  history.commit(presentation);
  assert.equal(presentation.slides[0].sectionId, section.id);
  assert.equal(history.undo(presentation), true);
  assert.deepEqual(presentation.sections, []);
  assert.equal(presentation.slides[0].sectionId, undefined);
  assert.equal(history.redo(presentation), true);
  assert.equal(presentation.slides[0].sectionId, section.id);
});

test('Decks includes section membership when restoring saved undo history', () => {
  const { createSection, createHistory } = require('../src/slides-service');
  const presentation = {
    slides: [{ title: 'One', body: '' }, { title: 'Two', body: '' }],
    current: 0
  };
  const firstHistory = createHistory(presentation);
  createSection(presentation, 'Opening');
  firstHistory.commit(presentation);

  const reopened = JSON.parse(JSON.stringify(presentation));
  const restored = createHistory(reopened, { state: firstHistory.exportState() });
  assert.equal(restored.restored, true);
  assert.equal(restored.undo(reopened), true);
  assert.deepEqual(reopened.sections, []);
  assert.equal(restored.redo(reopened), true);
  assert.equal(reopened.sections[0].name, 'Opening');
});

test('Decks exposes section controls and section headings in both slide views', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');

  assert.match(app, /New Section/);
  assert.match(app, /Rename Section/);
  assert.match(app, /Remove Section/);
  assert.match(app, /moveSlideToSection/);
  assert.match(app, /slide-section-heading/);
  assert.match(app, /slide-sorter-section-heading/);
});



test('Decks can hide and unhide a slide without deleting its content', () => {
  const { setSlideHidden, getVisibleSlideIndices } = require('../src/slides-service');
  const presentation = {
    slides: [
      { title: 'Visible', body: 'Keep me' },
      { title: 'Hidden', body: 'Keep this too' },
      { title: 'Last visible', body: 'Still shown' }
    ],
    current: 0
  };

  assert.equal(setSlideHidden(presentation, 1, true), true);
  assert.deepEqual(getVisibleSlideIndices(presentation), [0, 2]);
  assert.equal(presentation.slides[1].title, 'Hidden');
  assert.equal(presentation.slides[1].body, 'Keep this too');
  assert.equal(setSlideHidden(presentation, 1, false), false);
  assert.deepEqual(getVisibleSlideIndices(presentation), [0, 1, 2]);
});

test('Decks requires at least one visible slide when hiding a slide', () => {
  const { setSlideHidden } = require('../src/slides-service');
  const presentation = {
    slides: [{ title: 'Only visible slide', body: '' }],
    current: 0
  };

  assert.throws(() => setSlideHidden(presentation, 0, true), /at least one visible slide/);
  assert.equal(presentation.slides[0].hidden, undefined);
});

test('Decks rejects non-boolean hidden slide values', () => {
  const { setSlideHidden } = require('../src/slides-service');
  const presentation = { slides: [{ title: 'Slide', body: '' }], current: 0 };

  assert.throws(() => setSlideHidden(presentation, 0, 'yes'), /boolean/);
});

test('Decks includes hidden state in undo, redo and saved history', () => {
  const { setSlideHidden, createHistory } = require('../src/slides-service');
  const presentation = {
    slides: [{ title: 'One', body: '' }, { title: 'Two', body: '' }],
    current: 0
  };
  const history = createHistory(presentation);

  setSlideHidden(presentation, 1, true);
  history.commit(presentation);
  assert.equal(presentation.slides[1].hidden, true);
  assert.equal(history.undo(presentation), true);
  assert.equal(presentation.slides[1].hidden, undefined);
  assert.equal(history.redo(presentation), true);
  assert.equal(presentation.slides[1].hidden, true);

  const reopened = JSON.parse(JSON.stringify(presentation));
  const restored = createHistory(reopened, { state: history.exportState() });
  assert.equal(restored.restored, true);
  assert.equal(restored.undo(reopened), true);
  assert.equal(reopened.slides[1].hidden, undefined);
  assert.equal(restored.redo(reopened), true);
  assert.equal(reopened.slides[1].hidden, true);
});

test('Decks presents only visible slides and starts at the next visible slide when selected slide is hidden', () => {
  const { setSlideHidden, getVisibleSlideIndices } = require('../src/slides-service');
  const presentation = {
    slides: [
      { title: 'First', body: '' },
      { title: 'Hidden second', body: '' },
      { title: 'Visible third', body: '' },
      { title: 'Hidden fourth', body: '' }
    ],
    current: 1
  };
  setSlideHidden(presentation, 1, true);
  setSlideHidden(presentation, 3, true);
  assert.deepEqual(getVisibleSlideIndices(presentation), [0, 2]);
});

test('Decks exposes Hide Slide and hidden-state markers in the editor views', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');

  assert.match(app, /Hide Slide/);
  assert.match(app, /Unhide Slide/);
  assert.match(app, /getVisibleSlideIndices/);
  assert.match(app, /slide-hidden-indicator/);
});


test('Decks slide show supports standard previous, next, first and last slide keys', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');

  for (const key of ['ArrowRight', 'ArrowDown', 'PageDown', 'Enter', ' ', 'ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'Home', 'End']) {
    assert.ok(app.includes(`'${key}'`), `slide show handles ${key || 'Space'}`);
  }
  assert.match(app, /key\.toLowerCase\(\) === 'n'/);
  assert.match(app, /key\.toLowerCase\(\) === 'p'/);
  assert.match(app, /position = 0/);
  assert.match(app, /position = visibleSlides\.length - 1/);
});


test('Decks provides an editable Outline View for titles and slide content', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '..');
  const app = fs.readFileSync(path.join(root, 'src', 'app.js'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');

  assert.match(app, /function renderSlideOutline\(doc\)/);
  assert.match(app, /state\.slideView === 'outline'/);
  assert.match(app, /slide-outline-title/);
  assert.match(app, /slide-outline-body/);
  assert.match(app, /slide-outline-body-secondary/);
  assert.match(app, /hiddenBadge\.textContent = 'Hidden'/);
  assert.match(app, /getSlideHistory\(doc\)\.sync\(doc\)/);
  assert.match(app, /commitSlideChange\(doc, `slide:\$\{index\}:title`\)/);
  assert.match(app, /setCurrentSlide\(doc, index\)/);
  assert.match(app, /Outline View/);
  assert.match(styles, /\.slide-outline-list/);
  assert.match(styles, /\.slide-outline-entry/);
});


test('Decks resolves one-based slide numbers only to visible presentation slides', () => {
  const { getVisibleSlidePosition } = require('../src/slides-service');
  const presentation = {
    slides: [
      { title: 'First', body: '' },
      { title: 'Hidden second', body: '', hidden: true },
      { title: 'Third', body: '' },
      { title: 'Hidden fourth', body: '', hidden: true }
    ],
    current: 0
  };

  assert.equal(getVisibleSlidePosition(presentation, 1), 0);
  assert.equal(getVisibleSlidePosition(presentation, 2), -1);
  assert.equal(getVisibleSlidePosition(presentation, 3), 1);
  assert.equal(getVisibleSlidePosition(presentation, 4), -1);
  assert.equal(getVisibleSlidePosition(presentation, 0), -1);
  assert.equal(getVisibleSlidePosition(presentation, 5), -1);
  assert.equal(getVisibleSlidePosition(presentation, '3'), -1);
});

test('Decks slide show supports blank screens, numeric navigation and slide picker', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '..', 'src', 'styles.css'), 'utf8');

  assert.match(app, /let numberBuffer = ''/);
  assert.match(app, /const togglePresentationBlank =/);
  assert.match(app, /const showSlidePicker =/);
  assert.match(app, /getVisibleSlidePosition\(d, requestedSlide\)/);
  assert.match(app, /const requestedSlide = Number\(numberBuffer\)/);
  assert.match(app, /normalized === 'b'/);
  assert.match(app, /normalized === 'w'/);
  assert.match(app, /normalized === 'g'/);
  assert.match(app, /presentation-slide-picker/);
  assert.match(app, /numberBuffer/);
  assert.match(app, /let showMessage = ''/);
  assert.match(app, /is hidden or doesn't exist/);
  assert.match(styles, /\.presentation-overlay\.is-blank-black/);
  assert.match(styles, /\.presentation-overlay\.is-blank-white/);
  assert.match(styles, /\.presentation-slide-picker/);
});


test('Decks presentation playback renders all four layouts and keeps comparison content', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '..');
  const app = fs.readFileSync(path.join(root, 'src', 'app.js'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');

  assert.match(app, /presentation-content-columns/);
  assert.match(app, /presentation-body-secondary/);
  assert.match(app, /secondaryBody\.textContent = currentSlide\.bodySecondary/);
  assert.match(app, /layout-\$\{currentSlide\.layout/);
  assert.match(styles, /\.presentation-slide\.layout-title/);
  assert.match(styles, /\.presentation-slide\.layout-section-header/);
  assert.match(styles, /\.presentation-slide\.layout-two-content/);
  assert.match(styles, /\.presentation-content-columns/);
  assert.match(styles, /\.presentation-slide\.theme-midnight/);
  assert.match(styles, /\.presentation-slide\.theme-paper/);
});


test('Decks assigns stable unique IDs to legacy slides and preserves them during normalization', () => {
  const presentation = ensurePresentation({
    slides: [
      { title: 'Opening', body: 'Introduction' },
      { title: 'Plan', body: 'Next steps' }
    ],
    current: 0
  });
  const firstIds = presentation.slides.map(slide => slide.id);

  assert.equal(firstIds.length, 2);
  assert.ok(firstIds.every(id => typeof id === 'string' && id.startsWith('slide-')));
  assert.equal(new Set(firstIds).size, 2);

  ensurePresentation(presentation);
  assert.deepEqual(presentation.slides.map(slide => slide.id), firstIds);
});

test('Decks repairs invalid and duplicate stored slide IDs without changing slide content', () => {
  const presentation = ensurePresentation({
    slides: [
      { id: 'stable-slide', title: 'First', body: 'Keep this' },
      { id: 'stable-slide', title: 'Second', body: 'Keep that' },
      { id: 'not a safe id', title: 'Third', body: 'Keep more' }
    ],
    current: 0
  });

  assert.equal(presentation.slides[0].id, 'stable-slide');
  assert.equal(new Set(presentation.slides.map(slide => slide.id)).size, 3);
  assert.deepEqual(presentation.slides.map(({ title, body }) => ({ title, body })), [
    { title: 'First', body: 'Keep this' },
    { title: 'Second', body: 'Keep that' },
    { title: 'Third', body: 'Keep more' }
  ]);
});

test('Decks gives new and duplicated slides distinct IDs', () => {
  const presentation = ensurePresentation({
    slides: [{ title: 'Original', body: 'Content' }],
    current: 0
  });
  const originalId = presentation.slides[0].id;

  const added = addSlide(presentation, { title: 'Added', body: 'New content', id: originalId });
  const addedId = added.id;
  const duplicated = duplicateSlide(presentation, 0);

  assert.ok(addedId);
  assert.notEqual(addedId, originalId);
  assert.ok(duplicated.id);
  assert.notEqual(duplicated.id, originalId);
  assert.notEqual(duplicated.id, addedId);
  assert.equal(new Set(presentation.slides.map(slide => slide.id)).size, 3);
});

test('Decks preserves stable slide IDs when reordering the presentation', () => {
  const presentation = ensurePresentation({
    slides: [
      { id: 'slide-one', title: 'One', body: '' },
      { id: 'slide-two', title: 'Two', body: '' },
      { id: 'slide-three', title: 'Three', body: '' }
    ],
    current: 1
  });

  moveSlide(presentation, 1, 2);

  assert.deepEqual(presentation.slides.map(slide => slide.id), ['slide-one', 'slide-three', 'slide-two']);
  assert.equal(presentation.slides[presentation.current].id, 'slide-two');
});


test('Decks presenter snapshot pairs the current slide with the next visible slide and its notes', () => {
  const presentation = ensurePresentation({
    slides: [
      { title: 'Opening', notes: 'Pause for the welcome.' },
      { title: 'Hidden detail', notes: 'Never show this slide.', hidden: true },
      { title: 'Compare options', body: 'Option A', bodySecondary: 'Option B', notes: 'Explain the difference.', layout: 'two-content' },
      { title: 'Close', notes: 'Thank everyone.' }
    ],
    current: 0
  });

  const opening = getPresenterSnapshot(presentation, 0);
  assert.equal(opening.visiblePosition, 0);
  assert.equal(opening.visibleCount, 3);
  assert.equal(opening.currentIndex, 0);
  assert.equal(opening.currentSlide.notes, 'Pause for the welcome.');
  assert.equal(opening.nextIndex, 2);
  assert.equal(opening.nextSlide.title, 'Compare options');
  assert.equal(opening.nextSlide.bodySecondary, 'Option B');
  assert.notEqual(opening.currentSlide, presentation.slides[0]);

  const closing = getPresenterSnapshot(presentation, 2);
  assert.equal(closing.currentSlide.title, 'Close');
  assert.equal(closing.nextSlide, null);
  assert.equal(closing.nextIndex, null);
  assert.throws(() => getPresenterSnapshot(presentation, 3), RangeError);
});


test('Decks keeps stable slide IDs through undo and redo of duplication and reordering', () => {
  const presentation = ensurePresentation({
    slides: [
      { id: 'slide-opening', title: 'Opening', body: '' },
      { id: 'slide-agenda', title: 'Agenda', body: '' }
    ],
    current: 0
  });
  const history = createHistory(presentation);
  const originalIds = presentation.slides.map(slide => slide.id);

  const duplicate = duplicateSlide(presentation, 0);
  const duplicateId = duplicate.id;
  history.commit(presentation);

  assert.notEqual(duplicateId, originalIds[0]);
  assert.deepEqual(presentation.slides.map(slide => slide.id), [
    originalIds[0], duplicateId, originalIds[1]
  ]);

  assert.equal(history.undo(presentation), true);
  assert.deepEqual(presentation.slides.map(slide => slide.id), originalIds);

  assert.equal(history.redo(presentation), true);
  assert.deepEqual(presentation.slides.map(slide => slide.id), [
    originalIds[0], duplicateId, originalIds[1]
  ]);

  moveSlide(presentation, 0, 2);
  history.commit(presentation);
  assert.deepEqual(presentation.slides.map(slide => slide.id), [
    duplicateId, originalIds[1], originalIds[0]
  ]);
  assert.equal(history.undo(presentation), true);
  assert.deepEqual(presentation.slides.map(slide => slide.id), [
    originalIds[0], duplicateId, originalIds[1]
  ]);
  assert.equal(history.redo(presentation), true);
  assert.deepEqual(presentation.slides.map(slide => slide.id), [
    duplicateId, originalIds[1], originalIds[0]
  ]);
});


test('Decks defaults legacy presentations to the lavender theme and keeps the selected theme', () => {
  const presentation = ensurePresentation({
    slides: [{ title: 'Legacy', body: 'Existing text' }],
    current: 0
  });
  assert.equal(presentation.themeId, 'lavender');

  setSlideTheme(presentation, 'midnight');
  assert.equal(presentation.themeId, 'midnight');

  ensurePresentation(presentation);
  assert.equal(presentation.themeId, 'midnight');
});

test('Decks rejects unknown presentation themes', () => {
  const presentation = ensurePresentation({ slides: [{ title: 'Slide', body: '' }] });
  assert.throws(() => setSlideTheme(presentation, 'ultraviolet'), RangeError);
  assert.equal(presentation.themeId, 'lavender');
});

test('Decks includes theme selection in undo, redo and saved history', () => {
  const presentation = ensurePresentation({ slides: [{ title: 'Slide', body: '' }] });
  const history = createHistory(presentation);

  setSlideTheme(presentation, 'midnight');
  history.commit(presentation);
  assert.equal(presentation.themeId, 'midnight');

  assert.equal(history.undo(presentation), true);
  assert.equal(presentation.themeId, 'lavender');

  assert.equal(history.redo(presentation), true);
  assert.equal(presentation.themeId, 'midnight');

  const savedState = history.exportState();
  assert.equal(savedState.current.themeId, 'midnight');
  assert.ok(savedState.past.every(snapshot => typeof snapshot.themeId === 'string'));
});


test('Decks migrates legacy layout names to stable layout IDs and preserves them', () => {
  const presentation = ensurePresentation({
    slides: [
      { title: 'Welcome', body: 'Intro' },
      { title: 'Comparison', body: 'A', bodySecondary: 'B', layout: 'two-content' },
      { title: 'Break', body: 'Section', layout: 'section-header' }
    ]
  });
  const ids = presentation.slides.map(slide => slide.layoutId);

  assert.deepEqual(ids, [
    'layout-title-content',
    'layout-two-content',
    'layout-section-header'
  ]);
  ensurePresentation(presentation);
  assert.deepEqual(presentation.slides.map(slide => slide.layoutId), ids);
});

test('Decks uses a valid layout ID to migrate a slide when its legacy layout name is missing', () => {
  const presentation = ensurePresentation({
    slides: [{ title: 'Comparison', body: 'A', bodySecondary: 'B', layoutId: 'layout-two-content' }]
  });

  assert.equal(presentation.slides[0].layout, 'two-content');
  assert.equal(presentation.slides[0].layoutId, 'layout-two-content');
});

test('Decks keeps legacy layout appearance when a stored layout ID is missing or inconsistent', () => {
  const presentation = ensurePresentation({
    slides: [
      { title: 'Comparison', body: 'A', bodySecondary: 'B', layout: 'two-content' },
      { title: 'Section', body: 'Text', layout: 'section-header', layoutId: 'layout-title' }
    ]
  });

  assert.equal(presentation.slides[0].layoutId, 'layout-two-content');
  assert.equal(presentation.slides[1].layout, 'section-header');
  assert.equal(presentation.slides[1].layoutId, 'layout-section-header');
});

test('Decks changes layout and canonical layout ID together without losing content', () => {
  const presentation = ensurePresentation({
    slides: [{ title: 'Compare', body: 'First', bodySecondary: 'Second', notes: 'Explain both sides.' }]
  });

  setSlideLayout(presentation, 0, 'two-content');

  assert.equal(presentation.slides[0].layout, 'two-content');
  assert.equal(presentation.slides[0].layoutId, 'layout-two-content');
  assert.equal(presentation.slides[0].title, 'Compare');
  assert.equal(presentation.slides[0].body, 'First');
  assert.equal(presentation.slides[0].bodySecondary, 'Second');
  assert.equal(presentation.slides[0].notes, 'Explain both sides.');
});

test('Decks duplicates a slide while preserving its layout ID', () => {
  const presentation = ensurePresentation({
    slides: [{ title: 'Comparison', body: 'Left', bodySecondary: 'Right', layout: 'two-content' }]
  });
  const original = presentation.slides[0];
  const duplicate = duplicateSlide(presentation, 0);

  assert.equal(duplicate.layoutId, original.layoutId);
  assert.notEqual(duplicate.id, original.id);
});


test('Decks treats prototype-like unknown layout IDs as invalid data', () => {
  for (const layoutId of ['toString', 'constructor', '__proto__']) {
    const presentation = ensurePresentation({
      slides: [{ title: 'Safe fallback', body: 'Content', layoutId }]
    });
    assert.equal(presentation.slides[0].layout, 'title-content');
    assert.equal(presentation.slides[0].layoutId, 'layout-title-content');
  }
});


test('Decks saves and clears per-slide solid background colours', () => {
  const presentation = ensurePresentation({
    slides: [{ title: 'Brand', body: 'Background' }]
  });

  setSlideBackgroundColor(presentation, 0, '#1a2b3c');
  assert.equal(presentation.slides[0].backgroundColor, '#1A2B3C');

  setSlideBackgroundColor(presentation, 0, null);
  assert.equal(Object.hasOwn(presentation.slides[0], 'backgroundColor'), false);
});

test('Decks rejects invalid per-slide background colours', () => {
  const presentation = ensurePresentation({ slides: [{ title: 'Brand', body: '' }] });
  for (const value of ['red', '#fff', '#12345G', 'rgb(0,0,0)', '']) {
    assert.throws(() => setSlideBackgroundColor(presentation, 0, value), RangeError);
  }
  assert.equal(presentation.slides[0].backgroundColor, undefined);
});

test('Decks chooses readable text colours for dark and light slide backgrounds', () => {
  assert.equal(getReadableTextColor('#000000'), '#FFFFFF');
  assert.equal(getReadableTextColor('#202B3B'), '#FFFFFF');
  assert.equal(getReadableTextColor('#FFFFFF'), '#000000');
  assert.equal(getReadableTextColor('#F3EBDD'), '#000000');
});


test('Decks defines helpful placeholder labels for each built-in slide layout', () => {
  const layouts = ['title', 'title-content', 'two-content', 'section-header'];
  const definitions = layouts.map(layout => getSlideLayoutDefinition(layout));

  assert.deepEqual(definitions.map(item => item.id), [
    'layout-title',
    'layout-title-content',
    'layout-two-content',
    'layout-section-header'
  ]);
  assert.deepEqual(definitions.map(item => item.titlePlaceholder), [
    'Add a presentation title',
    'Add a slide title',
    'Add a comparison title',
    'Add a section title'
  ]);
  assert.deepEqual(definitions.map(item => item.bodyPlaceholder), [
    'Add a subtitle',
    'Add your content',
    'Add first-column content',
    'Add a short introduction'
  ]);
  assert.equal(definitions[0].secondaryBodyPlaceholder, null);
  assert.equal(definitions[1].secondaryBodyPlaceholder, null);
  assert.equal(definitions[2].secondaryBodyPlaceholder, 'Add second-column content');
  assert.equal(definitions[3].secondaryBodyPlaceholder, null);
  assert.throws(() => getSlideLayoutDefinition('unknown-layout'), RangeError);
});

test('Decks resets the selected layout structure without clearing slide content or metadata', () => {
  const presentation = ensurePresentation({
    sections: [{ id: 'section-main', name: 'Main section' }],
    slides: [{
      id: 'slide-comparison',
      title: 'Options',
      body: 'First option',
      bodySecondary: 'Second option',
      notes: 'Explain the comparison.',
      layout: 'two-content',
      sectionId: 'section-main',
      hidden: true,
      backgroundColor: '#1A2B3C'
    }],
    current: 0
  });
  presentation.slides[0].layoutId = 'obsolete-layout-id';

  const reset = resetSlideLayout(presentation, 0);

  assert.equal(reset.layout, 'two-content');
  assert.equal(reset.layoutId, 'layout-two-content');
  assert.equal(reset.id, 'slide-comparison');
  assert.equal(reset.title, 'Options');
  assert.equal(reset.body, 'First option');
  assert.equal(reset.bodySecondary, 'Second option');
  assert.equal(reset.notes, 'Explain the comparison.');
  assert.equal(reset.sectionId, 'section-main');
  assert.equal(reset.hidden, true);
  assert.equal(reset.backgroundColor, '#1A2B3C');
  assert.throws(() => resetSlideLayout(presentation, 1), RangeError);
});


test('Decks chooses black text near the luminance boundary to meet normal text contrast', () => {
  assert.equal(getReadableTextColor('#777777'), '#000000');
});


test('Decks initializes legacy slides with an empty structured object collection', () => {
  const presentation = ensurePresentation({
    slides: [{ title: 'Legacy slide', body: 'Text only' }]
  });
  assert.deepEqual(presentation.slides[0].objects, []);
});

test('Decks adds editable text boxes and basic vector shapes with stable IDs', () => {
  const presentation = ensurePresentation({ slides: [{ title: 'Objects', body: '' }] });
  const rectangle = addSlideObject(presentation, 0, {
    type: 'rectangle', x: 12, y: 18, width: 32, height: 26,
    fill: '#F3EBDD', stroke: '#26364D', strokeWidth: 2
  });
  const ellipse = addSlideObject(presentation, 0, {
    type: 'ellipse', x: 50, y: 20, width: 20, height: 20
  });
  const line = addSlideObject(presentation, 0, {
    type: 'line', x: 10, y: 70, width: 40, height: 1
  });
  const textBox = addSlideObject(presentation, 0, {
    type: 'text', x: 14, y: 12, width: 55, height: 12,
    text: 'Quarterly results', fontSize: 26, textColor: '#202B3B', bold: true
  });

  assert.equal(new Set(presentation.slides[0].objects.map(object => object.id)).size, 4);
  assert.ok([rectangle, ellipse, line, textBox].every(object => object.id.startsWith('object-')));
  assert.deepEqual(presentation.slides[0].objects.map(object => object.type), [
    'rectangle', 'ellipse', 'line', 'text'
  ]);
  assert.equal(textBox.text, 'Quarterly results');
  assert.equal(rectangle.fill, '#F3EBDD');
});

test('Decks adds a local picture object with its source and original dimensions', () => {
  const presentation = ensurePresentation({ slides: [{ title: 'Pictures', body: '' }] });
  const imageData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==';

  const picture = addSlideObject(presentation, 0, {
    type: 'image',
    imageData,
    imageName: 'team-photo.png',
    imageWidth: 1,
    imageHeight: 1,
    x: 12, y: 18, width: 40, height: 28
  });

  assert.equal(picture.type, 'image');
  assert.equal(picture.imageData, imageData);
  assert.equal(picture.imageName, 'team-photo.png');
  assert.equal(picture.imageWidth, 1600);
  assert.equal(picture.imageHeight, 900);
  assert.equal(presentation.slides[0].objects[0].id, picture.id);
});

test('Decks rejects unsafe picture sources and invalid original dimensions', () => {
  const presentation = ensurePresentation({ slides: [{ title: 'Pictures', body: '' }] });
  const base = {
    type: 'image',
    imageData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB',
    imageName: 'picture.png',
    imageWidth: 1,
    imageHeight: 1
  };

  assert.throws(() => addSlideObject(presentation, 0, base), RangeError);
  assert.throws(() => addSlideObject(presentation, 0, { ...base, imageData: 'https://example.com/picture.png' }), RangeError);
  assert.throws(() => addSlideObject(presentation, 0, { ...base, imageWidth: 0 }), RangeError);
  assert.throws(() => addSlideObject(presentation, 0, { ...base, imageHeight: 50000 }), RangeError);
  assert.equal(presentation.slides[0].objects.length, 0);
});

test('Decks restores saved picture objects by local asset reference', () => {
  const imageAssetId = 'picture-550e8400-e29b-41d4-a716-446655440000.png';
  const presentation = ensurePresentation({
    slides: [{
      title: 'Saved picture',
      body: '',
      objects: [{
        id: 'object-picture',
        type: 'image',
        imageAssetId,
        imageName: 'team-photo.png',
        imageWidth: 1,
        imageHeight: 1,
        x: 10, y: 15, width: 40, height: 30
      }]
    }]
  });

  assert.equal(presentation.slides[0].objects.length, 1);
  assert.equal(presentation.slides[0].objects[0].imageAssetId, imageAssetId);
  assert.equal(presentation.slides[0].objects[0].imageData, undefined);
});

test('Decks hydrates picture data across current, undo and redo history snapshots', () => {
  const imageAssetId = 'picture-550e8400-e29b-41d4-a716-446655440000.png';
  const imageData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==';
  const presentation = ensurePresentation({
    slides: [{
      title: 'Picture slide',
      body: '',
      objects: [{
        id: 'object-picture',
        type: 'image',
        imageAssetId,
        imageName: 'team-photo.png',
        imageWidth: 1,
        imageHeight: 1,
        x: 10, y: 15, width: 40, height: 30
      }]
    }]
  });
  const history = createHistory(presentation);
  updateSlide(presentation, 0, { title: 'Changed title' });
  history.commit(presentation);

  assert.equal(history.hydrateImages(new Map([[imageAssetId, imageData]])), 2);
  const persistedHistory = history.exportState();
  assert.equal(persistedHistory.current.slides[0].objects[0].imageData, undefined);
  assert.equal(persistedHistory.past[0].slides[0].objects[0].imageData, undefined);
  assert.equal(persistedHistory.current.slides[0].objects[0].imageAssetId, imageAssetId);
  assert.equal(persistedHistory.past[0].slides[0].objects[0].imageAssetId, imageAssetId);
  assert.equal(history.undo(presentation), true);
  assert.equal(presentation.slides[0].objects[0].imageData, imageData);
  assert.equal(history.redo(presentation), true);
  assert.equal(presentation.slides[0].objects[0].imageData, imageData);
});

test('Decks updates object geometry and formatting without changing its identity or type', () => {
  const presentation = ensurePresentation({ slides: [{ title: 'Objects', body: '' }] });
  const shape = addSlideObject(presentation, 0, { type: 'rectangle' });
  const updated = updateSlideObject(presentation, 0, shape.id, {
    x: 35, y: 24, width: 40, height: 18,
    fill: '#202B3B', stroke: '#FFFFFF', strokeWidth: 3,
    rotation: 15
  });

  assert.equal(updated.id, shape.id);
  assert.equal(updated.type, 'rectangle');
  assert.equal(updated.x, 35);
  assert.equal(updated.fill, '#202B3B');
  assert.equal(updated.stroke, '#FFFFFF');
  assert.equal(updated.rotation, 15);
});

test('Decks moves an object within slide bounds and rejects positions outside the canvas', () => {
  const presentation = ensurePresentation({ slides: [{ title: 'Objects', body: '' }] });
  const shape = addSlideObject(presentation, 0, { type: 'ellipse', x: 10, y: 12, width: 25, height: 20 });
  const moved = moveSlideObject(presentation, 0, shape.id, 70, 75);
  assert.equal(moved.x, 70);
  assert.equal(moved.y, 75);
  assert.throws(() => moveSlideObject(presentation, 0, shape.id, 80, 85), RangeError);
});

test('Decks rejects unsupported object types, unsafe dimensions and invalid colours', () => {
  const presentation = ensurePresentation({ slides: [{ title: 'Objects', body: '' }] });
  assert.throws(() => addSlideObject(presentation, 0, { type: 'smartart' }), RangeError);
  assert.throws(() => addSlideObject(presentation, 0, { type: 'rectangle', x: -1 }), RangeError);
  assert.throws(() => addSlideObject(presentation, 0, { type: 'rectangle', x: 90, width: 20 }), RangeError);
  assert.throws(() => addSlideObject(presentation, 0, { type: 'rectangle', fill: 'red' }), RangeError);
  assert.throws(() => addSlideObject(presentation, 0, { type: 'text', text: 'x'.repeat(10001) }), RangeError);
  assert.equal(presentation.slides[0].objects.length, 0);
});

test('Decks deletes only the selected slide object', () => {
  const presentation = ensurePresentation({ slides: [{ title: 'Objects', body: '' }] });
  const first = addSlideObject(presentation, 0, { type: 'rectangle' });
  const second = addSlideObject(presentation, 0, { type: 'ellipse' });
  assert.equal(deleteSlideObject(presentation, 0, first.id), true);
  assert.equal(deleteSlideObject(presentation, 0, 'object-missing'), false);
  assert.deepEqual(presentation.slides[0].objects.map(object => object.id), [second.id]);
});

test('Decks changes slide-object stacking order without changing object identity', () => {
  const presentation = ensurePresentation({ slides: [{ title: 'Objects', body: '' }] });
  const back = addSlideObject(presentation, 0, { type: 'rectangle' });
  const middle = addSlideObject(presentation, 0, { type: 'ellipse' });
  const front = addSlideObject(presentation, 0, { type: 'text', text: 'Title' });

  assert.equal(reorderSlideObject(presentation, 0, middle.id, 'backward'), true);
  assert.deepEqual(presentation.slides[0].objects.map(object => object.id), [
    middle.id, back.id, front.id
  ]);

  assert.equal(reorderSlideObject(presentation, 0, middle.id, 'front'), true);
  assert.deepEqual(presentation.slides[0].objects.map(object => object.id), [
    back.id, front.id, middle.id
  ]);

  assert.equal(reorderSlideObject(presentation, 0, middle.id, 'back'), true);
  assert.deepEqual(presentation.slides[0].objects.map(object => object.id), [
    middle.id, back.id, front.id
  ]);

  assert.equal(reorderSlideObject(presentation, 0, back.id, 'forward'), true);
  assert.deepEqual(presentation.slides[0].objects.map(object => object.id), [
    middle.id, front.id, back.id
  ]);
  assert.equal(new Set(presentation.slides[0].objects.map(object => object.id)).size, 3);
});

test('Decks keeps slide objects in place at layer boundaries and rejects invalid moves', () => {
  const presentation = ensurePresentation({ slides: [{ title: 'Objects', body: '' }] });
  const back = addSlideObject(presentation, 0, { type: 'rectangle' });
  const front = addSlideObject(presentation, 0, { type: 'ellipse' });

  assert.equal(reorderSlideObject(presentation, 0, back.id, 'back'), false);
  assert.equal(reorderSlideObject(presentation, 0, front.id, 'front'), false);
  assert.throws(() => reorderSlideObject(presentation, 0, back.id, 'sideways'), RangeError);
  assert.throws(() => reorderSlideObject(presentation, 0, 'object-missing', 'front'), RangeError);
  assert.deepEqual(presentation.slides[0].objects.map(object => object.id), [back.id, front.id]);
});

test('Decks creates new object identities when a slide containing objects is duplicated', () => {
  const presentation = ensurePresentation({ slides: [{ title: 'Objects', body: '' }] });
  const original = addSlideObject(presentation, 0, { type: 'text', text: 'Keep this text' });
  const duplicate = duplicateSlide(presentation, 0);
  assert.equal(duplicate.objects.length, 1);
  assert.notEqual(duplicate.objects[0].id, original.id);
  assert.equal(duplicate.objects[0].text, original.text);
});

test('Decks includes structured objects in undo and redo history', () => {
  const presentation = ensurePresentation({ slides: [{ title: 'Objects', body: '' }] });
  const history = createHistory(presentation);
  const object = addSlideObject(presentation, 0, { type: 'rectangle' });
  history.commit(presentation);
  assert.equal(presentation.slides[0].objects.length, 1);
  assert.equal(history.undo(presentation), true);
  assert.equal(presentation.slides[0].objects.length, 0);
  assert.equal(history.redo(presentation), true);
  assert.equal(presentation.slides[0].objects[0].id, object.id);
});


test('Decks inserts reused slides after the selected slide, preserves supported content and keeps the destination presentation settings', () => {
  const presentation = ensurePresentation({
    slideSize: 'standard',
    themeId: 'midnight',
    slides: [
      { id: 'slide-before', title: 'Before', body: 'First' },
      { id: 'slide-selected', title: 'Selected', body: 'Current' },
      { id: 'slide-after', title: 'After', body: 'Last' }
    ],
    current: 1
  });
  const importedSlides = [
    {
      id: 'slide-before',
      title: 'Reused comparison',
      body: 'Left column',
      bodySecondary: 'Right column',
      notes: 'Explain the comparison.',
      layout: 'two-content',
      backgroundColor: '#182A3A',
      hidden: true,
      objects: [{
        id: 'object-source',
        type: 'rectangle',
        x: 10, y: 15, width: 30, height: 20,
        fill: '#F3EBDD', stroke: '#26364D', strokeWidth: 1,
        text: '', fontSize: 20, textColor: '#26364D', bold: false, rotation: 0
      }]
    },
    {
      title: 'Reused close',
      body: 'Thank you',
      notes: 'Invite questions.',
      layout: 'title'
    }
  ];
  const sourceBefore = JSON.parse(JSON.stringify(importedSlides));

  const result = insertSlidesAfterCurrent(presentation, importedSlides);

  assert.deepEqual(presentation.slides.map(slide => slide.title), [
    'Before', 'Selected', 'Reused comparison', 'Reused close', 'After'
  ]);
  assert.equal(result.count, 2);
  assert.equal(result.firstIndex, 2);
  assert.equal(result.lastIndex, 3);
  assert.equal(presentation.current, 2);
  assert.equal(presentation.slideSize, 'standard');
  assert.equal(presentation.themeId, 'midnight');
  assert.equal(presentation.slides[2].layout, 'two-content');
  assert.equal(presentation.slides[2].bodySecondary, 'Right column');
  assert.equal(presentation.slides[2].notes, 'Explain the comparison.');
  assert.equal(presentation.slides[2].backgroundColor, '#182A3A');
  assert.equal(presentation.slides[2].hidden, true);
  assert.equal(presentation.slides[2].objects.length, 1);
  assert.notEqual(presentation.slides[2].id, 'slide-before');
  assert.notEqual(presentation.slides[2].objects[0], importedSlides[0].objects[0]);
  assert.equal(presentation.slides[3].layout, 'title');
  assert.notDeepEqual(presentation.slides[2], importedSlides[0]);
  assert.deepEqual(importedSlides, sourceBefore);
});

test('Decks rejects empty or malformed reused slide collections without changing the deck', () => {
  const presentation = ensurePresentation({
    slides: [{ title: 'Keep this', body: 'Current content' }],
    current: 0
  });
  const before = JSON.parse(JSON.stringify(presentation));

  assert.throws(() => insertSlidesAfterCurrent(presentation, []), /at least one slide/i);
  assert.throws(() => insertSlidesAfterCurrent(presentation, [null]), /valid slide collection/i);
  assert.deepEqual(presentation, before);
});

test('Decks refuses to reuse slides beyond the 2,000-slide presentation limit', () => {
  const presentation = ensurePresentation({
    slides: Array.from({ length: 2000 }, (_, index) => ({
      id: 'slide-existing-' + index,
      title: 'Existing ' + index,
      body: ''
    })),
    current: 0
  });
  const beforeIds = presentation.slides.map(slide => slide.id);

  assert.throws(
    () => insertSlidesAfterCurrent(presentation, [{ title: 'Over the limit', body: '' }]),
    /2,000-slide limit/i
  );
  assert.deepEqual(presentation.slides.map(slide => slide.id), beforeIds);
  assert.equal(presentation.slides.length, 2000);
  assert.equal(presentation.current, 0);
});


test('Decks assigns supported slide transitions and defaults legacy slides to none', () => {
  const presentation = ensurePresentation({
    slides: [
      { title: 'Legacy slide', body: '' },
      { title: 'Transition slide', body: '', transition: 'fade' }
    ]
  });

  assert.equal(presentation.slides[0].transition, 'none');
  assert.equal(presentation.slides[1].transition, 'fade');

  setSlideTransition(presentation, 0, 'wipe');
  assert.equal(presentation.slides[0].transition, 'wipe');
  assert.equal(setSlideTransition(presentation, 1, 'none'), 'none');
  assert.equal(presentation.slides[1].transition, 'none');
});

test('Decks rejects unsupported slide transition names without changing the saved value', () => {
  const presentation = ensurePresentation({
    slides: [{ title: 'Transition', body: '', transition: 'fade' }]
  });

  assert.throws(() => setSlideTransition(presentation, 0, 'morph'), RangeError);
  assert.equal(presentation.slides[0].transition, 'fade');
});

test('Decks includes slide transitions in undo and redo history', () => {
  const presentation = ensurePresentation({
    slides: [{ title: 'Transition', body: '', transition: 'none' }]
  });
  const history = createHistory(presentation);

  setSlideTransition(presentation, 0, 'push');
  history.commit(presentation);
  assert.equal(presentation.slides[0].transition, 'push');

  assert.equal(history.undo(presentation), true);
  assert.equal(presentation.slides[0].transition, 'none');
  assert.equal(history.redo(presentation), true);
  assert.equal(presentation.slides[0].transition, 'push');
});
