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

  assert.deepEqual(moved, { title: 'Two', body: 'Content', bodySecondary: '', notes: 'Speaker notes', layout: 'title-content' });
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

