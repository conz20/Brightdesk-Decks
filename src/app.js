const $ = (id) => document.getElementById(id);
const t = (key) => window.BrightdeskI18n.t(key);
const defaults = {
  pages: { title: 'Untitled document', html: '' },
  sheets: { title: 'Untitled spreadsheet', cells: Array.from({ length: 20 }, () => Array(12).fill('')) },
  slides: { title: 'Untitled presentation', slides: [{ title: 'Your presentation title', body: 'Add a subtitle or a few words to introduce your idea.' }], current: 0 },
  notes: { title: 'Untitled note', text: '' },
  todo: { title: 'My tasks', tasks: [] },
  lists: { title: 'My lists', lists: [] },
  forms: { title: 'My forms' },
  planner: { title: 'My plans' },
  database: { title: 'My database' },
  loop: { title: 'My workspace' }
};
const configs = {
  pages: { title: 'Brightdesk Pages', heading: 'Make room for your ideas.', desc: 'Write letters, reports and documents.' },
  sheets: { title: 'Brightdesk Sheets', heading: 'Make numbers make sense.', desc: 'Organise information, use formulas and build tables.' },
  slides: { title: 'Brightdesk Decks', heading: 'Bring your ideas to life.', desc: 'Build a presentation one slide at a time.' },
  notes: { title: 'Brightdesk Notes', heading: 'Catch that thought.', desc: 'Keep quick notes and reminders together.' },
  todo: { title: 'Brightdesk To Do', heading: 'Make time for what matters.', desc: 'Plan your day, keep track of tasks and celebrate what you finish.' },
  lists: { title: 'Brightdesk Lists', heading: 'Track the details that matter.', desc: 'Create structured lists, custom columns and records.' },
  forms: { title: 'Brightdesk Forms', heading: 'Ask. Collect. Understand.', desc: 'Create forms and surveys, then review responses.' },
  planner: { title: 'Brightdesk Planner', heading: 'Turn plans into progress.', desc: 'Organise work into buckets, tasks and priorities.' },
  database: { title: 'Brightdesk Database', heading: 'Give your information structure.', desc: 'Build tables, define fields and manage records on your device.' },
  loop: { title: 'Brightdesk Workspace', heading: 'Bring your work together.', desc: 'Create pages, notes, checklists and project information in one place.' }
};
const genericConfigs = Object.fromEntries((window.BrightdeskAppCatalog || []).filter(item => !['pages','sheets','slides','notes'].includes(item.id)).map(item => [item.id, { title: item.name, heading: item.name, desc: item.description }]));
const fullCatalog = window.BrightdeskAppCatalog || [];
const launchAppId = window.brightdesk.launchAppId || null;
const catalog = fullCatalog;
const installableCatalog = catalog.filter(item => item.availability === 'available');
const state = {
  app: launchAppId || 'pages', view: 'workspace', docs: structuredClone(defaults),
  todoView: 'my-day', todoQuery: '',
  selectedCell: { row: 0, col: 0 }, update: null, ribbonTab: 'home',
  installedApps: [], setupComplete: false, firstRunSelection: new Set(installableCatalog.map(item => item.id)),
  slideView: 'normal', collapsedSlideSections: new Set(), selectedSlideObjectId: null, focusMode: false, editorZoom: 100, sheetZoom: 100,
  languageCatalog: [], installedLanguagePacks: [], spellCheckerLanguages: [], usesNativeMacSpellChecker: false,
  displayLanguage: 'en-AU', proofingLanguage: 'en-AU',
  installedDictionaries: [], dictionaryCatalogue: [], selectedDictionary: localStorage.getItem('brightdesk-selected-dictionary') || ''
};
const editor = $('editor'), sheetWrap = $('sheet-wrap'), slideWrap = $('slide-wrap'), notesWrap = $('notes-wrap');
const slideHistories = new WeakMap();
const SLIDE_HISTORY_STORAGE_KEY = 'brightdesk-decks-history-v1';
const pageLayout = window.BrightdeskPageLayout;
const commonJsonStorage = window.BrightdeskCommonLibs;
if (!commonJsonStorage) throw new Error('Brightdesk common storage helper was not loaded.');

function clone(value) { return commonJsonStorage.cloneJsonValue(value); }
function activeDoc() { return state.docs[state.app]; }
function readSavedSlideHistory() {
  try {
    const raw = localStorage.getItem(SLIDE_HISTORY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn('Saved slide history could not be read.', error);
    return null;
  }
}
function writeSavedSlideHistory(doc) {
  if (doc !== state.docs.slides) return;
  const history = slideHistories.get(doc);
  if (!history) return;
  try {
    localStorage.setItem(SLIDE_HISTORY_STORAGE_KEY, JSON.stringify(history.exportState()));
  } catch (error) {
    console.warn('Slide history could not be saved on this device.', error);
  }
}
function clearSavedSlideHistory() {
  slideHistories.delete(state.docs.slides);
  try {
    localStorage.removeItem(SLIDE_HISTORY_STORAGE_KEY);
  } catch (error) {
    console.warn('Old slide history could not be cleared.', error);
  }
}
function getSlideHistory(doc = activeDoc()) {
  let history = slideHistories.get(doc);
  if (!history) {
    const savedState = doc === state.docs.slides ? readSavedSlideHistory() : null;
    history = window.BrightdeskSlidesService.createHistory(doc, { state: savedState });
    slideHistories.set(doc, history);
    if (savedState && !history.restored) {
      try { localStorage.removeItem(SLIDE_HISTORY_STORAGE_KEY); }
      catch (error) { console.warn('Stale slide history could not be cleared.', error); }
    }
  }
  return history;
}
function refreshSlideHistoryControls() {
  if (state.app !== 'slides') return;
  const history = getSlideHistory(activeDoc());
  const undo = document.querySelector('[data-slide-undo]');
  const redo = document.querySelector('[data-slide-redo]');
  if (undo) undo.disabled = !history.canUndo();
  if (redo) redo.disabled = !history.canRedo();
}
function commitSlideChange(doc = activeDoc(), group = null) {
  getSlideHistory(doc).commit(doc, group);
  refreshSlideHistoryControls();
}
function applySlideHistory(direction) {
  const doc = activeDoc();
  const history = getSlideHistory(doc);
  const changed = direction === 'undo' ? history.undo(doc) : history.redo(doc);
  if (!changed) return false;
  renderSlides();
  renderToolbar();
  persist();
  setStatus(direction === 'undo' ? 'Slide change undone' : 'Slide change redone');
  return true;
}
function undoSlideEdit() { return applySlideHistory('undo'); }
function redoSlideEdit() { return applySlideHistory('redo'); }
function setStatus(message) { $('save-status').textContent = message; }
function persist() {
  try {
    commonJsonStorage.writeJsonValue(localStorage, 'brightdesk-docs-v3', state.docs);
    if (state.app === 'slides') writeSavedSlideHistory(state.docs.slides);
    setStatus('Saved on this device');
  } catch (error) {
    setStatus('Could not save locally');
    console.error(error);
  }
}
function loadLocal() {
  try {
    const stored = commonJsonStorage.readJsonValue(localStorage, 'brightdesk-docs-v3', { fallbackKeys: ['brightdesk-docs-v2'], fallbackValue: null });
    if (stored && typeof stored === 'object') state.docs = { ...clone(defaults), ...stored };
    const appSetup = commonJsonStorage.readJsonValue(localStorage, 'brightdesk-app-setup-v1', { fallbackValue: null });
    if (appSetup && Array.isArray(appSetup.installedApps)) {
      state.installedApps = launchAppId ? [launchAppId] : appSetup.installedApps.filter(id => installableCatalog.some(item => item.id === id));
      state.setupComplete = launchAppId ? true : appSetup.setupComplete === true && state.installedApps.length > 0;
    } else {
      // Fresh installs start with every app that is already bundled in Brightdesk.
      // Users should not have to complete a second app-selection wizard after setup.
      state.installedApps = launchAppId ? [launchAppId] : installableCatalog.map(item => item.id);
      state.setupComplete = state.installedApps.length > 0;
      if (!launchAppId) saveAppSetup();
    }
    if (launchAppId) { state.app = launchAppId; state.view = 'workspace'; }
    else if (!state.setupComplete) state.view = 'manager';
    else if (!installedApp(state.app)) state.app = state.installedApps[0] || 'pages';
    state.displayLanguage = localStorage.getItem('brightdesk-display-language') || 'en-AU';
    state.proofingLanguage = localStorage.getItem('brightdesk-proofing-language') || state.displayLanguage;
  } catch (error) { console.warn('Local project or app settings could not be read.', error); state.view = 'manager'; }
}
function saveAppSetup() {
  commonJsonStorage.writeJsonValue(localStorage, 'brightdesk-app-setup-v1', { installedApps: state.installedApps, setupComplete: state.setupComplete });
}
function installedApp(id) { return state.installedApps.includes(id); }
function appLabel(id) { return catalog.find(item => item.id === id)?.name || id; }

function safeHtml(html) {
  const parsed = new DOMParser().parseFromString(String(html || ''), 'text/html');
  const allowed = new Set(['P','DIV','H1','H2','H3','STRONG','B','EM','I','U','UL','OL','LI','BLOCKQUOTE','BR','SPAN','TABLE','THEAD','TBODY','TFOOT','TR','TD','TH','HR']);
  const walk = (node) => {
    [...node.childNodes].forEach(child => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        if (!allowed.has(child.tagName)) { child.replaceWith(document.createTextNode(child.textContent || '')); return; }
        [...child.attributes].forEach(attr => {
          const isCell = child.tagName === 'TD' || child.tagName === 'TH';
          const isSpan = isCell && (attr.name === 'colspan' || attr.name === 'rowspan') && /^[1-9]\d{0,2}$/.test(attr.value) && Number(attr.value) <= 100;
          if (!isSpan) child.removeAttribute(attr.name);
        });
        walk(child);
      } else if (child.nodeType !== Node.TEXT_NODE) child.remove();
    });
  };
  walk(parsed.body); return parsed.body.innerHTML;
}
function letter(n) { let result = ''; for (n++; n > 0; n = Math.floor((n - 1) / 26)) result = String.fromCharCode(65 + (n - 1) % 26) + result; return result; }
function cellRaw(row, col) { return String(activeDoc().cells?.[row]?.[col] ?? ''); }
function cellNumeric(row, col) { return window.BrightdeskFormula.calculateCell(activeDoc().cells || [], row, col); }
function colIndex(label) { return window.BrightdeskFormula.columnIndex(label); }
const ribbonTabs = {
  pages: ['home', 'insert', 'layout', 'review', 'view'],
  sheets: ['home', 'insert', 'formulas', 'data', 'view'],
  slides: ['home', 'insert', 'draw', 'design', 'transitions', 'slideShow', 'view'],
  notes: ['home', 'insert', 'view']
};
function ribbonGroup(toolbar, label) {
  const group = document.createElement('div'); group.className = 'ribbon-group';
  const commands = document.createElement('div'); commands.className = 'ribbon-command-row';
  const caption = document.createElement('span'); caption.className = 'ribbon-group-label'; caption.textContent = label;
  group.append(commands, caption); toolbar.append(group); return commands;
}
function getSelectedSlideObject(doc = activeDoc()) {
  if (state.app !== 'slides' || !state.selectedSlideObjectId) return null;
  const presentation = window.BrightdeskSlidesService.ensurePresentation(doc);
  return presentation.slides[presentation.current]?.objects?.find(object => object.id === state.selectedSlideObjectId) || null;
}
function renderRibbonTabs() {
  const tabs = $('ribbon-tabs'); tabs.innerHTML = '';
  const tabKeys = [...(ribbonTabs[state.app] || ['home'])];
  if (state.app === 'slides' && getSelectedSlideObject()) tabKeys.push('shapeFormat');
  if (state.app === 'slides' && state.ribbonTab === 'shapeFormat' && !tabKeys.includes('shapeFormat')) state.ribbonTab = 'draw';
  tabKeys.forEach(tabKey => {
    const tab = t(`ribbon.${tabKey}`);
    const button = document.createElement('button'); button.className = 'ribbon-tab'; button.textContent = tab;
    button.setAttribute('role', 'tab'); button.setAttribute('aria-selected', String(state.ribbonTab === tabKey));
    button.classList.toggle('active', state.ribbonTab === tabKey);
    button.addEventListener('click', () => { state.ribbonTab = tabKey; renderToolbar(); }); tabs.append(button);
  });
}
function renderToolbar() {
  const toolbar = $('toolbar'); toolbar.innerHTML = ''; renderRibbonTabs();
  const label = (key) => t(`common.${key}`);
  const group = (key) => ribbonGroup(toolbar, label(key));
  const addButton = (container, label, action, title = label) => {
    const button = document.createElement('button'); button.className = 'tool'; button.textContent = label; button.title = title;
    button.addEventListener('click', action); container.append(button); return button;
  };
  const app = state.app, tab = state.ribbonTab;
  if (app === 'pages') {
    if (tab === 'home') {
      const font = group('text');
      [[label('bold'),'bold'],[label('italic'),'italic'],[label('underline'),'underline'],[label('heading1'),'heading'],[label('heading2'),'subheading']].forEach(([label, cmd]) => addButton(font, label, () => {
        editor.focus(); if (cmd === 'heading') document.execCommand('formatBlock', false, 'H1'); else if (cmd === 'subheading') document.execCommand('formatBlock', false, 'H2'); else document.execCommand(cmd); persist();
      }, label));
      const para = group('paragraph');
      addButton(para, label('bullets'), () => { editor.focus(); document.execCommand('insertUnorderedList'); persist(); });
      addButton(para, label('numbering'), () => { editor.focus(); document.execCommand('insertOrderedList'); persist(); });
      addButton(para, label('quote'), () => { editor.focus(); document.execCommand('formatBlock', false, 'BLOCKQUOTE'); persist(); });
      const edit = group('editing');
      addButton(edit, label('undo'), () => { editor.focus(); document.execCommand('undo'); persist(); });
      addButton(edit, label('redo'), () => { editor.focus(); document.execCommand('redo'); persist(); });
      addButton(group('export'), label('pdf'), exportPdf, 'Export as PDF');
    } else if (tab === 'insert') {
      const insert = group('tools');
      addButton(insert, label('table'), () => { editor.focus(); document.execCommand('insertHTML', false, '<table><tbody><tr><td> </td><td> </td></tr><tr><td> </td><td> </td></tr></tbody></table><p></p>'); persist(); });
      addButton(insert, label('horizontalLine'), () => { editor.focus(); document.execCommand('insertHorizontalRule'); persist(); });
      addButton(insert, label('date'), () => { editor.focus(); document.execCommand('insertText', false, new Date().toLocaleDateString()); persist(); });
    } else if (tab === 'layout') {
      const layout = group('paragraph');
      [[label('alignLeft'),'justifyLeft'],[label('centre'),'justifyCenter'],[label('alignRight'),'justifyRight'],[label('justify'),'justifyFull']].forEach(([label, command]) => addButton(layout, label, () => { editor.focus(); document.execCommand(command); persist(); }));
      const page = group('Page setup');
      const addPageSelect = (caption, key, options) => {
        const wrap = document.createElement('label'); wrap.className = 'page-setting'; wrap.textContent = caption;
        const select = document.createElement('select'); select.className = 'page-setting-select'; select.setAttribute('aria-label', caption);
        options.forEach(([value, text]) => { const option = document.createElement('option'); option.value = value; option.textContent = text; select.append(option); });
        const current = pageLayout.normalizePageLayout(activeDoc().pageSettings || {}); select.value = current[key];
        select.addEventListener('change', () => { const next = pageLayout.normalizePageLayout({ ...activeDoc().pageSettings, [key]: select.value }); activeDoc().pageSettings = next; applyPageLayout(); persist(); });
        wrap.append(select); page.append(wrap);
      };
      addPageSelect('Paper', 'size', [['A4','A4'],['Letter','US Letter'],['Legal','US Legal']]);
      addPageSelect('Orientation', 'orientation', [['portrait','Portrait'],['landscape','Landscape']]);
      addPageSelect('Margins', 'margin', [['normal','Normal'],['narrow','Narrow'],['moderate','Moderate'],['wide','Wide']]);
    } else if (tab === 'review') {
      const review = group('proofing');
      addButton(review, label('wordCount'), () => { const count = (editor.innerText.trim().match(/\S+/g) || []).length; setStatus(`${count} ${t('common.words')}`); });
      addButton(review, label('spellCheck'), () => { editor.spellcheck = !editor.spellcheck; setStatus(`Spell check ${editor.spellcheck ? 'on' : 'off'}`); });
    } else {
      const view = group('zoom');
      addButton(view, label('zoomOut'), () => changeEditorZoom(-10)); addButton(view, '100%', () => { state.editorZoom = 100; applyEditorZoom(); }); addButton(view, label('zoomIn'), () => changeEditorZoom(10));
      addButton(view, label('focusMode'), () => { state.focusMode = !state.focusMode; $('workspace').classList.toggle('focus-mode', state.focusMode);
    $('workspace').classList.toggle('todo-mode', isTodo); });
    }
  } else if (app === 'sheets') {
    if (tab === 'home') {
      const cell = group('cell');
      const ref = document.createElement('span'); ref.className = 'cell-ref'; ref.textContent = `${letter(state.selectedCell.col)}${state.selectedCell.row + 1}`; cell.append(ref);
      const formula = document.createElement('input'); formula.id = 'formula-input'; formula.className = 'formula-input'; formula.placeholder = label('enterValue'); formula.value = cellRaw(state.selectedCell.row, state.selectedCell.col);
      formula.addEventListener('change', () => { setCell(state.selectedCell.row, state.selectedCell.col, formula.value); refreshSheetValues(); }); cell.append(formula);
      const grid = group('cells'); addButton(grid, `+ ${label('row')}`, () => addSheetRow()); addButton(grid, `+ ${label('column')}`, () => addSheetColumn());
    } else if (tab === 'insert') {
      const insert = group('tools'); addButton(insert, label('newRow'), addSheetRow); addButton(insert, label('newColumn'), addSheetColumn);
    } else if (tab === 'formulas') {
      const fn = group('functions');
      ['SUM','AVERAGE','MIN','MAX','COUNT'].forEach(name => addButton(fn, name, () => insertColumnFormula(name), `Insert ${name} formula for the selected column`));
    } else if (tab === 'data') {
      const data = group('sort');
      addButton(data, label('sortAZ'), () => sortSheetColumn(false)); addButton(data, label('sortZA'), () => sortSheetColumn(true));
    } else {
      const view = group('zoom');
      addButton(view, label('zoomOut'), () => changeSheetZoom(-10)); addButton(view, `${state.sheetZoom}%`, () => { state.sheetZoom = 100; applySheetZoom(); }); addButton(view, label('zoomIn'), () => changeSheetZoom(10));
    }
  } else if (app === 'slides') {
    if (tab === 'home') {
      const slides = group('slides'); addButton(slides, label('newSlide'), addSlide); addButton(slides, label('reuseSlides'), reuseSlides); addButton(slides, label('duplicate'), duplicateSlide); addButton(slides, label('delete'), deleteSlide);
      const editing = group('editing');
      const history = getSlideHistory(activeDoc());
      const undo = addButton(editing, label('undo'), undoSlideEdit);
      undo.dataset.slideUndo = 'true';
      undo.disabled = !history.canUndo();
      const redo = addButton(editing, label('redo'), redoSlideEdit);
      redo.dataset.slideRedo = 'true';
      redo.disabled = !history.canRedo();

      const layoutGroup = ribbonGroup(toolbar, 'Layout');
      const layoutSelect = document.createElement('select');
      layoutSelect.className = 'slide-layout-select';
      layoutSelect.setAttribute('aria-label', 'Slide layout');
      const layoutOptions = [
        ['title', 'Title slide'],
        ['title-content', 'Title and content'],
        ['two-content', 'Two content'],
        ['section-header', 'Section header']
      ];
      layoutOptions.forEach(([value, text]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = text;
        layoutSelect.append(option);
      });
      const currentSlide = window.BrightdeskSlidesService.ensurePresentation(activeDoc()).slides[activeDoc().current];
      layoutSelect.value = currentSlide.layout;
      layoutSelect.addEventListener('change', () => setSlideLayout(layoutSelect.value));
      layoutGroup.append(layoutSelect);
      addButton(layoutGroup, 'Reset Layout', resetCurrentSlideLayout);

      const sectionGroup = ribbonGroup(toolbar, 'Sections');
      const sectionDoc = window.BrightdeskSlidesService.ensurePresentation(activeDoc());
      const selectedSlide = sectionDoc.slides[sectionDoc.current];
      const selectedSection = sectionDoc.sections.find(section => section.id === selectedSlide.sectionId);
      addButton(sectionGroup, 'New Section', addSlideSection);
      const renameSectionButton = addButton(sectionGroup, 'Rename Section', renameSlideSection);
      renameSectionButton.disabled = !selectedSection;
      const removeSectionButton = addButton(sectionGroup, 'Remove Section', removeSlideSection);
      removeSectionButton.disabled = !selectedSection;
      const sectionSelect = document.createElement('select');
      sectionSelect.className = 'slide-section-select';
      sectionSelect.setAttribute('aria-label', 'Move current slide to section');
      const noSection = document.createElement('option');
      noSection.value = '';
      noSection.textContent = 'No section';
      sectionSelect.append(noSection);
      sectionDoc.sections.forEach(section => {
        const option = document.createElement('option');
        option.value = section.id;
        option.textContent = section.name;
        sectionSelect.append(option);
      });
      sectionSelect.value = selectedSlide.sectionId || '';
      sectionSelect.addEventListener('change', () => moveCurrentSlideToSection(sectionSelect.value || null));
      sectionGroup.append(sectionSelect);
    } else if (tab === 'insert') {
      const insert = group('slideContent');
      addButton(insert, label('titleSlide'), () => addSlideWithLayout('title'));
      addButton(insert, label('textSlide'), () => addSlideWithLayout('title-content'));
      addButton(insert, 'Two content', () => addSlideWithLayout('two-content'));
      addButton(insert, 'Section header', () => addSlideWithLayout('section-header'));
    } else if (tab === 'draw') {
      const shapes = ribbonGroup(toolbar, 'Insert shapes');
      addButton(shapes, 'Text box', () => insertSlideObject('text'));
      addButton(shapes, 'Rectangle', () => insertSlideObject('rectangle'));
      addButton(shapes, 'Ellipse', () => insertSlideObject('ellipse'));
      addButton(shapes, 'Line', () => insertSlideObject('line'));
      const selection = ribbonGroup(toolbar, 'Selection');
      const selected = getSelectedSlideObject();
      const remove = addButton(selection, 'Delete selected', deleteSelectedSlideObject);
      remove.disabled = !selected;
      const clear = addButton(selection, 'Deselect', () => selectSlideObject(null));
      clear.disabled = !selected;
      const count = document.createElement('span');
      count.className = 'slide-object-count';
      const current = window.BrightdeskSlidesService.ensurePresentation(activeDoc()).slides[activeDoc().current];
      count.textContent = `${current.objects?.length || 0} objects`;
      selection.append(count);
    } else if (tab === 'shapeFormat') {
      const object = getSelectedSlideObject();
      if (!object) {
        state.ribbonTab = 'draw';
        renderToolbar();
        return;
      }
      const addColourPicker = (caption, className, value, disabled, patchKey) => {
        const labelElement = document.createElement('label');
        labelElement.className = 'slide-format-control';
        const captionElement = document.createElement('span');
        captionElement.textContent = caption;
        const input = document.createElement('input');
        input.type = 'color';
        input.className = className;
        input.value = value || '#FFFFFF';
        input.disabled = Boolean(disabled);
        input.setAttribute('aria-label', caption);
        input.addEventListener('change', () => updateSelectedSlideObject({ [patchKey]: input.value }));
        labelElement.append(captionElement, input);
        return labelElement;
      };
      const fillGroup = ribbonGroup(toolbar, 'Fill');
      fillGroup.append(addColourPicker('Fill colour', 'slide-object-fill', object.fill, object.type === 'text' || object.type === 'line', 'fill'));
      const outlineGroup = ribbonGroup(toolbar, 'Outline');
      outlineGroup.append(addColourPicker('Outline colour', 'slide-object-outline', object.stroke, false, 'stroke'));
      const widthLabel = document.createElement('label');
      widthLabel.className = 'slide-format-control';
      widthLabel.textContent = 'Weight';
      const widthInput = document.createElement('input');
      widthInput.type = 'number';
      widthInput.min = '0';
      widthInput.max = '12';
      widthInput.step = '0.5';
      widthInput.value = String(object.strokeWidth);
      widthInput.setAttribute('aria-label', 'Outline weight');
      widthInput.addEventListener('change', () => updateSelectedSlideObject({ strokeWidth: Number(widthInput.value) }));
      widthLabel.append(widthInput);
      outlineGroup.append(widthLabel);
      const textGroup = ribbonGroup(toolbar, 'Text');
      textGroup.append(addColourPicker('Text colour', 'slide-object-text-colour', object.textColor, object.type !== 'text', 'textColor'));
      const fontSizeLabel = document.createElement('label');
      fontSizeLabel.className = 'slide-format-control';
      fontSizeLabel.textContent = 'Size';
      const fontSizeInput = document.createElement('input');
      fontSizeInput.type = 'number';
      fontSizeInput.min = '8';
      fontSizeInput.max = '96';
      fontSizeInput.value = String(object.fontSize);
      fontSizeInput.disabled = object.type !== 'text';
      fontSizeInput.setAttribute('aria-label', 'Text size');
      fontSizeInput.addEventListener('change', () => updateSelectedSlideObject({ fontSize: Number(fontSizeInput.value) }));
      fontSizeLabel.append(fontSizeInput);
      textGroup.append(fontSizeLabel);
      const boldButton = addButton(textGroup, object.bold ? 'Bold on' : 'Bold off', () => updateSelectedSlideObject({ bold: !object.bold }));
      boldButton.disabled = object.type !== 'text';
      const deleteGroup = ribbonGroup(toolbar, 'Object');
      addButton(deleteGroup, 'Delete object', deleteSelectedSlideObject);
    } else if (tab === 'transitions') {
      const doc = window.BrightdeskSlidesService.ensurePresentation(activeDoc());
      const currentSlide = doc.slides[doc.current];
      const transitionGroup = ribbonGroup(toolbar, label('transition'));
      const transitionSelect = document.createElement('select');
      transitionSelect.className = 'slide-transition-select';
      transitionSelect.setAttribute('aria-label', 'Slide transition');
      [
        ['none', label('transitionNone')],
        ['fade', label('transitionFade')],
        ['push', label('transitionPush')],
        ['wipe', label('transitionWipe')]
      ].forEach(([value, text]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = text;
        transitionSelect.append(option);
      });
      transitionSelect.value = currentSlide.transition || 'none';
      transitionSelect.addEventListener('change', () => setSlideTransition(transitionSelect.value));
      transitionGroup.append(transitionSelect);
      const hint = document.createElement('span');
      hint.className = 'slide-transition-hint';
      hint.textContent = label('transitionHint');
      transitionGroup.append(hint);
    } else if (tab === 'design') {
      const design = group('themes');
      const presentation = window.BrightdeskSlidesService.ensurePresentation(activeDoc());
      [['Lavender','lavender'],['Midnight','midnight'],['Paper','paper']].forEach(([label, theme]) => {
        const button = addButton(design, label, () => setSlideTheme(theme));
        const selected = presentation.themeId === theme;
        button.setAttribute('aria-pressed', String(selected));
        if (selected) button.classList.add('active');
      });

      const backgroundGroup = group('slideBackground');
      const backgroundLabel = document.createElement('label');
      backgroundLabel.className = 'slide-background-picker';
      const backgroundText = document.createElement('span');
      backgroundText.textContent = label('backgroundColour');
      const backgroundInput = document.createElement('input');
      backgroundInput.type = 'color';
      backgroundInput.className = 'slide-background-colour';
      backgroundInput.value = window.BrightdeskSlidesService.getSlideBackgroundColor(presentation, presentation.current);
      backgroundInput.setAttribute('aria-label', label('backgroundColour'));
      backgroundInput.addEventListener('change', () => setSlideBackgroundColor(backgroundInput.value));
      backgroundLabel.append(backgroundText, backgroundInput);
      backgroundGroup.append(backgroundLabel);
      addButton(backgroundGroup, label('resetBackground'), () => setSlideBackgroundColor(null));

      const sizeGroup = ribbonGroup(toolbar, 'Slide Size');
      const sizeSelect = document.createElement('select');
      sizeSelect.className = 'slide-size-select';
      sizeSelect.setAttribute('aria-label', 'Slide size');
      [
        ['widescreen', 'Widescreen (16:9)'],
        ['standard', 'Standard (4:3)']
      ].forEach(([value, text]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = text;
        sizeSelect.append(option);
      });
      sizeSelect.value = presentation.slideSize;
      sizeSelect.addEventListener('change', () => setSlideSize(sizeSelect.value));
      sizeGroup.append(sizeSelect);
    } else if (tab === 'slideShow') {
      const show = group('startPresentation');
      addButton(show, label('fromCurrentSlide'), () => presentSlides(false));
      addButton(show, 'From first slide', () => presentSlides(true));
      addButton(show, 'Presenter View', () => presentWithPresenterView(false));
      const currentSlide = window.BrightdeskSlidesService.ensurePresentation(activeDoc()).slides[activeDoc().current];
      addButton(show, currentSlide.hidden ? 'Unhide Slide' : 'Hide Slide', toggleSlideHidden);
    } else {
      const view = group('zoom');
      addButton(view, label('fitSlide'), () => { slideWrap.scrollTop = 0; setStatus('Slide fitted to workspace'); });
      addButton(view, label('slideCount'), () => setStatus(`${activeDoc().slides.length} slides`));
      const views = ribbonGroup(toolbar, 'Views');
      [
        ['normal', 'Normal view'],
        ['sorter', 'Slide Sorter'],
        ['outline', 'Outline View']
      ].forEach(([viewName, viewLabel]) => {
        const button = addButton(views, viewLabel, () => setSlideView(viewName));
        button.setAttribute('aria-pressed', String(state.slideView === viewName));
        button.classList.toggle('active', state.slideView === viewName);
      });
    }
  } else if (app === 'notes') {
    if (tab === 'home') {
      const note = group('note'); addButton(note, label('exportNote'), exportCurrent);
      addButton(note, label('clearNote'), () => { if (confirm('Clear this note?')) { $('notes-editor').value = ''; activeDoc().text = ''; persist(); } });
    } else if (tab === 'insert') {
      const insert = group('tools');
      addButton(insert, label('date'), () => insertNoteText(new Date().toLocaleDateString()));
      addButton(insert, label('divider'), () => insertNoteText('\n\n---\n\n'));
      addButton(insert, label('checklistItem'), () => insertNoteText('\n☐ '));
    } else {
      const view = group('zoom'); addButton(view, label('focusMode'), () => { state.focusMode = !state.focusMode; $('workspace').classList.toggle('focus-mode', state.focusMode); });
    }
  } else if (genericConfigs[app]) {
    const tools = group('tools');
    addButton(tools, 'New section', () => { editor.focus(); document.execCommand('insertHTML', false, '<h2>New section</h2><p>Start writing here.</p>'); persist(); });
    addButton(tools, 'Checklist', () => { editor.focus(); document.execCommand('insertHTML', false, '<p>☐ Task</p>'); persist(); });
    addButton(tools, 'Date', () => { editor.focus(); document.execCommand('insertText', false, new Date().toLocaleDateString()); persist(); });
    addButton(tools, 'Export PDF', exportPdf, 'Export the current Brightdesk module document as PDF');
  }
  if (state.installedDictionaries.length) {
    const dictionaryTools = ribbonGroup(toolbar, 'Dictionary');
    addButton(dictionaryTools, 'Check spelling', checkCurrentDocumentSpelling, 'Check this document with the selected open-source dictionary');
  }
}
function addSheetRow() { const cells = activeDoc().cells; cells.push(Array(cells[0]?.length || 12).fill('')); renderSheet(); persist(); }
function addSheetColumn() { activeDoc().cells.forEach(row => row.push('')); renderSheet(); persist(); }
function insertColumnFormula(name) {
  const { row, col } = state.selectedCell; const column = letter(col);
  const start = row > 0 ? 1 : 2; const end = row > 0 ? row : Math.max(6, row + 6);
  const value = `=${name}(${column}${start}:${column}${end})`; setCell(row, col, value); renderSheet();
}
function sortSheetColumn(descending) {
  const col = state.selectedCell.col;
  activeDoc().cells.sort((a, b) => {
    const av = String(a[col] ?? '').toLocaleLowerCase(), bv = String(b[col] ?? '').toLocaleLowerCase();
    const an = Number(av), bn = Number(bv);
    const result = av !== '' && bv !== '' && Number.isFinite(an) && Number.isFinite(bn) ? an - bn : av.localeCompare(bv);
    return descending ? -result : result;
  }); renderSheet(); persist();
}
function applyPageLayout() {
  if (!pageLayout || state.app !== 'pages') return;
  const settings = pageLayout.normalizePageLayout(activeDoc().pageSettings || {});
  activeDoc().pageSettings = settings;
  Object.assign(editor.style, pageLayout.getPageStyle(settings));
  editor.style.maxWidth = 'calc(100% - 40px)';
}
function changeEditorZoom(delta) { state.editorZoom = Math.max(70, Math.min(160, state.editorZoom + delta)); applyEditorZoom(); }
function applyEditorZoom() { editor.style.fontSize = `${14 * state.editorZoom / 100}px`; setStatus(`Document zoom ${state.editorZoom}%`); }
function changeSheetZoom(delta) { state.sheetZoom = Math.max(70, Math.min(160, state.sheetZoom + delta)); applySheetZoom(); }
function applySheetZoom() { sheetWrap.style.zoom = `${state.sheetZoom}%`; setStatus(`Sheet zoom ${state.sheetZoom}%`); }
function insertNoteText(value) { const input = $('notes-editor'); const start = input.selectionStart, end = input.selectionEnd; input.setRangeText(value, start, end, 'end'); activeDoc().text = input.value; persist(); input.focus(); }
function addSlideWithContent(title, body) { const doc = activeDoc(); doc.slides.push({ title, body }); doc.current = doc.slides.length - 1; commitSlideChange(doc); renderSlides(); renderToolbar(); persist(); }
function setSlideTheme(theme) {
  const doc = window.BrightdeskSlidesService.ensurePresentation(activeDoc());
  try {
    window.BrightdeskSlidesService.setSlideTheme(doc, theme);
    commitSlideChange(doc);
    renderSlides();
    renderToolbar();
    persist();
    setStatus(`${theme[0].toUpperCase()}${theme.slice(1)} theme selected`);
  } catch (error) {
    setStatus(error.message);
  }
}
function setSlideBackgroundColor(backgroundColor) {
  const doc = window.BrightdeskSlidesService.ensurePresentation(activeDoc());
  try {
    window.BrightdeskSlidesService.setSlideBackgroundColor(doc, doc.current, backgroundColor);
    commitSlideChange(doc);
    renderSlides();
    renderToolbar();
    persist();
    setStatus(backgroundColor ? 'Slide background updated' : 'Slide background reset to the presentation theme');
  } catch (error) {
    setStatus(error.message);
  }
}

function setSlideTransition(transition) {
  const doc = window.BrightdeskSlidesService.ensurePresentation(activeDoc());
  try {
    window.BrightdeskSlidesService.setSlideTransition(doc, doc.current, transition);
    commitSlideChange(doc);
    renderSlides();
    renderToolbar();
    persist();
    const label = transition === 'none' ? 'No transition' : transition[0].toUpperCase() + transition.slice(1);
    setStatus(`${label} transition selected for this slide`);
  } catch (error) {
    setStatus(error.message);
  }
}
function addSlideWithLayout(layout) {
  const doc = activeDoc();
  const slide = window.BrightdeskSlidesService.addSlide(doc, {
    title: '',
    body: '',
    bodySecondary: '',
    layout
  });
  commitSlideChange(doc);
  renderSlides();
  renderToolbar();
  persist();
  return slide;
}
function setCell(row,col,value) { while (activeDoc().cells.length <= row) activeDoc().cells.push([]); while (activeDoc().cells[row].length <= col) activeDoc().cells[row].push(''); activeDoc().cells[row][col]=value; persist(); }
function refreshSheetValues() {
  sheetWrap.querySelectorAll('input.grid-cell').forEach(input => {
    if (document.activeElement === input) return;
    const row = Number(input.dataset.row), col = Number(input.dataset.col);
    input.value = String(cellNumeric(row, col));
  });
  const formula = $('formula-input');
  if (formula && document.activeElement !== formula) formula.value = cellRaw(state.selectedCell.row, state.selectedCell.col);
}
function renderSheet() {
  const rows = activeDoc().cells || (activeDoc().cells = clone(defaults.sheets.cells));
  const maxCols = Math.max(12, ...rows.map(r=>r.length));
  const table = document.createElement('table'); table.className='sheet';
  const thead = document.createElement('thead'), head = document.createElement('tr'); const corner=document.createElement('th'); corner.textContent=''; head.append(corner);
  for(let c=0;c<maxCols;c++){const th=document.createElement('th');th.textContent=letter(c);head.append(th);} thead.append(head); table.append(thead);
  const tbody=document.createElement('tbody');
  rows.forEach((row,r)=>{const tr=document.createElement('tr'),th=document.createElement('th');th.textContent=String(r+1);tr.append(th);
    for(let c=0;c<maxCols;c++){const td=document.createElement('td'),input=document.createElement('input');input.className='grid-cell';input.value=String(cellNumeric(r,c));input.dataset.row=r;input.dataset.col=c;input.setAttribute('aria-label',`${letter(c)}${r+1}`);input.lang=state.proofingLanguage;
      input.addEventListener('focus',()=>{state.selectedCell={row:r,col:c};renderToolbar();});
      input.addEventListener('change',()=>{setCell(r,c,input.value);refreshSheetValues();});
      input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();setCell(r,c,input.value);const next=sheetWrap.querySelector(`input[data-row="${r+1}"][data-col="${c}"]`);next?.focus();refreshSheetValues();}});td.append(input);tr.append(td);}
    tbody.append(tr);
  }); table.append(tbody); sheetWrap.innerHTML=''; sheetWrap.append(table);
}
function renderSlideOutline(doc) {
  slideWrap.innerHTML = '';
  const slidesService = window.BrightdeskSlidesService;
  const view = document.createElement('section');
  view.className = 'slide-outline-view';
  view.setAttribute('aria-label', 'Presentation outline');

  const header = document.createElement('header');
  header.className = 'slide-outline-header';
  const heading = document.createElement('div');
  const title = document.createElement('h2');
  title.textContent = 'Outline View';
  const description = document.createElement('p');
  description.textContent = 'Edit slide titles and content in one continuous outline.';
  heading.append(title, description);
  const count = document.createElement('span');
  count.className = 'slide-outline-count';
  count.textContent = `${doc.slides.length} slides`;
  header.append(heading, count);

  const list = document.createElement('div');
  list.className = 'slide-outline-list';

  doc.slides.forEach((slide, index) => {
    if (slide.sectionId && (index === 0 || doc.slides[index - 1].sectionId !== slide.sectionId)) {
      const section = doc.sections.find(item => item.id === slide.sectionId);
      if (section) {
        const sectionHeading = document.createElement('div');
        sectionHeading.className = 'slide-outline-section-heading';
        sectionHeading.textContent = section.name;
        list.append(sectionHeading);
      }
    }

    const entry = document.createElement('article');
    entry.className = 'slide-outline-entry';
    entry.classList.toggle('is-hidden-slide', slide.hidden === true);
    entry.dataset.slideIndex = String(index);

    const meta = document.createElement('div');
    meta.className = 'slide-outline-meta';
    const number = document.createElement('span');
    number.className = 'slide-outline-number';
    number.textContent = `Slide ${index + 1}`;
    meta.append(number);

    if (slide.hidden === true) {
      const hiddenBadge = document.createElement('span');
      hiddenBadge.className = 'slide-hidden-indicator';
      hiddenBadge.textContent = 'Hidden';
      meta.append(hiddenBadge);
    }

    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.className = 'slide-outline-open-button';
    openButton.textContent = 'Edit slide';
    openButton.setAttribute('aria-label', `Open slide ${index + 1} in Normal view`);
    openButton.addEventListener('click', () => {
      slidesService.setCurrentSlide(doc, index);
      getSlideHistory(doc).sync(doc);
      setSlideView('normal');
    });
    meta.append(openButton);

    const fields = document.createElement('div');
    fields.className = 'slide-outline-fields';

    const layoutDefinition = slidesService.getSlideLayoutDefinition(slide.layout);
    const titleLabel = document.createElement('label');
    titleLabel.className = 'slide-outline-field';
    const titleCaption = document.createElement('span');
    titleCaption.textContent = layoutDefinition.titleLabel;
    const titleInput = document.createElement('textarea');
    titleInput.className = 'slide-outline-title';
    titleInput.rows = 1;
    titleInput.value = slide.title || '';
    titleInput.placeholder = layoutDefinition.titlePlaceholder;
    titleInput.setAttribute('aria-label', `Slide ${index + 1} title`);
    titleInput.lang = state.proofingLanguage;
    titleInput.addEventListener('input', () => {
      slidesService.updateSlide(doc, index, { title: titleInput.value });
      commitSlideChange(doc, `slide:${index}:title`);
      persist();
    });
    titleLabel.append(titleCaption, titleInput);
    fields.append(titleLabel);

    const contentFields = document.createElement('div');
    contentFields.className = 'slide-outline-content-fields';
    const bodyLabel = document.createElement('label');
    bodyLabel.className = 'slide-outline-field slide-outline-content-field';
    const bodyCaption = document.createElement('span');
    bodyCaption.textContent = layoutDefinition.bodyLabel;
    const bodyInput = document.createElement('textarea');
    bodyInput.className = 'slide-outline-body';
    bodyInput.rows = 3;
    bodyInput.value = slide.body || '';
    bodyInput.placeholder = layoutDefinition.bodyPlaceholder;
    bodyInput.setAttribute('aria-label', `Slide ${index + 1} content`);
    bodyInput.lang = state.proofingLanguage;
    bodyInput.addEventListener('input', () => {
      slidesService.updateSlide(doc, index, { body: bodyInput.value });
      commitSlideChange(doc, `slide:${index}:body`);
      persist();
    });
    bodyLabel.append(bodyCaption, bodyInput);
    contentFields.append(bodyLabel);

    if (slide.layout === 'two-content') {
      const secondaryLabel = document.createElement('label');
      secondaryLabel.className = 'slide-outline-field slide-outline-content-field';
      const secondaryCaption = document.createElement('span');
      secondaryCaption.textContent = layoutDefinition.secondaryBodyLabel || 'Second content column';
      const secondaryInput = document.createElement('textarea');
      secondaryInput.className = 'slide-outline-body slide-outline-body-secondary';
      secondaryInput.rows = 3;
      secondaryInput.value = slide.bodySecondary || '';
      secondaryInput.placeholder = layoutDefinition.secondaryBodyPlaceholder || '';
      secondaryInput.setAttribute('aria-label', `Slide ${index + 1} ${layoutDefinition.secondaryBodyLabel || 'second content column'}`);
      secondaryInput.lang = state.proofingLanguage;
      secondaryInput.addEventListener('input', () => {
        slidesService.updateSlide(doc, index, { bodySecondary: secondaryInput.value });
        commitSlideChange(doc, `slide:${index}:secondary`);
        persist();
      });
      secondaryLabel.append(secondaryCaption, secondaryInput);
      contentFields.append(secondaryLabel);
    }

    fields.append(contentFields);
    entry.append(meta, fields);
    list.append(entry);
  });

  view.append(header, list);
  slideWrap.append(view);
}

function renderSlideSorter(doc) {
  slideWrap.innerHTML = '';
  const view = document.createElement('section');
  view.className = 'slide-sorter-view';
  const header = document.createElement('header');
  header.className = 'slide-sorter-header';
  const heading = document.createElement('div');
  const title = document.createElement('h2');
  title.textContent = 'Slide Sorter';
  const description = document.createElement('p');
  description.textContent = 'Select a slide, change its order, or double-click to edit it.';
  heading.append(title, description);
  const count = document.createElement('span');
  count.className = 'slide-sorter-count';
  count.textContent = `${doc.slides.length} slides`;
  header.append(heading, count);

  const grid = document.createElement('div');
  grid.className = 'slide-sorter-grid';
  let draggedIndex = -1;

  doc.slides.forEach((slide, index) => {
    if (slide.sectionId && (index === 0 || doc.slides[index - 1].sectionId !== slide.sectionId)) {
      const section = doc.sections.find(item => item.id === slide.sectionId);
      if (section) {
        const sectionHeader = document.createElement('div');
        sectionHeader.className = 'slide-sorter-section-heading';
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.textContent = state.collapsedSlideSections.has(section.id) ? '▸' : '▾';
        toggle.setAttribute('aria-label', `${state.collapsedSlideSections.has(section.id) ? 'Expand' : 'Collapse'} section ${section.name}`);
        const name = document.createElement('strong');
        name.textContent = section.name;
        const memberCount = doc.slides.filter(item => item.sectionId === section.id).length;
        const total = document.createElement('small');
        total.textContent = `${memberCount} slides`;
        toggle.append(name, total);
        toggle.addEventListener('click', () => {
          const collapsed = !state.collapsedSlideSections.has(section.id);
          if (collapsed) state.collapsedSlideSections.add(section.id);
          else state.collapsedSlideSections.delete(section.id);
          grid.querySelectorAll('.slide-sorter-card').forEach(item => {
            if (item.dataset.sectionId === section.id) item.hidden = collapsed;
          });
          toggle.firstChild.textContent = collapsed ? '▸' : '▾';
          toggle.setAttribute('aria-label', `${collapsed ? 'Expand' : 'Collapse'} section ${section.name}`);
        });
        sectionHeader.append(toggle);
        grid.append(sectionHeader);
      }
    }

    const card = document.createElement('article');
    card.className = 'slide-sorter-card';
    card.classList.toggle('active', index === doc.current);
    card.classList.toggle('is-hidden-slide', slide.hidden === true);
    card.draggable = true;
    card.dataset.slideIndex = String(index);
    card.dataset.sectionId = slide.sectionId || '';
    card.hidden = Boolean(slide.sectionId && state.collapsedSlideSections.has(slide.sectionId));

    const select = document.createElement('button');
    select.type = 'button';
    select.className = 'slide-sorter-select';
    select.setAttribute('aria-label', `Select slide ${index + 1}: ${slide.title || 'Untitled slide'}${slide.hidden ? ', hidden from slide show' : ''}`);
    select.setAttribute('aria-current', index === doc.current ? 'true' : 'false');
    const number = document.createElement('span');
    number.className = 'slide-sorter-number';
    number.textContent = String(index + 1);
    const preview = document.createElement('span');
    preview.className = `slide-sorter-preview theme-${doc.themeId} layout-${slide.layout} size-${doc.slideSize}`;
    const previewTitle = document.createElement('b');
    previewTitle.textContent = slide.title.trim() || `Slide ${index + 1}`;
    const layoutDefinition = slidesService.getSlideLayoutDefinition(slide.layout);
    const previewBody = document.createElement('span');
    previewBody.textContent = slide.body.trim().slice(0, 120) || layoutDefinition.bodyPlaceholder;
    const previewTextColor = slide.backgroundColor
      ? window.BrightdeskSlidesService.getReadableTextColor(slide.backgroundColor)
      : '';
    preview.style.backgroundColor = slide.backgroundColor || '';
    previewTitle.style.color = previewTextColor;
    previewBody.style.color = previewTextColor;
    preview.append(previewTitle, previewBody);
    if (slide.layout === 'two-content') {
      const second = document.createElement('span');
      second.className = 'slide-sorter-secondary';
      second.textContent = slide.bodySecondary.trim().slice(0, 90) || layoutDefinition.secondaryBodyPlaceholder || 'Second column';
      second.style.color = previewTextColor;
      second.style.backgroundColor = slide.backgroundColor || '';
      preview.append(second);
    }
    select.append(number, preview);
    const sorterTransition = document.createElement('span');
    sorterTransition.className = 'slide-sorter-transition';
    sorterTransition.dataset.slideTransition = slide.transition || 'none';
    sorterTransition.textContent = slide.transition && slide.transition !== 'none'
      ? slide.transition[0].toUpperCase() + slide.transition.slice(1)
      : 'No transition';
    select.append(sorterTransition);
    if (slide.hidden) {
      const hiddenBadge = document.createElement('span');
      hiddenBadge.className = 'slide-hidden-indicator';
      hiddenBadge.textContent = 'Hidden';
      select.append(hiddenBadge);
    }
    select.addEventListener('click', () => {
      window.BrightdeskSlidesService.setCurrentSlide(doc, index);
      getSlideHistory(doc).sync(doc);
      grid.querySelectorAll('.slide-sorter-card').forEach((item, itemIndex) => {
        const active = itemIndex === index;
        item.classList.toggle('active', active);
        item.querySelector('.slide-sorter-select')?.setAttribute('aria-current', String(active));
      });
    });
    select.addEventListener('dblclick', () => setSlideView('normal'));

    const actions = document.createElement('div');
    actions.className = 'slide-sorter-actions';
    const earlier = document.createElement('button');
    earlier.type = 'button';
    earlier.textContent = 'Move earlier';
    earlier.disabled = index === 0;
    earlier.addEventListener('click', () => {
      window.BrightdeskSlidesService.moveSlide(doc, index, index - 1);
      commitSlideChange(doc);
      renderSlides();
      persist();
    });
    const later = document.createElement('button');
    later.type = 'button';
    later.textContent = 'Move later';
    later.disabled = index === doc.slides.length - 1;
    later.addEventListener('click', () => {
      window.BrightdeskSlidesService.moveSlide(doc, index, index + 1);
      commitSlideChange(doc);
      renderSlides();
      persist();
    });
    actions.append(earlier, later);
    card.append(select, actions);

    card.addEventListener('dragstart', event => {
      draggedIndex = index;
      card.classList.add('dragging');
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(index));
      }
    });
    card.addEventListener('dragend', () => {
      draggedIndex = -1;
      card.classList.remove('dragging');
      grid.querySelectorAll('.drag-over').forEach(node => node.classList.remove('drag-over'));
    });
    card.addEventListener('dragover', event => {
      event.preventDefault();
      if (draggedIndex !== index) card.classList.add('drag-over');
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    });
    card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
    card.addEventListener('drop', event => {
      event.preventDefault();
      card.classList.remove('drag-over');
      const source = draggedIndex;
      if (source < 0 || source === index) return;
      window.BrightdeskSlidesService.moveSlide(doc, source, index);
      commitSlideChange(doc);
      renderSlides();
      persist();
    });
    grid.append(card);
  });

  view.append(header, grid);
  slideWrap.append(view);
}


function insertSlideObject(type) {
  const doc = window.BrightdeskSlidesService.ensurePresentation(activeDoc(), t('common.newSlide'));
  const definitions = {
    text: { type: 'text', x: 28, y: 34, width: 38, height: 16, text: 'Add your text', fill: null, stroke: '#9A5E20', strokeWidth: 1, fontSize: 24, textColor: '#26364D', bold: false },
    rectangle: { type: 'rectangle', x: 18, y: 32, width: 22, height: 22, fill: '#F3EBDD', stroke: '#9A5E20', strokeWidth: 2 },
    ellipse: { type: 'ellipse', x: 48, y: 32, width: 22, height: 22, fill: '#DCE6F3', stroke: '#4E6687', strokeWidth: 2 },
    line: { type: 'line', x: 20, y: 70, width: 54, height: 1, fill: null, stroke: '#26364D', strokeWidth: 2 }
  };
  if (!definitions[type]) return;
  try {
    const object = window.BrightdeskSlidesService.addSlideObject(doc, doc.current, definitions[type]);
    state.selectedSlideObjectId = object.id;
    state.ribbonTab = 'shapeFormat';
    commitSlideChange(doc);
    renderSlides();
    renderToolbar();
    persist();
    setStatus(`${type === 'text' ? 'Text box' : type[0].toUpperCase() + type.slice(1)} added`);
  } catch (error) {
    setStatus(error.message);
  }
}

function selectSlideObject(objectId) {
  state.selectedSlideObjectId = objectId || null;
  const selectedObject = getSelectedSlideObject();
  if (selectedObject) state.ribbonTab = 'shapeFormat';
  else if (state.ribbonTab === 'shapeFormat') state.ribbonTab = 'draw';
  slideWrap.querySelectorAll('[data-slide-object]').forEach(element => {
    const active = element.dataset.slideObject === state.selectedSlideObjectId;
    element.classList.toggle('slide-object-selected', active);
    element.setAttribute('aria-pressed', String(active));
  });
  const canvasRow = slideWrap.querySelector('.slide-editor-canvas-row');
  const existingPane = canvasRow?.querySelector('.slide-format-pane');
  existingPane?.remove();
  if (canvasRow) {
    canvasRow.classList.toggle('has-format-pane', Boolean(selectedObject));
    if (selectedObject) canvasRow.append(renderSlideFormatPane(selectedObject));
  }
  renderToolbar();
}

function updateSelectedSlideObject(patch) {
  const doc = window.BrightdeskSlidesService.ensurePresentation(activeDoc());
  if (!state.selectedSlideObjectId) return;
  try {
    window.BrightdeskSlidesService.updateSlideObject(doc, doc.current, state.selectedSlideObjectId, patch);
    commitSlideChange(doc);
    persist();
    renderSlides();
    renderToolbar();
  } catch (error) {
    setStatus(error.message);
  }
}

function deleteSelectedSlideObject() {
  const doc = window.BrightdeskSlidesService.ensurePresentation(activeDoc());
  if (!state.selectedSlideObjectId) return;
  const deleted = window.BrightdeskSlidesService.deleteSlideObject(doc, doc.current, state.selectedSlideObjectId);
  if (!deleted) return;
  state.selectedSlideObjectId = null;
  state.ribbonTab = 'draw';
  commitSlideChange(doc);
  renderSlides();
  renderToolbar();
  persist();
  setStatus('Slide object deleted');
}

function createSlideObjectElement(object, editable = false) {
  const element = document.createElement('div');
  element.className = `slide-object slide-object-${object.type}`;
  element.dataset.slideObject = object.id;
  element.setAttribute('role', 'group');
  element.setAttribute('aria-label', `${object.type} object`);
  element.tabIndex = 0;
  element.style.left = `${object.x}%`;
  element.style.top = `${object.y}%`;
  element.style.width = `${object.width}%`;
  element.style.height = object.type === 'line' ? '0' : `${object.height}%`;
  element.style.transform = object.rotation ? `rotate(${object.rotation}deg)` : '';
  element.style.backgroundColor = object.fill || 'transparent';
  element.style.color = object.textColor || '#26364D';
  element.style.border = object.stroke
    ? `${Math.max(0, object.strokeWidth)}px solid ${object.stroke}`
    : 'none';
  if (object.type === 'ellipse') element.style.borderRadius = '50%';
  if (object.type === 'line') {
    element.style.backgroundColor = 'transparent';
    element.style.border = '0';
    element.style.borderTop = `${Math.max(1, object.strokeWidth)}px solid ${object.stroke || '#26364D'}`;
  }
  let textEditor = null;
  if (object.type === 'text') {
    textEditor = document.createElement('div');
    textEditor.className = 'slide-object-text-content';
    textEditor.contentEditable = editable ? 'true' : 'false';
    textEditor.spellcheck = true;
    textEditor.style.fontSize = `${object.fontSize}px`;
    textEditor.style.fontWeight = object.bold ? '700' : '400';
    textEditor.textContent = object.text || '';
    element.append(textEditor);
    element.setAttribute('aria-label', 'Text box');
  } else if (object.text) {
    element.textContent = object.text;
  }

  if (editable) {
    if (textEditor) {
      textEditor.addEventListener('input', () => {
        const doc = window.BrightdeskSlidesService.ensurePresentation(activeDoc());
        window.BrightdeskSlidesService.updateSlideObject(doc, doc.current, object.id, { text: textEditor.textContent || '' });
        commitSlideChange(doc, `slide-object:${object.id}:text`);
        persist();
      });
    }
    element.addEventListener('click', event => {
      event.stopPropagation();
      selectSlideObject(object.id);
    });

    const moveHandle = document.createElement('button');
    moveHandle.type = 'button';
    moveHandle.className = 'slide-object-drag-handle';
    moveHandle.textContent = '⋮⋮';
    moveHandle.title = 'Move object';
    moveHandle.setAttribute('aria-label', 'Move object');
    const resizeHandle = document.createElement('button');
    resizeHandle.type = 'button';
    resizeHandle.className = 'slide-object-resize-handle';
    resizeHandle.textContent = '◢';
    resizeHandle.title = 'Resize object';
    resizeHandle.setAttribute('aria-label', 'Resize object');

    const startGesture = (event, mode, handle) => {
      event.preventDefault();
      event.stopPropagation();
      selectSlideObject(object.id);
      const stage = element.parentElement;
      const bounds = stage.getBoundingClientRect();
      const startX = event.clientX;
      const startY = event.clientY;
      const original = { x: object.x, y: object.y, width: object.width, height: object.height };
      const next = { ...original };
      const apply = () => {
        element.style.left = `${next.x}%`;
        element.style.top = `${next.y}%`;
        element.style.width = `${next.width}%`;
        element.style.height = object.type === 'line' ? '0' : `${next.height}%`;
      };
      const onMove = moveEvent => {
        const deltaX = (moveEvent.clientX - startX) / Math.max(1, bounds.width) * 100;
        const deltaY = (moveEvent.clientY - startY) / Math.max(1, bounds.height) * 100;
        if (mode === 'move') {
          next.x = Math.max(0, Math.min(100 - original.width, original.x + deltaX));
          next.y = Math.max(0, Math.min(100 - original.height, original.y + deltaY));
        } else {
          next.width = Math.max(3, Math.min(100 - original.x, original.width + deltaX));
          next.height = Math.max(3, Math.min(100 - original.y, original.height + deltaY));
        }
        apply();
      };
      const onEnd = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onEnd);
        window.removeEventListener('pointercancel', onEnd);
        const changed = Math.abs(next.x - original.x) > 0.01
          || Math.abs(next.y - original.y) > 0.01
          || Math.abs(next.width - original.width) > 0.01
          || Math.abs(next.height - original.height) > 0.01;
        if (!changed) return;
        const doc = window.BrightdeskSlidesService.ensurePresentation(activeDoc());
        window.BrightdeskSlidesService.updateSlideObject(doc, doc.current, object.id, next);
        commitSlideChange(doc);
        persist();
        renderSlides();
        renderToolbar();
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onEnd, { once: true });
      window.addEventListener('pointercancel', onEnd, { once: true });
      handle.setPointerCapture?.(event.pointerId);
    };
    moveHandle.addEventListener('pointerdown', event => startGesture(event, 'move', moveHandle));
    resizeHandle.addEventListener('pointerdown', event => startGesture(event, 'resize', resizeHandle));
    element.append(moveHandle, resizeHandle);
  }
  return element;
}


function renderSlideFormatPane(object) {
  const pane = document.createElement('aside');
  pane.className = 'slide-format-pane';
  pane.setAttribute('aria-label', 'Format Shape pane');

  const header = document.createElement('header');
  header.className = 'slide-format-pane-header';
  const title = document.createElement('h3');
  title.textContent = 'Format Shape';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'slide-format-pane-close';
  close.textContent = '×';
  close.title = 'Close Format Shape pane';
  close.setAttribute('aria-label', 'Close Format Shape pane');
  close.addEventListener('click', () => selectSlideObject(null));
  header.append(title, close);
  pane.append(header);

  const createGroup = (caption, open = false) => {
    const details = document.createElement('details');
    details.className = 'slide-format-pane-group';
    details.open = open;
    const summary = document.createElement('summary');
    summary.textContent = caption;
    details.append(summary);
    pane.append(details);
    return details;
  };

  const addControl = (container, caption, property, type, options = {}) => {
    const labelElement = document.createElement('label');
    labelElement.className = 'slide-format-pane-field';
    const captionElement = document.createElement('span');
    captionElement.textContent = caption;
    const input = document.createElement('input');
    input.type = type;
    input.setAttribute('aria-label', caption);
    input.dataset.shapeProperty = property;
    if (type === 'color') {
      input.value = object[property] || options.fallback || '#FFFFFF';
      input.disabled = options.disabled === true;
    } else {
      input.value = String(object[property] ?? options.fallback ?? '');
      if (options.min !== undefined) input.min = String(options.min);
      if (options.max !== undefined) input.max = String(options.max);
      if (options.step !== undefined) input.step = String(options.step);
    }
    input.addEventListener('change', () => {
      const value = type === 'number' ? Number(input.value) : input.value;
      updateSelectedSlideObject({ [property]: value });
    });
    labelElement.append(captionElement, input);
    container.append(labelElement);
    return input;
  };

  const fillLine = createGroup('Fill & Line', true);
  addControl(fillLine, 'Fill colour', 'fill', 'color', {
    fallback: '#FFFFFF',
    disabled: object.type === 'text' || object.type === 'line'
  });
  addControl(fillLine, 'Outline colour', 'stroke', 'color');
  addControl(fillLine, 'Outline weight', 'strokeWidth', 'number', {
    min: 0, max: 12, step: 0.5
  });

  if (object.type === 'text') {
    const textGroup = createGroup('Text');
    addControl(textGroup, 'Text colour', 'textColor', 'color');
    addControl(textGroup, 'Font size', 'fontSize', 'number', {
      min: 8, max: 96, step: 1
    });
    const boldLabel = document.createElement('label');
    boldLabel.className = 'slide-format-pane-toggle';
    const boldInput = document.createElement('input');
    boldInput.type = 'checkbox';
    boldInput.checked = object.bold === true;
    boldInput.setAttribute('aria-label', 'Bold text');
    boldInput.addEventListener('change', () => updateSelectedSlideObject({ bold: boldInput.checked }));
    const boldText = document.createElement('span');
    boldText.textContent = 'Bold text';
    boldLabel.append(boldInput, boldText);
    textGroup.append(boldLabel);
  }

  const size = createGroup('Size & Properties', true);
  addControl(size, 'Horizontal position (%)', 'x', 'number', { min: 0, max: 100, step: 0.5 });
  addControl(size, 'Vertical position (%)', 'y', 'number', { min: 0, max: 100, step: 0.5 });
  addControl(size, 'Width (%)', 'width', 'number', { min: 1, max: 100, step: 0.5 });
  addControl(size, 'Height (%)', 'height', 'number', { min: 1, max: 100, step: 0.5 });
  addControl(size, 'Rotation (degrees)', 'rotation', 'number', { min: -360, max: 360, step: 1 });

  const footer = document.createElement('p');
  footer.className = 'slide-format-pane-note';
  footer.textContent = 'Changes apply to the selected object and are saved with this presentation.';
  pane.append(footer);
  return pane;
}

function renderSlideObjects(stage, objects, doc = activeDoc()) {
  stage.querySelectorAll('[data-slide-object]').forEach(element => element.remove());
  if (!Array.isArray(objects)) return;
  objects.forEach(object => {
    const element = createSlideObjectElement(object, true);
    element.classList.toggle('slide-object-selected', object.id === state.selectedSlideObjectId);
    element.setAttribute('aria-pressed', String(object.id === state.selectedSlideObjectId));
    stage.append(element);
  });
  stage.addEventListener('click', event => {
    if (event.target === stage) selectSlideObject(null);
  });
}

function renderPresentationObjects(container, objects) {
  container.replaceChildren();
  if (!Array.isArray(objects)) return;
  objects.forEach(object => container.append(createSlideObjectElement(object, false)));
}

function setSlideView(view) {
  if (!['normal', 'sorter', 'outline'].includes(view)) return;
  state.slideView = view;
  renderSlides();
  renderToolbar();
}

function resetCurrentSlideLayout() {
  const doc = window.BrightdeskSlidesService.ensurePresentation(activeDoc(), t('common.newSlide'));
  try {
    const slide = window.BrightdeskSlidesService.resetSlideLayout(doc, doc.current);
    const definition = window.BrightdeskSlidesService.getSlideLayoutDefinition(slide.layout);
    commitSlideChange(doc);
    renderSlides();
    renderToolbar();
    persist();
    setStatus(`${definition.label} layout restored. Existing slide text and speaker notes were kept.`);
  } catch (error) {
    setStatus(error.message);
  }
}

function setSlideLayout(layout) {
  const doc = window.BrightdeskSlidesService.ensurePresentation(activeDoc(), t('common.newSlide'));
  try {
    window.BrightdeskSlidesService.setSlideLayout(doc, doc.current, layout);
    commitSlideChange(doc);
  } catch (error) {
    setStatus(error.message);
    return;
  }
  renderSlides();
  persist();
  setStatus('Slide layout updated');
}

function currentSlideSection(doc = activeDoc()) {
  const presentation = window.BrightdeskSlidesService.ensurePresentation(doc);
  return presentation.sections.find(section => section.id === presentation.slides[presentation.current].sectionId) || null;
}

function addSlideSection() {
  const doc = window.BrightdeskSlidesService.ensurePresentation(activeDoc());
  const suggested = `Section ${doc.sections.length + 1}`;
  const name = window.prompt('Name this section:', suggested);
  if (name === null) return;
  try {
    const section = window.BrightdeskSlidesService.createSection(doc, name);
    state.collapsedSlideSections.delete(section.id);
    commitSlideChange(doc);
    renderSlides();
    renderToolbar();
    persist();
    setStatus(`Section “${section.name}” created`);
  } catch (error) {
    setStatus(error.message);
  }
}

function renameSlideSection() {
  const doc = window.BrightdeskSlidesService.ensurePresentation(activeDoc());
  const section = currentSlideSection(doc);
  if (!section) return;
  const name = window.prompt('Rename section:', section.name);
  if (name === null) return;
  try {
    window.BrightdeskSlidesService.renameSection(doc, section.id, name);
    commitSlideChange(doc);
    renderSlides();
    renderToolbar();
    persist();
    setStatus('Section renamed');
  } catch (error) {
    setStatus(error.message);
  }
}

function removeSlideSection() {
  const doc = window.BrightdeskSlidesService.ensurePresentation(activeDoc());
  const section = currentSlideSection(doc);
  if (!section) return;
  if (!window.confirm(`Remove section “${section.name}”? Its slides will stay in the presentation.`)) return;
  window.BrightdeskSlidesService.deleteSection(doc, section.id);
  state.collapsedSlideSections.delete(section.id);
  commitSlideChange(doc);
  renderSlides();
  renderToolbar();
  persist();
  setStatus('Section removed; slides kept');
}

function moveCurrentSlideToSection(sectionId) {
  const doc = window.BrightdeskSlidesService.ensurePresentation(activeDoc());
  try {
    window.BrightdeskSlidesService.moveSlideToSection(doc, doc.current, sectionId);
    commitSlideChange(doc);
    renderSlides();
    renderToolbar();
    persist();
    setStatus(sectionId ? 'Slide moved to section' : 'Slide removed from its section');
  } catch (error) {
    setStatus(error.message);
  }
}

function setSlideSize(slideSize) {
  const doc = window.BrightdeskSlidesService.ensurePresentation(activeDoc(), t('common.newSlide'));
  try {
    window.BrightdeskSlidesService.setSlideSize(doc, slideSize);
    commitSlideChange(doc);
  } catch (error) {
    setStatus(error.message);
    return;
  }
  renderSlides();
  renderToolbar();
  persist();
  setStatus(slideSize === 'standard' ? 'Standard 4:3 slide size selected' : 'Widescreen 16:9 slide size selected');
}

function renderSlides() {
  const slidesService = window.BrightdeskSlidesService;
  const doc = slidesService.ensurePresentation(activeDoc(), t('common.newSlide'));
  if (state.slideView === 'sorter') {
    renderSlideSorter(doc);
    return;
  }
  if (state.slideView === 'outline') {
    renderSlideOutline(doc);
    return;
  }
  const slide = doc.slides[doc.current];
  if (state.selectedSlideObjectId && !slide.objects?.some(object => object.id === state.selectedSlideObjectId)) state.selectedSlideObjectId = null;
  slideWrap.innerHTML = '';

  const shell = document.createElement('div');
  shell.className = 'slide-editor-shell';

  const navigator = document.createElement('nav');
  navigator.className = 'slide-navigator';
  navigator.setAttribute('aria-label', 'Slide thumbnails');

  const navigatorHeader = document.createElement('div');
  navigatorHeader.className = 'slide-navigator-header';
  const navigatorTitle = document.createElement('div');
  navigatorTitle.className = 'slide-navigator-title';
  const navigatorHeading = document.createElement('b');
  navigatorHeading.textContent = 'Slides';
  const navigatorCount = document.createElement('small');
  navigatorCount.textContent = String(doc.slides.length);
  navigatorTitle.append(navigatorHeading, navigatorCount);

  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.className = 'slide-add-button';
  addButton.textContent = '+';
  addButton.title = 'Add slide';
  addButton.setAttribute('aria-label', 'Add slide');
  addButton.addEventListener('click', addSlide);
  navigatorHeader.append(navigatorTitle, addButton);

  const thumbnailList = document.createElement('div');
  thumbnailList.className = 'slide-thumbnail-list';
  let draggedIndex = -1;

  const updateThumbnailPreview = (index, nextTitle, nextBody, nextSecondary = '') => {
    const card = thumbnailList.querySelector(`[data-slide-index="${index}"]`);
    if (!card) return;
    const titleLabel = card.querySelector('.slide-thumbnail-title');
    const bodyLabel = card.querySelector('.slide-thumbnail-summary');
    if (titleLabel) titleLabel.textContent = nextTitle.trim() || `Slide ${index + 1}`;
    const summary = [nextBody.trim(), nextSecondary.trim()].filter(Boolean).join(' · ');
    if (bodyLabel) bodyLabel.textContent = summary.slice(0, 88) || 'Add text to this slide';
  };

  doc.slides.forEach((item, index) => {
    if (item.sectionId && (index === 0 || doc.slides[index - 1].sectionId !== item.sectionId)) {
      const section = doc.sections.find(entry => entry.id === item.sectionId);
      if (section) {
        const sectionHeader = document.createElement('div');
        sectionHeader.className = 'slide-section-heading';
        const toggle = document.createElement('button');
        toggle.type = 'button';
        const collapsed = state.collapsedSlideSections.has(section.id);
        toggle.textContent = collapsed ? '▸' : '▾';
        toggle.setAttribute('aria-label', `${collapsed ? 'Expand' : 'Collapse'} section ${section.name}`);
        const name = document.createElement('strong');
        name.textContent = section.name;
        const total = document.createElement('small');
        total.textContent = `${doc.slides.filter(entry => entry.sectionId === section.id).length} slides`;
        toggle.append(name, total);
        toggle.addEventListener('click', () => {
          const nextCollapsed = !state.collapsedSlideSections.has(section.id);
          if (nextCollapsed) state.collapsedSlideSections.add(section.id);
          else state.collapsedSlideSections.delete(section.id);
          thumbnailList.querySelectorAll('.slide-thumbnail-card').forEach(card => {
            if (card.dataset.sectionId === section.id) card.hidden = nextCollapsed;
          });
          toggle.firstChild.textContent = nextCollapsed ? '▸' : '▾';
          toggle.setAttribute('aria-label', `${nextCollapsed ? 'Expand' : 'Collapse'} section ${section.name}`);
        });
        sectionHeader.append(toggle);
        thumbnailList.append(sectionHeader);
      }
    }
    const card = document.createElement('article');
    card.className = 'slide-thumbnail-card';
    card.classList.toggle('is-hidden-slide', item.hidden === true);
    card.dataset.slideIndex = String(index);
    card.dataset.sectionId = item.sectionId || '';
    card.hidden = Boolean(item.sectionId && state.collapsedSlideSections.has(item.sectionId));
    card.draggable = true;
    card.classList.toggle('active', index === doc.current);

    const select = document.createElement('button');
    select.type = 'button';
    select.className = 'slide-thumbnail-select';
    select.setAttribute('aria-label', `Select slide ${index + 1}: ${item.title || 'Untitled slide'}${item.hidden ? ', hidden from slide show' : ''}`);
    select.setAttribute('aria-current', index === doc.current ? 'true' : 'false');
    const number = document.createElement('span');
    number.className = 'slide-thumbnail-number';
    number.textContent = String(index + 1);
    const preview = document.createElement('span');
    preview.className = `slide-thumbnail-preview layout-${item.layout} size-${doc.slideSize}`;
    const previewTitle = document.createElement('b');
    previewTitle.className = 'slide-thumbnail-title';
    previewTitle.textContent = item.title.trim() || `Slide ${index + 1}`;
    const layoutDefinition = slidesService.getSlideLayoutDefinition(item.layout);
    const previewBody = document.createElement('span');
    previewBody.className = 'slide-thumbnail-summary';
    const previewSummary = [item.body.trim(), item.bodySecondary.trim()].filter(Boolean).join(' · ');
    previewBody.textContent = previewSummary.slice(0, 88) || layoutDefinition.bodyPlaceholder;
    preview.append(previewTitle, previewBody);
    select.append(number, preview);
    const thumbnailTransition = document.createElement('span');
    thumbnailTransition.className = 'slide-thumbnail-transition';
    thumbnailTransition.dataset.slideTransition = item.transition || 'none';
    const transitionLabel = item.transition && item.transition !== 'none'
      ? item.transition[0].toUpperCase() + item.transition.slice(1)
      : 'No transition';
    thumbnailTransition.textContent = transitionLabel;
    select.append(thumbnailTransition);
    if (item.hidden) {
      const hiddenBadge = document.createElement('span');
      hiddenBadge.className = 'slide-hidden-indicator';
      hiddenBadge.textContent = 'Hidden';
      select.append(hiddenBadge);
    }
    select.addEventListener('click', () => {
      slidesService.setCurrentSlide(doc, index);
      getSlideHistory(doc).sync(doc);
      renderSlides();
      renderToolbar();
    });

    const order = document.createElement('div');
    order.className = 'slide-thumbnail-order';
    const moveEarlier = document.createElement('button');
    moveEarlier.type = 'button';
    moveEarlier.textContent = '↑';
    moveEarlier.title = 'Move slide earlier';
    moveEarlier.setAttribute('aria-label', `Move slide ${index + 1} earlier`);
    moveEarlier.disabled = index === 0;
    moveEarlier.addEventListener('click', () => {
      slidesService.moveSlide(doc, index, index - 1);
      commitSlideChange(doc);
      renderSlides();
      persist();
    });
    const moveLater = document.createElement('button');
    moveLater.type = 'button';
    moveLater.textContent = '↓';
    moveLater.title = 'Move slide later';
    moveLater.setAttribute('aria-label', `Move slide ${index + 1} later`);
    moveLater.disabled = index === doc.slides.length - 1;
    moveLater.addEventListener('click', () => {
      slidesService.moveSlide(doc, index, index + 1);
      commitSlideChange(doc);
      renderSlides();
      persist();
    });
    order.append(moveEarlier, moveLater);
    card.append(select, order);

    card.addEventListener('dragstart', event => {
      draggedIndex = index;
      card.classList.add('dragging');
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(index));
      }
    });
    card.addEventListener('dragend', () => {
      draggedIndex = -1;
      card.classList.remove('dragging');
      thumbnailList.querySelectorAll('.drag-over').forEach(node => node.classList.remove('drag-over'));
    });
    card.addEventListener('dragover', event => {
      event.preventDefault();
      if (draggedIndex !== index) card.classList.add('drag-over');
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    });
    card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
    card.addEventListener('drop', event => {
      event.preventDefault();
      card.classList.remove('drag-over');
      const source = draggedIndex;
      if (source < 0 || source === index) return;
      slidesService.moveSlide(doc, source, index);
      commitSlideChange(doc);
      renderSlides();
      persist();
    });

    thumbnailList.append(card);
  });

  navigator.append(navigatorHeader, thumbnailList);

  const editorMain = document.createElement('section');
  editorMain.className = 'slide-editor-main';
  editorMain.setAttribute('aria-label', 'Slide editor');

  const stage = document.createElement('div');
  stage.className = `slide-stage theme-${doc.themeId} layout-${slide.layout} size-${doc.slideSize}`;
  stage.classList.toggle('has-custom-background', Boolean(slide.backgroundColor));
  const slideTextColor = slide.backgroundColor
    ? window.BrightdeskSlidesService.getReadableTextColor(slide.backgroundColor)
    : '';
  stage.style.backgroundColor = slide.backgroundColor || '';

  const layoutDefinition = slidesService.getSlideLayoutDefinition(slide.layout);
  const title = document.createElement('textarea');
  title.className = 'slide-title';
  title.value = slide.title || '';
  title.placeholder = layoutDefinition.titlePlaceholder;
  title.setAttribute('aria-label', layoutDefinition.titleLabel);
  title.lang = state.proofingLanguage;
  title.style.color = slideTextColor;

  const body = document.createElement('textarea');
  body.className = 'slide-body slide-body-primary';
  body.value = slide.body || '';
  body.placeholder = layoutDefinition.bodyPlaceholder;
  body.setAttribute('aria-label', layoutDefinition.bodyLabel);
  body.lang = state.proofingLanguage;
  body.style.color = slideTextColor;
  body.style.backgroundColor = slide.backgroundColor || '';

  let secondary = null;
  const updatePrimary = () => {
    slidesService.updateSlide(doc, doc.current, { body: body.value });
    commitSlideChange(doc, `slide:${doc.current}:body`);
    updateThumbnailPreview(doc.current, title.value, body.value, secondary?.value || '');
    persist();
  };
  title.addEventListener('input', () => {
    slidesService.updateSlide(doc, doc.current, { title: title.value });
    commitSlideChange(doc, `slide:${doc.current}:title`);
    updateThumbnailPreview(doc.current, title.value, body.value, secondary?.value || '');
    persist();
  });
  body.addEventListener('input', updatePrimary);

  if (slide.layout === 'two-content') {
    const columns = document.createElement('div');
    columns.className = 'slide-content-columns';
    secondary = document.createElement('textarea');
    secondary.className = 'slide-body slide-body-secondary';
    secondary.value = slide.bodySecondary || '';
    secondary.placeholder = layoutDefinition.secondaryBodyPlaceholder || '';
    secondary.setAttribute('aria-label', layoutDefinition.secondaryBodyLabel || 'Second content column');
    secondary.lang = state.proofingLanguage;
    secondary.style.color = slideTextColor;
    secondary.style.backgroundColor = slide.backgroundColor || '';
    secondary.addEventListener('input', () => {
      slidesService.updateSlide(doc, doc.current, { bodySecondary: secondary.value });
      commitSlideChange(doc, `slide:${doc.current}:secondary`);
      updateThumbnailPreview(doc.current, title.value, body.value, secondary.value);
      persist();
    });
    columns.append(body, secondary);
    stage.append(title, columns);
  } else {
    stage.append(title, body);
  }
  renderSlideObjects(stage, slide.objects || [], doc);

  const canvasRow = document.createElement('div');
  canvasRow.className = 'slide-editor-canvas-row';
  canvasRow.classList.toggle('has-format-pane', Boolean(getSelectedSlideObject(doc)));
  canvasRow.append(stage);
  const selectedObject = getSelectedSlideObject(doc);
  if (selectedObject) canvasRow.append(renderSlideFormatPane(selectedObject));

  const notesPanel = document.createElement('section');
  notesPanel.className = 'slide-speaker-notes';
  notesPanel.setAttribute('aria-label', 'Speaker notes');
  const notesHeading = document.createElement('label');
  notesHeading.className = 'slide-speaker-notes-heading';
  notesHeading.textContent = 'Speaker notes';
  const notes = document.createElement('textarea');
  notes.className = 'slide-speaker-notes-editor';
  notes.value = slide.notes || '';
  notes.placeholder = 'Add notes for this slide…';
  notes.setAttribute('aria-label', 'Speaker notes for current slide');
  notes.lang = state.proofingLanguage;
  notes.addEventListener('input', () => {
    slidesService.updateSlide(doc, doc.current, { notes: notes.value });
    commitSlideChange(doc, `slide:${doc.current}:notes`);
    persist();
  });
  notesHeading.append(notes);
  notesPanel.append(notesHeading);

  const controls = document.createElement('div');
  controls.className = 'slide-controls';
  const prev = document.createElement('button');
  prev.type = 'button';
  prev.textContent = '← Previous';
  prev.disabled = doc.current === 0;
  prev.addEventListener('click', () => {
    slidesService.setCurrentSlide(doc, doc.current - 1);
    getSlideHistory(doc).sync(doc);
    renderSlides();
    renderToolbar();
  });
  const count = document.createElement('span');
  count.textContent = `Slide ${doc.current + 1} of ${doc.slides.length}`;
  const next = document.createElement('button');
  next.type = 'button';
  next.textContent = 'Next →';
  next.disabled = doc.current === doc.slides.length - 1;
  next.addEventListener('click', () => {
    slidesService.setCurrentSlide(doc, doc.current + 1);
    getSlideHistory(doc).sync(doc);
    renderSlides();
    renderToolbar();
  });
  controls.append(prev, count, next);

  editorMain.append(canvasRow, notesPanel, controls);
  shell.append(navigator, editorMain);
  slideWrap.append(shell);
}
function addSlide() {
  const doc = activeDoc();
  window.BrightdeskSlidesService.addSlide(doc);
  commitSlideChange(doc);
  renderSlides();
  renderToolbar();
  persist();
}
async function reuseSlides() {
  try {
    const imported = await window.brightdesk.reuseSlides();
    if (!imported) return;
    if (imported.kind !== 'slides' || !Array.isArray(imported.slides)) {
      throw new Error('The selected file does not contain reusable presentation slides.');
    }

    const doc = window.BrightdeskSlidesService.ensurePresentation(activeDoc());
    const result = window.BrightdeskSlidesService.insertSlidesAfterCurrent(doc, imported.slides);
    commitSlideChange(doc);
    persist();
    renderSlides();
    renderToolbar();

    const slideWord = result.count === 1 ? 'slide' : 'slides';
    setStatus(
      result.count + ' ' + slideWord + ' reused after the selected slide. ' +
      'The current theme and slide size are kept; some PowerPoint formatting or objects may not be preserved.'
    );
  } catch (error) {
    alert('Could not reuse slides: ' + error.message);
  }
}
function duplicateSlide() {
  const doc = activeDoc();
  window.BrightdeskSlidesService.duplicateSlide(doc);
  commitSlideChange(doc);
  renderSlides();
  renderToolbar();
  persist();
}
function deleteSlide() {
  const doc = activeDoc();
  if (!window.BrightdeskSlidesService.deleteSlide(doc)) {
    alert('A presentation needs at least one slide.');
    return;
  }
  commitSlideChange(doc);
  renderSlides();
  renderToolbar();
  persist();
}
function toggleSlideHidden() {
  const doc = window.BrightdeskSlidesService.ensurePresentation(activeDoc());
  const slide = doc.slides[doc.current];
  try {
    window.BrightdeskSlidesService.setSlideHidden(doc, doc.current, slide.hidden !== true);
    commitSlideChange(doc);
    renderSlides();
    renderToolbar();
    persist();
    setStatus(slide.hidden ? 'Slide hidden from the slide show' : 'Slide will appear in the slide show');
  } catch (error) {
    setStatus(error.message);
  }
}

function presentSlides(startFromFirst = false) {
  openPresentation(startFromFirst, false);
}

function presentWithPresenterView(startFromFirst = false) {
  openPresentation(startFromFirst, true);
}

function openPresentation(startFromFirst = false, presenterMode = false) {
  const d = window.BrightdeskSlidesService.ensurePresentation(activeDoc());
  const visibleSlides = window.BrightdeskSlidesService.getVisibleSlideIndices(d);
  if (visibleSlides.length === 0) {
    setStatus('This presentation has no visible slides to show');
    return;
  }
  let position = startFromFirst ? 0 : visibleSlides.findIndex(index => index >= d.current);
  if (position < 0) position = visibleSlides.length - 1;
  const currentSlideIndex = () => visibleSlides[position];
  const overlay = document.createElement('div');
  overlay.className = 'presentation-overlay bd-motion-overlay';
  if (presenterMode) overlay.classList.add('presenter-overlay');
  overlay.dataset.state = 'closed';

  const slide = document.createElement('div');
  slide.className = `presentation-slide size-${d.slideSize || 'widescreen'}`;
  const title = document.createElement('h1');
  const content = document.createElement('div');
  content.className = 'presentation-content';
  const body = document.createElement('p');
  body.className = 'presentation-body-primary';
  const columns = document.createElement('div');
  columns.className = 'presentation-content-columns';
  const secondaryBody = document.createElement('p');
  secondaryBody.className = 'presentation-body-secondary';
  columns.append(body, secondaryBody);
  content.append(columns);
  const objectLayer = document.createElement('div');
  objectLayer.className = 'presentation-object-layer';
  const footer = document.createElement('div');
  footer.className = 'presentation-footer';
  slide.append(title, content, objectLayer, footer);

  const presenterToolbar = document.createElement('header');
  presenterToolbar.className = 'presenter-toolbar';
  const presenterHeading = document.createElement('div');
  presenterHeading.className = 'presenter-heading';
  const presenterTitle = document.createElement('h2');
  presenterTitle.textContent = 'Presenter View';
  const presenterProgress = document.createElement('p');
  presenterProgress.className = 'presenter-progress';
  const presenterDisplayStatus = document.createElement('p');
  presenterDisplayStatus.className = 'presenter-display-status';
  presenterDisplayStatus.setAttribute('role', 'status');
  presenterDisplayStatus.textContent = 'Checking for a second display…';
  presenterHeading.append(presenterTitle, presenterProgress, presenterDisplayStatus);

  const presenterElapsed = document.createElement('span');
  presenterElapsed.className = 'presenter-elapsed';
  presenterElapsed.textContent = '00:00';
  presenterElapsed.setAttribute('role', 'timer');
  presenterElapsed.setAttribute('aria-label', 'Elapsed presentation time');

  const presenterActions = document.createElement('div');
  presenterActions.className = 'presenter-actions';
  const previousButton = document.createElement('button');
  previousButton.type = 'button';
  previousButton.className = 'presenter-control';
  previousButton.textContent = '← Previous';
  previousButton.setAttribute('aria-label', 'Go to previous visible slide');
  const nextButton = document.createElement('button');
  nextButton.type = 'button';
  nextButton.className = 'presenter-control';
  nextButton.textContent = 'Next →';
  nextButton.setAttribute('aria-label', 'Go to next visible slide');
  const endButton = document.createElement('button');
  endButton.type = 'button';
  endButton.className = 'presenter-control presenter-end-control';
  endButton.textContent = 'End show';
  presenterActions.append(presenterElapsed, previousButton, nextButton, endButton);
  presenterToolbar.append(presenterHeading, presenterActions);

  const presenterWorkspace = document.createElement('div');
  presenterWorkspace.className = 'presenter-workspace';
  const presenterStage = document.createElement('section');
  presenterStage.className = 'presenter-stage';
  presenterStage.setAttribute('aria-label', 'Current slide');
  presenterStage.append(slide);

  const presenterSidePanel = document.createElement('aside');
  presenterSidePanel.className = 'presenter-side-panel';
  const nextPanel = document.createElement('section');
  nextPanel.className = 'presenter-card presenter-next-panel presenter-next-slide';
  nextPanel.setAttribute('aria-label', 'Next visible slide');
  const nextHeading = document.createElement('h3');
  nextHeading.textContent = 'Next slide';
  const nextPreview = document.createElement('div');
  nextPreview.className = 'presentation-slide presenter-slide-preview';
  const nextPreviewTitle = document.createElement('h1');
  const nextPreviewContent = document.createElement('div');
  nextPreviewContent.className = 'presentation-content';
  const nextPreviewColumns = document.createElement('div');
  nextPreviewColumns.className = 'presentation-content-columns';
  const nextPreviewBody = document.createElement('p');
  nextPreviewBody.className = 'presentation-body-primary';
  const nextPreviewSecondary = document.createElement('p');
  nextPreviewSecondary.className = 'presentation-body-secondary';
  nextPreviewColumns.append(nextPreviewBody, nextPreviewSecondary);
  nextPreviewContent.append(nextPreviewColumns);
  const nextPreviewObjectLayer = document.createElement('div');
  nextPreviewObjectLayer.className = 'presentation-object-layer presenter-preview-object-layer';
  nextPreview.append(nextPreviewTitle, nextPreviewContent, nextPreviewObjectLayer);
  const noNextSlide = document.createElement('p');
  noNextSlide.className = 'presenter-no-next';
  noNextSlide.textContent = 'You are on the last visible slide.';
  nextPanel.append(nextHeading, nextPreview, noNextSlide);

  const notesPanel = document.createElement('section');
  notesPanel.className = 'presenter-card presenter-notes-panel';
  notesPanel.setAttribute('aria-label', 'Speaker notes for the current slide');
  const notesHeading = document.createElement('h3');
  notesHeading.textContent = 'Speaker notes';
  const presenterNotes = document.createElement('div');
  presenterNotes.className = 'presenter-speaker-notes';
  presenterNotes.setAttribute('role', 'note');
  presenterNotes.setAttribute('aria-label', 'Speaker notes for the current slide');
  notesPanel.append(notesHeading, presenterNotes);
  presenterSidePanel.append(nextPanel, notesPanel);
  presenterWorkspace.append(presenterStage, presenterSidePanel);

  const presenterFooter = document.createElement('footer');
  presenterFooter.className = 'presenter-footer';
  presenterFooter.textContent = 'Use the arrow keys, Space, Page Up/Down, N or P to move. Press Escape to end the show.';

  const picker = document.createElement('section');
  picker.className = 'presentation-slide-picker';
  picker.hidden = true;
  picker.setAttribute('role', 'dialog');
  picker.setAttribute('aria-label', 'Choose a slide');
  const pickerHeader = document.createElement('header');
  pickerHeader.className = 'presentation-slide-picker-header';
  const pickerTitle = document.createElement('h2');
  pickerTitle.textContent = 'All slides';
  const pickerHint = document.createElement('p');
  pickerHint.textContent = 'Choose a visible slide to continue. Hidden slides are not listed. Press Escape to return.';
  pickerHeader.append(pickerTitle, pickerHint);
  const pickerGrid = document.createElement('div');
  pickerGrid.className = 'presentation-slide-picker-grid';
  const pickerButtons = [];

  visibleSlides.forEach((slideIndex, visiblePosition) => {
    const item = d.slides[slideIndex];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'presentation-slide-picker-item';
    button.dataset.visiblePosition = String(visiblePosition);
    button.setAttribute('aria-label', `Go to slide ${slideIndex + 1}: ${item.title || 'Untitled slide'}`);
    const number = document.createElement('span');
    number.className = 'presentation-slide-picker-number';
    number.textContent = String(slideIndex + 1);
    const label = document.createElement('strong');
    label.textContent = item.title.trim() || `Slide ${slideIndex + 1}`;
    button.append(number, label);
    button.addEventListener('click', event => {
      event.stopPropagation();
      position = visiblePosition;
      pickerOpen = false;
      draw();
    });
    pickerButtons.push(button);
    pickerGrid.append(button);
  });
  picker.append(pickerHeader, pickerGrid);
  if (presenterMode) overlay.append(presenterToolbar, presenterWorkspace, presenterFooter, picker);
  else overlay.append(slide, picker);
  document.body.append(overlay);

  let closing = false;
  let elapsedTimer = null;
  const presentationStartedAt = Date.now();
  let pickerOpen = false;
  let numberBuffer = '';
  let blankMode = null;
  let showMessage = '';
  let audienceDisplayActive = false;
  let lastPresentedSlideId = null;
  let lastPlaybackTransitionClass = '';
  const removePresenterDisplayLostListener = presenterMode
    ? window.brightdesk?.onPresenterDisplayLost?.(() => {
      audienceDisplayActive = false;
      presenterDisplayStatus.textContent = 'The audience output closed or was disconnected. Presenter View remains open on this screen.';
    })
    : null;

  const createAudienceState = () => {
    const currentSlide = d.slides[currentSlideIndex()];
    return {
      slide: {
        title: currentSlide.title || '',
        body: currentSlide.body || '',
        bodySecondary: currentSlide.bodySecondary || '',
        id: currentSlide.id || '',
        layout: currentSlide.layout || 'title-content',
        transition: currentSlide.transition || 'none',
        ...(currentSlide.backgroundColor ? { backgroundColor: currentSlide.backgroundColor } : {}),
        objects: Array.isArray(currentSlide.objects) ? currentSlide.objects : []
      },
      themeId: d.themeId || 'lavender',
      slideSize: d.slideSize || 'widescreen',
      blankMode
    };
  };

  const togglePresentationBlank = mode => {
    numberBuffer = '';
    showMessage = '';
    blankMode = blankMode === mode ? null : mode;
    overlay.classList.toggle('is-blank-black', blankMode === 'black');
    overlay.classList.toggle('is-blank-white', blankMode === 'white');
    if (presenterMode && audienceDisplayActive && window.brightdesk?.updatePresenter) {
      window.brightdesk.updatePresenter(createAudienceState());
    }
  };

  const showSlidePicker = () => {
    pickerOpen = !pickerOpen;
    if (pickerOpen) {
      numberBuffer = '';
      showMessage = '';
      togglePresentationBlank(null);
    }
    draw();
  };

  const draw = () => {
    const snapshot = presenterMode
      ? window.BrightdeskSlidesService.getPresenterSnapshot(d, position)
      : null;
    const currentSlide = snapshot?.currentSlide || d.slides[currentSlideIndex()];
    const slideChanged = currentSlide.id !== lastPresentedSlideId;
    if (slideChanged) {
      const transition = ['fade', 'push', 'wipe'].includes(currentSlide.transition) ? currentSlide.transition : 'none';
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      lastPlaybackTransitionClass = transition !== 'none' && !reducedMotion
        ? `slide-transition-${transition}`
        : '';
      lastPresentedSlideId = currentSlide.id;
    }
    const slideBaseClass = `presentation-slide size-${d.slideSize || 'widescreen'} theme-${d.themeId} layout-${currentSlide.layout || 'title-content'}${presenterMode ? ' presenter-current-slide' : ''}`;
    slide.className = slideBaseClass + (lastPlaybackTransitionClass ? ` ${lastPlaybackTransitionClass}` : '');
    if (slideChanged && lastPlaybackTransitionClass) {
      slide.classList.remove(lastPlaybackTransitionClass);
      void slide.offsetWidth;
      slide.classList.add(lastPlaybackTransitionClass);
    }
    const currentTextColor = currentSlide.backgroundColor
      ? window.BrightdeskSlidesService.getReadableTextColor(currentSlide.backgroundColor)
      : '';
    slide.style.backgroundColor = currentSlide.backgroundColor || '';
    title.style.color = currentTextColor;
    body.style.color = currentTextColor;
    body.style.backgroundColor = currentSlide.backgroundColor || '';
    secondaryBody.style.color = currentTextColor;
    secondaryBody.style.backgroundColor = currentSlide.backgroundColor || '';
    title.textContent = currentSlide.title || '';
    body.textContent = currentSlide.body || '';
    renderPresentationObjects(objectLayer, currentSlide.objects || []);
    secondaryBody.textContent = currentSlide.bodySecondary || '';
    secondaryBody.hidden = currentSlide.layout !== 'two-content';
    slide.hidden = presenterMode ? false : pickerOpen;
    footer.hidden = presenterMode;
    picker.hidden = !pickerOpen;
    pickerButtons.forEach(button => {
      const active = Number(button.dataset.visiblePosition) === position;
      button.classList.toggle('active', active);
      button.setAttribute('aria-current', String(active));
    });
    footer.textContent = numberBuffer
      ? `Go to slide ${numberBuffer} · Enter to jump · Backspace to edit · Esc to clear`
      : showMessage || 'Click or use arrows to move · G all slides · B black · W white · Esc to exit';

    if (presenterMode) {
      presenterProgress.textContent = `Slide ${snapshot.currentIndex + 1} · ${snapshot.visiblePosition + 1} of ${snapshot.visibleCount} visible`;
      presenterNotes.textContent = snapshot.currentSlide.notes || 'No speaker notes for this slide.';
      presenterWorkspace.hidden = pickerOpen;
      presenterToolbar.hidden = pickerOpen;
      presenterFooter.hidden = pickerOpen;
      previousButton.disabled = position <= 0;
      nextButton.disabled = position >= visibleSlides.length - 1;
      if (snapshot.nextSlide) {
        nextPreview.hidden = false;
        noNextSlide.hidden = true;
        nextPreview.className = `presentation-slide presenter-slide-preview size-${d.slideSize || 'widescreen'} theme-${d.themeId} layout-${snapshot.nextSlide.layout || 'title-content'}`;
        const nextTextColor = snapshot.nextSlide.backgroundColor
          ? window.BrightdeskSlidesService.getReadableTextColor(snapshot.nextSlide.backgroundColor)
          : '';
        nextPreview.style.backgroundColor = snapshot.nextSlide.backgroundColor || '';
        nextPreviewTitle.style.color = nextTextColor;
        nextPreviewBody.style.color = nextTextColor;
        nextPreviewBody.style.backgroundColor = snapshot.nextSlide.backgroundColor || '';
        nextPreviewSecondary.style.color = nextTextColor;
        nextPreviewSecondary.style.backgroundColor = snapshot.nextSlide.backgroundColor || '';
        nextPreviewTitle.textContent = snapshot.nextSlide.title || '';
        nextPreviewBody.textContent = snapshot.nextSlide.body || '';
        renderPresentationObjects(nextPreviewObjectLayer, snapshot.nextSlide.objects || []);
        nextPreviewSecondary.textContent = snapshot.nextSlide.bodySecondary || '';
        nextPreviewSecondary.hidden = snapshot.nextSlide.layout !== 'two-content';
      } else {
        nextPreview.hidden = true;
        noNextSlide.hidden = false;
        nextPreviewObjectLayer.replaceChildren();
      }
    }
    if (presenterMode && audienceDisplayActive && window.brightdesk?.updatePresenter) {
      window.brightdesk.updatePresenter(createAudienceState());
    }
  };

  const refreshPresenterElapsed = () => {
    const totalSeconds = Math.max(0, Math.floor((Date.now() - presentationStartedAt) / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = value => String(value).padStart(2, '0');
    const elapsed = hours > 0
      ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
      : `${pad(minutes)}:${pad(seconds)}`;
    presenterElapsed.textContent = elapsed;
    presenterElapsed.setAttribute('aria-label', `Elapsed presentation time ${elapsed}`);
  };

  const close = () => {
    if (closing) return;
    closing = true;
    if (typeof removePresenterDisplayLostListener === 'function') removePresenterDisplayLostListener();
    if (presenterMode && window.brightdesk?.endPresenter) {
      window.brightdesk.endPresenter().catch(() => {});
      audienceDisplayActive = false;
    }
    if (elapsedTimer !== null) {
      window.clearInterval(elapsedTimer);
      elapsedTimer = null;
    }
    overlay.dataset.state = 'closed';
    document.removeEventListener('keydown', key);

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      overlay.remove();
      return;
    }

    const finish = event => {
      if (event.target !== overlay || event.propertyName !== 'opacity') return;
      overlay.removeEventListener('transitionend', finish);
      overlay.remove();
    };
    overlay.addEventListener('transitionend', finish);
    window.setTimeout(() => {
      overlay.removeEventListener('transitionend', finish);
      overlay.remove();
    }, 240);
  };

  const key = event => {
    if (closing) return;
    const keyName = event.key;
    const normalized = keyName.toLowerCase();

    if (keyName === 'Escape') {
      event.preventDefault();
      if (pickerOpen) {
        pickerOpen = false;
        showMessage = '';
        draw();
      } else if (numberBuffer) {
        numberBuffer = '';
        showMessage = '';
        draw();
      } else {
        close();
      }
      return;
    }

    if (!pickerOpen && !event.ctrlKey && !event.metaKey && !event.altKey && /^[0-9]$/.test(keyName)) {
      event.preventDefault();
      showMessage = '';
      if (numberBuffer.length < 4) numberBuffer += keyName;
      draw();
      return;
    }

    if (!pickerOpen && numberBuffer && keyName === 'Backspace') {
      event.preventDefault();
      showMessage = '';
      numberBuffer = numberBuffer.slice(0, -1);
      draw();
      return;
    }

    if (!pickerOpen && numberBuffer && keyName === 'Enter') {
      event.preventDefault();
      const requestedSlide = Number(numberBuffer);
      const targetPosition = window.BrightdeskSlidesService.getVisibleSlidePosition(d, requestedSlide);
      numberBuffer = '';
      if (targetPosition >= 0) {
        position = targetPosition;
        showMessage = '';
      } else {
        showMessage = `Slide ${requestedSlide} is hidden or doesn't exist`;
      }
      draw();
      return;
    }

    if (normalized === 'g') {
      event.preventDefault();
      showSlidePicker();
      return;
    }

    if (normalized === 'b' || keyName === '.') {
      event.preventDefault();
      togglePresentationBlank('black');
      return;
    }

    if (normalized === 'w' || keyName === ',') {
      event.preventDefault();
      togglePresentationBlank('white');
      return;
    }

    if (pickerOpen) return;

    if (['ArrowRight', 'ArrowDown', 'PageDown', 'Enter', ' '].includes(keyName) || normalized === 'n') {
      event.preventDefault();
      numberBuffer = '';
      showMessage = '';
      position = Math.min(visibleSlides.length - 1, position + 1);
      draw();
    } else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(keyName) || normalized === 'p') {
      event.preventDefault();
      numberBuffer = '';
      showMessage = '';
      position = Math.max(0, position - 1);
      draw();
    } else if (keyName === 'Home') {
      event.preventDefault();
      numberBuffer = '';
      showMessage = '';
      position = 0;
      draw();
    } else if (keyName === 'End') {
      event.preventDefault();
      numberBuffer = '';
      showMessage = '';
      position = visibleSlides.length - 1;
      draw();
    }
  };

  requestAnimationFrame(() => {
    if (!closing && overlay.isConnected) overlay.dataset.state = 'open';
  });
  if (!presenterMode) {
    overlay.addEventListener('click', () => {
      if (closing || pickerOpen || overlay.dataset.state !== 'open') return;
      numberBuffer = '';
      showMessage = '';
      position = Math.min(visibleSlides.length - 1, position + 1);
      draw();
    });
  }
  previousButton.addEventListener('click', event => {
    event.stopPropagation();
    position = Math.max(0, position - 1);
    numberBuffer = '';
    showMessage = '';
    draw();
  });
  nextButton.addEventListener('click', event => {
    event.stopPropagation();
    position = Math.min(visibleSlides.length - 1, position + 1);
    numberBuffer = '';
    showMessage = '';
    draw();
  });
  endButton.addEventListener('click', event => {
    event.stopPropagation();
    close();
  });
  document.addEventListener('keydown', key);
  draw();
  if (presenterMode) {
    refreshPresenterElapsed();
    elapsedTimer = window.setInterval(refreshPresenterElapsed, 1000);
    if (window.brightdesk?.startPresenter) {
      window.brightdesk.startPresenter(createAudienceState()).then(result => {
        if (closing) {
          if (result?.ok) window.brightdesk.endPresenter().catch(() => {});
          return;
        }
        if (result?.ok) {
          audienceDisplayActive = true;
          const displayName = result.display?.label || 'second display';
          presenterDisplayStatus.textContent = `Audience slide is showing on the ${displayName}.`;
          window.brightdesk.updatePresenter(createAudienceState());
        } else {
          presenterDisplayStatus.textContent = 'No second display detected. Notes and preview remain on this screen.';
        }
      }).catch(() => {
        presenterDisplayStatus.textContent = 'The audience display could not be opened. Notes and preview remain on this screen.';
      });
    } else {
      presenterDisplayStatus.textContent = 'The audience display is not available in this build.';
    }
  }
}
function todoTasks() { return Array.isArray(activeDoc().tasks) ? activeDoc().tasks : (activeDoc().tasks = []); }
function saveTodoTasks() { persist(); $('todo-status').textContent = 'Saved on this device'; }
function replaceTodoTask(id, patch) {
  const tasks = todoTasks();
  const index = tasks.findIndex(task => task.id === id);
  if (index < 0) return;
  tasks[index] = window.BrightdeskTodoService.updateTask(tasks[index], patch);
  saveTodoTasks(); renderTodoWorkspace();
}
function renderTodoWorkspace() {
  const view = state.todoView || 'my-day';
  const titles = { 'my-day': 'My Day', important: 'Important', planned: 'Planned', tasks: 'Tasks', completed: 'Completed' };
  const descriptions = { 'my-day': 'Focus on what you want to get done today.', important: 'Keep your most important tasks close.', planned: 'See tasks that have a due date.', tasks: 'Everything you still need to do.', completed: 'Look back at what you have finished.' };
  $('todo-view-title').textContent = titles[view] || 'Tasks';
  $('todo-view-description').textContent = descriptions[view] || descriptions.tasks;
  $('todo-search').value = state.todoQuery || '';
  document.querySelectorAll('[data-todo-view]').forEach(button => button.classList.toggle('active', button.dataset.todoView === view));
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const tasks = window.BrightdeskTodoService.filterTasks(todoTasks(), { view, query: state.todoQuery, today });
  $('todo-task-count').textContent = `${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}`;
  const list = $('todo-task-list'); list.innerHTML = '';
  if (!tasks.length) {
    const empty = document.createElement('div'); empty.className = 'todo-empty';
    const heading = document.createElement('b'); heading.textContent = state.todoQuery ? 'No matching tasks' : (view === 'completed' ? 'Nothing completed yet' : 'All clear for now');
    const message = document.createElement('p'); message.textContent = state.todoQuery ? 'Try another search.' : (view === 'my-day' ? 'Add a task above to start your day.' : 'Tasks that match this view will appear here.');
    empty.append(heading, message); list.append(empty); return;
  }
  tasks.forEach(task => {
    const card = document.createElement('article'); card.className = 'todo-task-card'; card.setAttribute('role','listitem');
    const main = document.createElement('div'); main.className = 'todo-task-main';
    const check = document.createElement('input'); check.type = 'checkbox'; check.checked = task.completed; check.className = 'todo-complete'; check.setAttribute('aria-label', task.completed ? `Restore ${task.title}` : `Complete ${task.title}`);
    check.addEventListener('change', () => { const tasksNow = todoTasks(); const i = tasksNow.findIndex(item => item.id === task.id); if (i >= 0) { tasksNow[i] = window.BrightdeskTodoService.setCompleted(tasksNow[i], check.checked); saveTodoTasks(); renderTodoWorkspace(); } });
    const textWrap = document.createElement('div'); textWrap.className = 'todo-task-text';
    const title = document.createElement('b'); title.className = task.completed ? 'completed' : ''; title.textContent = task.title;
    textWrap.append(title);
    if (task.notes) { const notes = document.createElement('p'); notes.textContent = task.notes; textWrap.append(notes); }
    const meta = document.createElement('div'); meta.className = 'todo-task-meta';
    if (task.dueDate) { const due = document.createElement('span'); due.textContent = `Due ${new Date(`${task.dueDate}T12:00:00`).toLocaleDateString()}`; if (!task.completed && task.dueDate < today) due.classList.add('overdue'); meta.append(due); }
    if (task.priority !== 'normal') { const priority = document.createElement('span'); priority.className = `todo-priority ${task.priority}`; priority.textContent = `${task.priority[0].toUpperCase()}${task.priority.slice(1)} priority`; meta.append(priority); }
    if (task.myDay) { const day = document.createElement('span'); day.textContent = 'My Day'; meta.append(day); }
    if (meta.childNodes.length) textWrap.append(meta);
    main.append(check, textWrap); card.append(main);
    const actions = document.createElement('div'); actions.className = 'todo-task-actions';
    const important = document.createElement('button'); important.type = 'button'; important.className = task.important ? 'todo-icon-button selected' : 'todo-icon-button'; important.textContent = task.important ? '★' : '☆'; important.title = task.important ? 'Remove from Important' : 'Mark as Important'; important.setAttribute('aria-label', important.title); important.addEventListener('click', () => replaceTodoTask(task.id, { important: !task.important })); actions.append(important);
    const myDay = document.createElement('button'); myDay.type = 'button'; myDay.className = 'todo-icon-button'; myDay.textContent = task.myDay ? '−' : '+'; myDay.title = task.myDay ? 'Remove from My Day' : 'Add to My Day'; myDay.setAttribute('aria-label', myDay.title); myDay.addEventListener('click', () => replaceTodoTask(task.id, { myDay: !task.myDay })); actions.append(myDay);
    const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'todo-text-button'; edit.textContent = 'Edit'; edit.addEventListener('click', () => { const form = card.querySelector('.todo-edit-form'); if (form) { form.hidden = !form.hidden; return; } const editForm = document.createElement('form'); editForm.className = 'todo-edit-form';
      const titleInput = document.createElement('input'); titleInput.type = 'text'; titleInput.maxLength = 240; titleInput.required = true; titleInput.value = task.title; titleInput.setAttribute('aria-label','Task title');
      const notesInput = document.createElement('textarea'); notesInput.value = task.notes || ''; notesInput.placeholder = 'Add notes'; notesInput.setAttribute('aria-label','Task notes');
      const dueInput = document.createElement('input'); dueInput.type = 'date'; dueInput.value = task.dueDate || ''; dueInput.setAttribute('aria-label','Due date');
      const priorityInput = document.createElement('select'); priorityInput.setAttribute('aria-label','Priority'); [['low','Low'],['normal','Normal'],['high','High']].forEach(([value,label]) => { const option = document.createElement('option'); option.value=value; option.textContent=label; priorityInput.append(option); }); priorityInput.value=task.priority;
      const save = document.createElement('button'); save.type='submit'; save.className='primary small-action'; save.textContent='Save'; const cancel = document.createElement('button'); cancel.type='button'; cancel.className='secondary small-action'; cancel.textContent='Cancel'; cancel.addEventListener('click',()=>editForm.remove());
      editForm.append(titleInput,notesInput,dueInput,priorityInput,save,cancel); editForm.addEventListener('submit',event=>{event.preventDefault();try{replaceTodoTask(task.id,{title:titleInput.value,notes:notesInput.value,dueDate:dueInput.value,priority:priorityInput.value});}catch(error){$('todo-status').textContent=error.message;}}); card.append(editForm); titleInput.focus(); }); actions.append(edit);
    const remove = document.createElement('button'); remove.type='button'; remove.className='todo-text-button danger'; remove.textContent='Delete'; remove.addEventListener('click',()=>{if(!window.confirm(`Delete “${task.title}”?`))return; activeDoc().tasks=window.BrightdeskTodoService.deleteTask(todoTasks(),task.id); saveTodoTasks(); renderTodoWorkspace();}); actions.append(remove);
    card.append(actions); list.append(card);
  });
}
function createTodoTask(event) {
  event.preventDefault();
  try {
    const input = $('todo-new-title');
    const task = window.BrightdeskTodoService.createTask({ title: input.value, myDay: state.todoView === 'my-day' });
    todoTasks().push(task); saveTodoTasks(); input.value = ''; renderTodoWorkspace(); input.focus();
  } catch (error) { $('todo-status').textContent = error.message; }
}

let selectedListId = null;
let listQuery = '';
let listStatusFilter = '';
function allLists() { const doc = activeDoc(); if (!Array.isArray(doc.lists)) doc.lists = []; return doc.lists; }
function currentList() { return allLists().find(list => list.id === selectedListId) || null; }
function saveLists() { persist(); const status = $('lists-status'); if (status) status.textContent = 'Saved on this device'; }
function renderListsWorkspace() {
  const lists = allLists();
  if (!selectedListId || !lists.some(list => list.id === selectedListId)) selectedListId = lists[0]?.id || null;
  const sidebar = $('lists-sidebar-items'); sidebar.innerHTML = '';
  lists.forEach(list => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'lists-side-item' + (list.id === selectedListId ? ' active' : '');
    button.textContent = list.title; button.addEventListener('click', () => { selectedListId = list.id; renderListsWorkspace(); }); sidebar.append(button);
  });
  const list = currentList();
  $('lists-empty').hidden = Boolean(list);
  $('lists-detail').hidden = !list;
  if (!list) { $('lists-title').textContent = 'Your lists'; $('lists-record-count').textContent = '0 records'; return; }
  $('lists-title').textContent = list.title;
  $('lists-description').textContent = list.description || 'Keep your records organised in one place.';
  const filtered = window.BrightdeskListsService.filterItems(list, { query: listQuery, status: listStatusFilter });
  $('lists-record-count').textContent = `${filtered.length} of ${list.items.length} records`;
  const table = $('lists-table'); table.innerHTML = '';
  const head = document.createElement('thead'), headRow = document.createElement('tr');
  list.columns.forEach(column => { const th = document.createElement('th'); th.textContent = column.name; headRow.append(th); });
  const actionsHead = document.createElement('th'); actionsHead.textContent = 'Actions'; headRow.append(actionsHead); head.append(headRow); table.append(head);
  const body = document.createElement('tbody');
  filtered.forEach(item => {
    const tr = document.createElement('tr');
    list.columns.forEach(column => { const td = document.createElement('td'); td.textContent = item.values[column.id] || '—'; tr.append(td); });
    const actions = document.createElement('td');
    const edit = document.createElement('button'); edit.type='button'; edit.className='lists-row-action'; edit.textContent='Edit'; edit.addEventListener('click',()=>openListRecordForm(item)); actions.append(edit);
    const remove = document.createElement('button'); remove.type='button'; remove.className='lists-row-action danger'; remove.textContent='Delete'; remove.addEventListener('click',()=>{if(!confirm('Delete this record?'))return;const next=window.BrightdeskListsService.deleteItem(list,item.id);replaceCurrentList(next);}); actions.append(remove);
    tr.append(actions); body.append(tr);
  });
  if (!filtered.length) { const tr=document.createElement('tr'),td=document.createElement('td'); td.colSpan=list.columns.length+1; td.className='lists-no-records'; td.textContent=listQuery||listStatusFilter?'No records match these filters.':'No records yet. Add your first record above.'; tr.append(td); body.append(tr); }
  table.append(body);
  const columnSelect=$('lists-sort-column'); columnSelect.innerHTML='';
  list.columns.forEach(column=>{const option=document.createElement('option');option.value=column.id;option.textContent=column.name;columnSelect.append(option);});
}
function replaceCurrentList(next) { const lists=allLists(),i=lists.findIndex(item=>item.id===next.id); if(i>=0)lists[i]=next; saveLists(); renderListsWorkspace(); }
function createBrightdeskList(event) {
  event.preventDefault();
  try { const title=$('lists-new-name').value; const description=$('lists-new-description').value; const list=window.BrightdeskListsService.createList({title,description}); allLists().push(list); selectedListId=list.id; $('lists-new-list-form').reset(); saveLists(); renderListsWorkspace(); }
  catch(error) { $('lists-status').textContent=error.message; }
}
function openListRecordForm(item=null) {
  const list=currentList(); if(!list)return;
  const form=$('lists-record-form'); form.innerHTML='';
  list.columns.forEach(column=>{
    const label=document.createElement('label'); label.className='lists-field'; label.textContent=column.name;
    let input;
    if(column.type==='choice'){input=document.createElement('select');(column.options||[]).forEach(value=>{const option=document.createElement('option');option.value=value;option.textContent=value;input.append(option);});}
    else {input=document.createElement('input');input.type=column.type==='date'?'date':'text';}
    input.name=column.id; input.value=item?.values?.[column.id]||''; if(column.required)input.required=true; label.append(input); form.append(label);
  });
  const save=document.createElement('button');save.type='submit';save.className='primary';save.textContent=item?'Save changes':'Add record';form.append(save);
  const cancel=document.createElement('button');cancel.type='button';cancel.className='secondary';cancel.textContent='Cancel';cancel.addEventListener('click',()=>{form.hidden=true;});form.append(cancel);
  form.dataset.itemId=item?.id||'';form.hidden=false;
}
function saveListRecord(event) {
  event.preventDefault();const list=currentList();if(!list)return;
  try { const values={};list.columns.forEach(column=>{values[column.id]=$('lists-record-form').elements.namedItem(column.id)?.value||'';});
    const itemId=$('lists-record-form').dataset.itemId;
    const next=itemId?window.BrightdeskListsService.updateItem(list,itemId,{values}):window.BrightdeskListsService.addItem(list,{values});
    $('lists-record-form').hidden=true;replaceCurrentList(next);
  } catch(error) {$('lists-status').textContent=error.message;}
}
function addBrightdeskListColumn(event) {
  event.preventDefault();const list=currentList();if(!list)return;
  try { const name=$('lists-column-name').value;const type=$('lists-column-type').value;const options=$('lists-column-options').value.split(',').map(v=>v.trim()).filter(Boolean);
    const next=window.BrightdeskListsService.addColumn(list,{name,type,options});$('lists-column-form').reset();replaceCurrentList(next);
  } catch(error) {$('lists-status').textContent=error.message;}
}
function renameCurrentList() { const list=currentList();if(!list)return;const title=prompt('List name',list.title);if(title===null)return;try{replaceCurrentList(window.BrightdeskListsService.renameList(list,title));}catch(error){$('lists-status').textContent=error.message;} }
function deleteCurrentList() { const list=currentList();if(!list||!confirm(`Delete the list “${list.title}” and all its records?`))return;const lists=allLists();activeDoc().lists=lists.filter(item=>item.id!==list.id);selectedListId=null;saveLists();renderListsWorkspace(); }

function renderGenericWorkspace() {
  const doc = activeDoc();
  editor.hidden = false; sheetWrap.hidden = true; slideWrap.hidden = true; notesWrap.hidden = true;
  editor.contentEditable = 'true';
  editor.innerHTML = safeHtml(doc.html || `<h2>${escapeHtml(genericConfigs[state.app]?.heading || state.app)}</h2><p>${escapeHtml(genericConfigs[state.app]?.desc || 'Work locally in Brightdesk.')}</p><p></p>`);
  editor.oninput = () => { doc.html = editor.innerHTML; persist(); };
}

function renderAppManager() {
  const grid = $('app-manager-grid'); grid.innerHTML = '';
  $('manager-title').textContent = state.setupComplete ? t('manager.manageTitle') : t('manager.chooseTitle');
  $('manager-description').textContent = state.setupComplete
    ? t('manager.manageDesc')
    : t('manager.chooseDesc');
  $('manager-note').textContent = t('manager.note');
  $('finish-app-setup').textContent = state.setupComplete ? t('manager.done') : t('manager.installSelected');
  catalog.forEach(item => {
    const canInstall = item.availability === 'available';
    const selected = state.firstRunSelection.has(item.id);
    const isInstalled = installedApp(item.id);
    const card = document.createElement('article'); card.className = 'app-card';
    const preview = document.createElement('img'); preview.className = 'app-preview'; preview.src = `assets/apps/${item.id}.svg`; preview.alt = `${item.name} example screen`;
    const header = document.createElement('div'); header.className = 'app-card-header';
    let icon;
    if (item.id === 'slides') {
      icon = document.createElement('img');
      icon.className = 'app-icon-image app-card-app-icon';
      icon.src = 'branding/icons/decks.svg';
      icon.alt = `${item.name} icon`;
      icon.width = 48; icon.height = 48;
    } else {
      icon = document.createElement('span');
      icon.className = `app-icon ${item.className}`;
      icon.textContent = item.icon;
    }
    const heading = document.createElement('div'); heading.className = 'app-card-heading';
    const name = document.createElement('b'); name.textContent = item.name;
    const subtitle = document.createElement('small'); subtitle.textContent = item.subtitle;
    heading.append(name, subtitle); header.append(icon, heading);
    const description = document.createElement('p'); description.textContent = item.description;
    const footer = document.createElement('div'); footer.className = 'app-card-footer';
    const version = document.createElement('span'); version.className = 'module-version'; version.textContent = `Module ${item.moduleVersion}`;
    footer.append(version);
    if (!canInstall) {
      const comingSoon = document.createElement('span'); comingSoon.className = 'app-state'; comingSoon.textContent = 'In development'; footer.append(comingSoon);
    } else if (!state.setupComplete) {
      const label = document.createElement('label'); label.className = 'app-select-label';
      const check = document.createElement('input'); check.type = 'checkbox'; check.checked = selected; check.addEventListener('change', () => {
        if (check.checked) state.firstRunSelection.add(item.id); else state.firstRunSelection.delete(item.id);
        renderAppManager();
      });
      label.append(check, document.createTextNode(` ${t('manager.includeApp')}`)); footer.append(label);
    } else {
      const action = document.createElement('button'); action.className = isInstalled ? 'secondary small-action' : 'primary small-action';
      action.textContent = isInstalled ? t('manager.remove') : t('manager.install');
      action.addEventListener('click', () => toggleAppInstall(item.id)); footer.append(action);
      const stateTag = document.createElement('span'); stateTag.className = isInstalled ? 'app-state installed' : 'app-state'; stateTag.textContent = isInstalled ? t('manager.inWorkspace') : t('manager.notInstalled');
      footer.append(stateTag);
    }

    card.append(preview, header, description, footer); grid.append(card);
  });
}
function toggleAppInstall(id) {
  if (!installableCatalog.some(item => item.id === id) || launchAppId) return;
  if (installedApp(id)) {
    if (state.installedApps.length === 1) { alert('Keep at least one product in your Brightdesk workspace.'); return; }
    state.installedApps = state.installedApps.filter(appId => appId !== id);
    if (state.app === id) { state.app = state.installedApps[0]; state.ribbonTab = 'home'; }
  } else { state.installedApps.push(id); }
  saveAppSetup(); render();
}
function completeAppSetup() {
  const selected = [...state.firstRunSelection].filter(id => installableCatalog.some(item => item.id === id));
  if (!selected.length) { alert('Choose at least one product.'); return; }
  state.installedApps = selected; state.setupComplete = true; state.app = selected[0]; state.view = 'workspace';
  saveAppSetup(); render();
}

function installedPack(code) { return state.installedLanguagePacks.find(pack => pack.code === code) || null; }
function proofingPack() { return installedPack(state.proofingLanguage) || installedPack(state.displayLanguage) || installedPack('en-AU'); }
function updateDocumentLanguage() {
  const lang = state.proofingLanguage || state.displayLanguage || 'en-AU';
  editor.lang = lang; $('notes-editor').lang = lang;
  sheetWrap.querySelectorAll('input').forEach(input => { input.lang = lang; });
  slideWrap.querySelectorAll('textarea').forEach(input => { input.lang = lang; });
}
function syncAppNavigation() {
  const host = $('dynamic-app-nav'); if (!host) return;
  host.innerHTML = '';
  catalog.filter(item => !['pages','sheets','slides','notes'].includes(item.id) && installedApp(item.id)).forEach(item => {
    const button=document.createElement('button'); button.className='nav'; button.dataset.app=item.id;
    const icon=document.createElement('span'); icon.className=`app-icon ${item.className}`; icon.textContent=item.icon;
    const label=document.createElement('span'); const name=document.createElement('b'); name.textContent=item.name; const sub=document.createElement('small'); sub.textContent=item.subtitle;
    label.append(name,sub); button.append(icon,label);
    button.addEventListener('click',()=>setApp(item.id)); host.append(button);
  });
}

async function refreshLanguageData() {
  const data = await window.brightdesk.listLanguagePacks();
  state.languageCatalog = data.available || [];
  state.installedLanguagePacks = data.installed || [];
  state.spellCheckerLanguages = data.spellCheckerLanguages || [];
  state.usesNativeMacSpellChecker = data.usesNativeMacSpellChecker === true;
  if (!installedPack(state.displayLanguage)) state.displayLanguage = 'en-AU';
  if (!installedPack(state.proofingLanguage)) state.proofingLanguage = state.displayLanguage;
  window.BrightdeskI18n.setPacks(state.installedLanguagePacks, state.displayLanguage);
  updateDocumentLanguage();
  try { await window.brightdesk.setProofingLanguage(state.proofingLanguage); } catch (error) { console.warn('Could not configure the proofing dictionary.', error); }
  localStorage.setItem('brightdesk-display-language', state.displayLanguage);
  localStorage.setItem('brightdesk-proofing-language', state.proofingLanguage);
}
function languageCard(pack, installed) {
  const card = document.createElement('article'); card.className = 'app-card language-card';
  const header = document.createElement('div'); header.className = 'app-card-header';
  const icon = document.createElement('span'); icon.className = 'language-code-mark'; icon.textContent = pack.code.split('-')[0].toUpperCase();
  const heading = document.createElement('div'); heading.className = 'app-card-heading';
  const name = document.createElement('b'); name.textContent = pack.name;
  const subtitle = document.createElement('small'); subtitle.textContent = `${pack.nativeName} · ${pack.code}`;
  heading.append(name, subtitle); header.append(icon, heading);
  const description = document.createElement('p'); description.textContent = installed ? t('language.installed') : t('language.install');
  const footer = document.createElement('div'); footer.className = 'app-card-footer';
  const stateLabel = document.createElement('span'); stateLabel.className = installed ? 'app-state installed' : 'app-state';
  stateLabel.textContent = pack.code === 'en-AU' ? 'Default · protected' : (installed ? 'Installed · protected' : ''); footer.append(stateLabel);
  if (installed) {
    // Installed language resources are bundled catalogue data and remain read-only.
  } else {
    const install = document.createElement('button'); install.className = 'primary small-action'; install.textContent = t('language.install');
    install.addEventListener('click', () => installLanguagePack(pack.code)); footer.append(install);
  }
  card.append(header, description, footer); return card;
}
function renderLanguageManager() {
  const installedGrid = $('installed-language-grid'), availableGrid = $('available-language-grid');
  installedGrid.innerHTML = ''; availableGrid.innerHTML = '';
  const display = $('display-language'), proofing = $('proofing-language');
  display.innerHTML = ''; proofing.innerHTML = '';
  const displayPlaceholder = document.createElement('option'); displayPlaceholder.value = ''; displayPlaceholder.textContent = t('language.selectDisplay'); display.append(displayPlaceholder);
  const proofingPlaceholder = document.createElement('option'); proofingPlaceholder.value = ''; proofingPlaceholder.textContent = t('language.selectProofing'); proofing.append(proofingPlaceholder);
  for (const pack of state.installedLanguagePacks) {
    const displayOption = document.createElement('option'); displayOption.value = pack.code; displayOption.textContent = `${pack.nativeName} (${pack.code})`; display.append(displayOption);
    const proofingOption = document.createElement('option'); proofingOption.value = pack.code; proofingOption.textContent = `${pack.nativeName} (${pack.code})`; proofing.append(proofingOption);
    installedGrid.append(languageCard(pack, true));
  }
  display.value = state.displayLanguage; proofing.value = state.proofingLanguage;
  const installedCodes = new Set(state.installedLanguagePacks.map(pack => pack.code));
  state.languageCatalog.filter(pack => !installedCodes.has(pack.code)).forEach(pack => availableGrid.append(languageCard(pack, false)));
  if (!availableGrid.children.length) {
    const empty = document.createElement('p'); empty.className = 'language-empty'; empty.textContent = t('language.allInstalled'); availableGrid.append(empty);
  }
  $('proofing-status').textContent = state.usesNativeMacSpellChecker ? t('language.proofingNative') : (state.spellCheckerLanguages.includes(proofingPack()?.proofingCode || state.proofingLanguage) ? t('language.proofingSupported') : t('language.proofingUnavailable'));
  window.BrightdeskI18n.localizeStaticElements($('language-manager'));
  renderDictionaryManager();
}
async function refreshDictionaries() {
  const [installed, catalogue] = await Promise.all([
    window.brightdesk.listDictionaries(),
    window.brightdesk.listDictionaryCatalogue()
  ]);
  state.installedDictionaries = installed;
  state.dictionaryCatalogue = catalogue;
  if (!state.installedDictionaries.some(item => item.locale === state.selectedDictionary)) {
    const matching = state.installedDictionaries.find(item => item.locale.toLowerCase() === state.proofingLanguage.toLowerCase());
    state.selectedDictionary = matching?.locale || state.installedDictionaries[0]?.locale || '';
  }
  localStorage.setItem('brightdesk-selected-dictionary', state.selectedDictionary);
}
function renderDictionaryManager() {
  const grid = $('installed-dictionary-grid');
  const select = $('proofing-dictionary');
  if (!grid || !select) return;
  grid.innerHTML = ''; select.innerHTML = '';
  const placeholder = document.createElement('option'); placeholder.value = '';
  placeholder.textContent = state.installedDictionaries.length ? 'Choose a spelling dictionary' : 'No dictionaries installed';
  select.append(placeholder);
  for (const item of state.installedDictionaries) {
    const option = document.createElement('option'); option.value = item.locale;
    option.textContent = `${item.nativeName} (${item.locale})`; select.append(option);
    const card = document.createElement('article'); card.className = 'app-card language-card';
    const header = document.createElement('div'); header.className = 'app-card-header';
    const mark = document.createElement('span'); mark.className = 'language-code-mark'; mark.textContent = item.locale.split('-')[0].toUpperCase();
    const heading = document.createElement('div'); heading.className = 'app-card-heading';
    const name = document.createElement('b'); name.textContent = item.name;
    const subtitle = document.createElement('small'); subtitle.textContent = `${item.nativeName} · ${item.locale}`;
    heading.append(name, subtitle); header.append(mark, heading);
    const description = document.createElement('p'); description.textContent = `Licence: ${item.license} · Engine: ${item.engine}`;
    const source = document.createElement('small'); source.className = 'dictionary-source'; source.textContent = `Source: ${item.sourceUrl}`;
    const footer = document.createElement('div'); footer.className = 'app-card-footer';
    const status = document.createElement('span'); status.className = 'app-state installed'; status.textContent = 'Installed · protected'; footer.append(status);
    card.append(header, description, source, footer); grid.append(card);
  }
  select.value = state.selectedDictionary;
  $('dictionary-status').textContent = state.installedDictionaries.length
    ? `${state.installedDictionaries.length} spelling dictionary/dictionaries installed and available offline. The built-in OS spell checker remains available too.`
    : 'No additional dictionaries are installed. The built-in OS spell checker remains available; additional dictionary files are supplied only through official Brightdesk updates.';
  renderAvailableDictionaryCatalogue();
  renderToolbar();
}

function renderAvailableDictionaryCatalogue() {
  const grid = $('available-dictionary-grid');
  const search = $('dictionary-search');
  const count = $('dictionary-catalogue-count');
  if (!grid || !search || !count) return;
  const query = search.value.trim().toLocaleLowerCase();
  const matching = state.dictionaryCatalogue.filter(item =>
    `${item.name} ${item.nativeName} ${item.locale} ${item.license}`.toLocaleLowerCase().includes(query)
  );
  const visible = query ? matching.slice(0, 30) : matching.slice(0, 18);
  grid.innerHTML = '';
  count.textContent = query
    ? `${matching.length} matching catalogue entries${matching.length > visible.length ? ` · showing first ${visible.length}` : ''}`
    : `Showing ${visible.length} of ${matching.length} catalogue entries. Search to find more.`;

  for (const item of visible) {
    const card = document.createElement('article'); card.className = 'app-card language-card';
    const header = document.createElement('div'); header.className = 'app-card-header';
    const mark = document.createElement('span'); mark.className = 'language-code-mark'; mark.textContent = item.locale.split('-')[0].toUpperCase();
    const heading = document.createElement('div'); heading.className = 'app-card-heading';
    const name = document.createElement('b'); name.textContent = item.name;
    const subtitle = document.createElement('small'); subtitle.textContent = `${item.nativeName} · ${item.locale}`;
    heading.append(name, subtitle); header.append(mark, heading);
    const description = document.createElement('p'); description.textContent = `Licence: ${item.license} · Compatibility: Hunspell subset; advanced rules may need review`;
    const source = document.createElement('small'); source.className = 'dictionary-source'; source.textContent = `Source: ${item.upstream} · revision ${item.upstreamRevision.slice(0, 8)}`;
    const footer = document.createElement('div'); footer.className = 'app-card-footer';
    const status = document.createElement('span'); status.className = item.installed ? 'app-state installed' : 'app-state';
    status.textContent = item.installed ? 'Installed' : 'Not included in this build'; footer.append(status);
    card.append(header, description, source, footer); grid.append(card);
  }
  if (!visible.length) {
    const empty = document.createElement('p'); empty.className = 'language-empty'; empty.textContent = 'No dictionaries match that search.'; grid.append(empty);
  }
}

function currentDocumentText() {
  if (state.app === 'pages') return editor.innerText || '';
  if (state.app === 'notes') return $('notes-editor').value || '';
  if (state.app === 'slides') return (activeDoc().slides || []).map(slide => `${slide.title || ''}\n${slide.body || ''}`).join('\n');
  if (state.app === 'sheets') return (activeDoc().cells || []).flat().filter(value => !String(value ?? '').startsWith('=')).map(value => String(value ?? '')).join('\n');
  return '';
}
async function checkCurrentDocumentSpelling() {
  const locale = state.selectedDictionary;
  if (!locale) { $('dictionary-status').textContent = 'Choose or install a spelling dictionary first.'; return; }
  try {
    const result = await window.brightdesk.checkSpelling({ locale, text: currentDocumentText() });
    const issues = result.misspellings || [];
    $('dictionary-status').textContent = issues.length
      ? `${issues.length} possible misspelling(s) found using ${locale}.`
      : `No possible misspellings found using ${locale}.`;
    if (!issues.length) { alert(`Spelling check complete. No possible misspellings were found using ${locale}.`); return; }
    const lines = issues.slice(0, 40).map(item => `${item.word} (${item.occurrences})${item.suggestions.length ? ` — Suggestions: ${item.suggestions.join(', ')}` : ''}`);
    const extra = issues.length > 40 ? `\n…and ${issues.length - 40} more.` : '';
    const capped = result.truncated ? '\nOnly the first 200 unique words are shown.' : '';
    alert(`Possible spelling issues (${locale}):\n\n${lines.join('\n')}${extra}${capped}\n\nThis check reports suggestions only; it does not change your document.`);
  } catch (error) { $('dictionary-status').textContent = `Spell check failed: ${error.message}`; }
}
async function openLanguageManager() {
  state.view = 'languages';
  try { await refreshLanguageData(); await refreshDictionaries(); } catch (error) { console.error(error); $('language-status').textContent = error.message; }
  render();
}
async function installLanguagePack(code) {
  try {
    await window.brightdesk.installLanguagePack(code);
    await refreshLanguageData(); render(); $('language-status').textContent = t('language.packInstalled');
  } catch (error) { $('language-status').textContent = error.message; }
}
async function changeDisplayLanguage(code) {
  if (!installedPack(code)) return;
  state.displayLanguage = code; localStorage.setItem('brightdesk-display-language', code);
  window.BrightdeskI18n.setPacks(state.installedLanguagePacks, code);
  render();
}
async function changeProofingLanguage(code) {
  if (!installedPack(code)) return;
  state.proofingLanguage = code; localStorage.setItem('brightdesk-proofing-language', code); updateDocumentLanguage();
  const languageBase = code.split('-')[0].toLowerCase();
  const matchingDictionary = state.installedDictionaries.find(item => item.locale.toLowerCase() === code.toLowerCase()) ||
    state.installedDictionaries.find(item => item.locale.split('-')[0].toLowerCase() === languageBase);
  state.selectedDictionary = matchingDictionary ? matchingDictionary.locale : '';
  localStorage.setItem('brightdesk-selected-dictionary', state.selectedDictionary);
  const dictionarySelect = $('proofing-dictionary');
  if (dictionarySelect) dictionarySelect.value = state.selectedDictionary;
  try {
    const result = await window.brightdesk.setProofingLanguage(code);
    $('proofing-status').textContent = state.usesNativeMacSpellChecker ? t('language.proofingNative') : (result?.supported ? t('language.proofingSupported') : t('language.proofingUnavailable'));
  } catch (error) { $('proofing-status').textContent = error.message; }
}

function render() {
  window.BrightdeskI18n.localizeStaticElements();
  document.querySelectorAll('.nav[data-app]').forEach(btn => {
    const appId = btn.dataset.app;
    const name = btn.querySelector('b'); if (name) name.textContent = t(`apps.${appId}`);
  });
  const manager = state.view === 'manager';
  const languages = state.view === 'languages';
  $('app-manager').hidden = !manager; $('language-manager').hidden = !languages;
  $('workspace').hidden = manager || languages; $('welcome').hidden = manager || languages || ['todo','lists','forms','planner','database','loop'].includes(state.app);
  $('app-title').textContent = manager ? t('sidebar.getApps') : (languages ? t('language.title') : (catalog.find(item => item.id === state.app)?.name || state.app));
  $('top-actions').hidden = manager || languages;
  if (manager) {
    $('save-status').textContent = t('manager.manageTitle'); renderAppManager();
  } else if (languages) {
    $('save-status').textContent = t('language.title'); renderLanguageManager();
  } else {
    const configKey = state.app;
    const coreWelcome = ['pages','sheets','slides','notes'].includes(configKey); $('welcome-title').textContent = coreWelcome ? t(`welcome.${configKey}Heading`) : (genericConfigs[configKey]?.heading || configKey); $('welcome-desc').textContent = coreWelcome ? t(`welcome.${configKey}Desc`) : (genericConfigs[configKey]?.desc || '');
    editor.setAttribute('data-placeholder', t('common.startTyping'));
    const doc = activeDoc();
    $('doc-title').value = doc.title || defaults[state.app].title;
    const isTodo = state.app === 'todo';
    const isLists = state.app === 'lists';
    const isForms = state.app === 'forms';
    const isPlanner = state.app === 'planner';
    const isDatabase = state.app === 'database';
    const isWorkspace = state.app === 'loop';
    $('todo-wrap').hidden = !isTodo; $('lists-wrap').hidden = !isLists; $('forms-wrap').hidden = !isForms; $('planner-wrap').hidden = !isPlanner; $('database-wrap').hidden = !isDatabase; $('workspace-app-wrap').hidden = !isWorkspace;
    $('open-button').hidden = isTodo || isLists || isForms || isPlanner || isDatabase || isWorkspace; $('save-project').hidden = isTodo || isLists || isForms || isPlanner || isDatabase || isWorkspace; $('export-button').hidden = isTodo || isLists || isForms || isPlanner || isDatabase || isWorkspace;
    document.querySelector('.document-bar').hidden = isTodo || isLists || isForms || isPlanner || isDatabase || isWorkspace; $('ribbon-tabs').hidden = isTodo || isLists || isForms || isPlanner || isDatabase || isWorkspace; $('toolbar').hidden = isTodo || isLists || isForms || isPlanner || isDatabase || isWorkspace;
    editor.hidden = !['pages'].includes(state.app); sheetWrap.hidden = state.app !== 'sheets'; slideWrap.hidden = state.app !== 'slides'; notesWrap.hidden = !['notes'].includes(state.app);
    editor.innerHTML = state.app === 'pages' ? safeHtml(doc.html) : '';
    if (state.app === 'pages') applyPageLayout(); else editor.removeAttribute('style');
    $('notes-editor').value = state.app === 'notes' ? (doc.text || '') : '';
    updateDocumentLanguage();
    if (state.app === 'sheets') renderSheet(); if (state.app === 'slides') renderSlides();
    if (isTodo) renderTodoWorkspace();
    else if (isLists) renderListsWorkspace();
    else if (isForms) window.BrightdeskFormsUI.render();
    else if (isPlanner) window.BrightdeskPlannerUI.render();
    else if (isDatabase) window.BrightdeskDatabaseUI.render();
    else if (isWorkspace) window.BrightdeskWorkspaceUI.render();
    else if (!['pages','sheets','slides','notes'].includes(state.app)) renderGenericWorkspace();
    renderToolbar();
    $('workspace').classList.toggle('focus-mode', state.focusMode);
  }
  syncAppNavigation();
  document.querySelectorAll('.nav[data-app]').forEach(btn => {
    const visible = launchAppId ? btn.dataset.app === launchAppId : installedApp(btn.dataset.app); btn.hidden = !visible; btn.classList.toggle('active', !manager && !languages && btn.dataset.app === state.app);
  });
  $('manage-apps').hidden = Boolean(launchAppId);
  $('manage-apps').classList.toggle('active', manager);
  $('manage-languages').classList.toggle('active', languages);
}
function collectDocxBlocks() {
  const blocks=[];
  const walk=(el,type='paragraph')=>{
    if(el.nodeType===Node.TEXT_NODE){if(el.textContent.trim())blocks.push({type,text:el.textContent.trim()});return;}
    if(el.nodeType!==Node.ELEMENT_NODE)return;
    const tag=el.tagName.toLowerCase();const blockType=tag==='h1'?'h1':tag==='h2'?'h2':tag==='li'?'li':type;
    if(['p','div','h1','h2','h3','li','blockquote'].includes(tag)){
      const runs=[];const run=(node,style={})=>{if(node.nodeType===Node.TEXT_NODE){if(node.textContent)runs.push({text:node.textContent,...style});}else if(node.nodeType===Node.ELEMENT_NODE){const next={...style,bold:style.bold||['b','strong'].includes(node.tagName.toLowerCase()),italic:style.italic||['i','em'].includes(node.tagName.toLowerCase()),underline:style.underline||node.tagName.toLowerCase()==='u'};node.childNodes.forEach(n=>run(n,next));}};
      el.childNodes.forEach(n=>run(n));const text=runs.map(r=>r.text).join('').trim();if(text)blocks.push({type:blockType,text,bold:runs.length>0&&runs.every(r=>r.bold),italic:runs.length>0&&runs.every(r=>r.italic),underline:runs.length>0&&runs.every(r=>r.underline)});
    } else el.childNodes.forEach(n=>walk(n,type));
  };
  editor.childNodes.forEach(n=>walk(n));return blocks;
}
function exportPayload(){
  const doc=activeDoc(),title=$('doc-title').value||'Brightdesk file';doc.title=title;
  if(state.app==='pages')return {kind:'pages',title,html:editor.innerHTML,blocks:collectDocxBlocks()};
  if(state.app==='sheets')return {kind:'sheets',title,rows:doc.cells||[]};
  if(state.app==='slides')return {kind:'slides',title,slideSize:doc.slideSize||'widescreen',themeId:doc.themeId||'lavender',slides:doc.slides||[]};
  return {kind:'notes',title,text:$('notes-editor').value||''};
}
async function exportCurrent(){try{const result=await window.brightdesk.exportFile(exportPayload());if(result?.canceled)return;setStatus('Exported successfully');}catch(error){alert(`Export failed: ${error.message}`);}}
async function exportPdf(){try{const result=await window.brightdesk.exportPdf({title:$('doc-title').value});if(!result?.canceled)setStatus('PDF exported');}catch(error){alert(`PDF export failed: ${error.message}`);}}
function importProject(data){
  if (launchAppId && data?.kind && data.kind !== launchAppId) throw new Error(`This Brightdesk ${appLabel(launchAppId)} installation opens ${appLabel(launchAppId)} files only.`);
  if(data?.docs && typeof data.docs === 'object'){
    clearSavedSlideHistory();
    state.docs={...clone(defaults),...data.docs};
    for (const id of Object.keys(configs)) if (!state.docs[id] || typeof state.docs[id] !== 'object') state.docs[id] = clone(defaults[id]);
    const preferred = configs[state.app] ? state.app : 'pages';
    const target = state.setupComplete && installedApp(preferred) ? preferred : 'pages';
    if (!state.setupComplete || !installedApp(target)) { state.installedApps = [target]; state.setupComplete = true; }
    state.app = target; state.view = 'workspace'; state.ribbonTab = 'home'; state.focusMode = false;
    saveAppSetup(); return;
  }
  const kind=data?.kind;if(!configs[kind])throw new Error('This file could not be imported.');
  if (!installedApp(kind)) { state.installedApps.push(kind); state.setupComplete = true; saveAppSetup(); }
  if(kind==='pages')state.docs.pages={title:data.title||'Imported document',html:data.html?safeHtml(data.html):`<p>${escapeHtml(data.text||'')}</p>`};
  if(kind==='sheets')state.docs.sheets={title:data.title||'Imported spreadsheet',cells:(data.cells||[]).map(row=>row.map(v=>String(v??'')))};
  if(kind==='slides'){
    clearSavedSlideHistory();
    state.docs.slides={title:data.title||'Imported presentation',slideSize:data.slideSize||'widescreen',themeId:data.themeId||'lavender',slides:data.slides||clone(defaults.slides.slides),current:0};
  }
  if(kind==='notes')state.docs.notes={title:data.title||'Imported note',text:data.text||''};
  state.app=kind; state.ribbonTab='home';
}
function escapeHtml(value){return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
async function openFile(){try{const data=await window.brightdesk.openFile();if(!data)return;importProject(data);persist();render();setStatus('File opened');}catch(error){alert(`Could not open file: ${error.message}`);}}
async function saveProject(){try{const result=await window.brightdesk.saveProject({title:$('doc-title').value,docs:state.docs});if(!result?.canceled)setStatus('Project saved');}catch(error){alert(`Could not save project: ${error.message}`);}}
function setApp(app){if((launchAppId && app !== launchAppId) || !(configs[app] || genericConfigs[app]) || !installedApp(app))return;state.app=app;state.view='workspace';state.ribbonTab='home';render();persist();}

document.addEventListener('keydown', event => {
  if (state.app !== 'slides' || state.view !== 'workspace' || document.querySelector('.presentation-overlay')) return;
  const modifier = event.ctrlKey || event.metaKey;
  if (modifier && event.shiftKey && event.key.toLowerCase() === 'n') {
    event.preventDefault();
    addSlide();
    return;
  }
  if (modifier && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    if (event.shiftKey) redoSlideEdit();
    else undoSlideEdit();
    return;
  }
  if (modifier && event.key.toLowerCase() === 'y') {
    event.preventDefault();
    redoSlideEdit();
    return;
  }
  if (event.key !== 'F5' || document.querySelector('.presentation-overlay')) return;
  event.preventDefault();
  presentSlides(!event.shiftKey);
});
document.querySelectorAll('.nav[data-app]').forEach(btn=>btn.addEventListener('click',()=>setApp(btn.dataset.app)));
$('manage-apps').addEventListener('click',()=>{if (launchAppId) return; state.view='manager';render();});
$('manage-languages').addEventListener('click',openLanguageManager);
$('display-language').addEventListener('change',event=>changeDisplayLanguage(event.target.value));
$('proofing-language').addEventListener('change',event=>changeProofingLanguage(event.target.value));
$('dictionary-search').addEventListener('input',renderAvailableDictionaryCatalogue);
$('proofing-dictionary').addEventListener('change',event=>{state.selectedDictionary=event.target.value;localStorage.setItem('brightdesk-selected-dictionary',state.selectedDictionary);renderToolbar();});
$('check-current-document').addEventListener('click',checkCurrentDocumentSpelling);
$('back-to-apps').addEventListener('click',()=>{state.view=state.setupComplete?'workspace':'manager';render();});
$('finish-app-setup').addEventListener('click',()=>{if(state.setupComplete){state.view='workspace';render();}else completeAppSetup();});
$('doc-title').addEventListener('change',()=>{activeDoc().title=$('doc-title').value;persist();});
editor.addEventListener('input',()=>{activeDoc().html=editor.innerHTML;persist();});
$('notes-editor').addEventListener('input',()=>{activeDoc().text=$('notes-editor').value;persist();});
$('todo-create-form').addEventListener('submit', createTodoTask);
$('todo-search').addEventListener('input', event => { state.todoQuery = event.target.value; renderTodoWorkspace(); });
document.querySelectorAll('[data-todo-view]').forEach(button => button.addEventListener('click', () => { state.todoView = button.dataset.todoView; renderTodoWorkspace(); }));
$('lists-new-list-form').addEventListener('submit', createBrightdeskList);
$('lists-record-form').addEventListener('submit', saveListRecord);
$('lists-add-record').addEventListener('click',()=>openListRecordForm());
$('lists-column-form').addEventListener('submit',addBrightdeskListColumn);
$('lists-search').addEventListener('input',event=>{listQuery=event.target.value;renderListsWorkspace();});
$('lists-status-filter').addEventListener('change',event=>{listStatusFilter=event.target.value;renderListsWorkspace();});
$('lists-sort-button').addEventListener('click',()=>{const list=currentList();if(!list)return;const sorted=window.BrightdeskListsService.sortItems(list.items,$('lists-sort-column').value,$('lists-sort-direction').value);list.items=sorted;saveLists();renderListsWorkspace();});
$('lists-rename').addEventListener('click',renameCurrentList);
$('lists-delete').addEventListener('click',deleteCurrentList);
$('lists-column-type').addEventListener('change',()=>{$('lists-column-options-wrap').hidden=$('lists-column-type').value!=='choice';});
$('export-button').addEventListener('click',exportCurrent);$('open-button').addEventListener('click',openFile);$('save-project').addEventListener('click',saveProject);
function setUpdateMessage(message, loading = false) {
  const msg = $('update-message');
  msg.hidden = false;
  if (!loading) {
    msg.textContent = message;
    return;
  }
  const spinner = document.createElement('span');
  spinner.className = 'bd-motion-spinner';
  spinner.setAttribute('aria-hidden', 'true');
  spinner.textContent = '◌';
  msg.replaceChildren(spinner, document.createTextNode(' ' + message));
}

$('updates-button').addEventListener('click', async () => {
  setUpdateMessage(t('common.updateChecking'), true);
  try {
    const result = await window.brightdesk.checkForUpdates();
    if (!result?.ok) setUpdateMessage(result?.message || 'Update checks are not configured yet.');
  } catch (error) {
    setUpdateMessage(`Update check failed: ${error.message}`);
  }
});
window.brightdesk.onUpdateState?.(updateState => {
  const loading = updateState.status === 'checking' || updateState.status === 'downloading';
  setUpdateMessage(updateState.message, loading);
  if (updateState.status === 'available') {
    setUpdateMessage(updateState.message);
  }
  if (updateState.status === 'downloaded') {
    const button = document.createElement('button');
    button.className = 'text-button';
    button.textContent = t('common.restartInstall');
    button.onclick = () => window.brightdesk.installUpdate();
    $('update-message').append(' ', button);
  }
});
loadLocal();$('platform').textContent=`Brightdesk desktop · ${window.brightdesk.platform}`;
(async()=>{
  try {
    const version = await window.brightdesk.getVersion();
    if (version) { $('version-label').textContent = `Version ${version}`; $('footer-version').textContent = `Brightdesk ${version}`; }
  } catch (error) { console.warn('The desktop version could not be read.', error); }
  try { await refreshLanguageData(); } catch(error) { console.error('Language packs could not be loaded.',error); }
  try { await refreshDictionaries(); } catch(error) { console.error('Spelling dictionaries could not be loaded.',error); }
  render();
})();
