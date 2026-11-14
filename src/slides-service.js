'use strict';

(function (root, factory) {
  const service = factory();
  if (typeof module === 'object' && module.exports) module.exports = service;
  if (root) root.BrightdeskSlidesService = service;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const SLIDE_LAYOUTS = Object.freeze([
    'title',
    'title-content',
    'two-content',
    'section-header'
  ]);
  const DEFAULT_LAYOUT = 'title-content';
  const SLIDE_LAYOUT_IDS = Object.freeze({
    title: 'layout-title',
    'title-content': 'layout-title-content',
    'two-content': 'layout-two-content',
    'section-header': 'layout-section-header'
  });
  const SLIDE_LAYOUT_BY_ID = new Map(
    Object.entries(SLIDE_LAYOUT_IDS).map(([layout, id]) => [id, layout])
  );
  const SLIDE_LAYOUT_DEFINITIONS = Object.freeze({
    title: Object.freeze({
      layout: 'title',
      id: SLIDE_LAYOUT_IDS.title,
      label: 'Title slide',
      titlePlaceholder: 'Add a presentation title',
      titleLabel: 'Slide title',
      bodyPlaceholder: 'Add a subtitle',
      bodyLabel: 'Slide subtitle',
      secondaryBodyPlaceholder: null,
      secondaryBodyLabel: null
    }),
    'title-content': Object.freeze({
      layout: 'title-content',
      id: SLIDE_LAYOUT_IDS['title-content'],
      label: 'Title and content',
      titlePlaceholder: 'Add a slide title',
      titleLabel: 'Slide title',
      bodyPlaceholder: 'Add your content',
      bodyLabel: 'Slide content',
      secondaryBodyPlaceholder: null,
      secondaryBodyLabel: null
    }),
    'two-content': Object.freeze({
      layout: 'two-content',
      id: SLIDE_LAYOUT_IDS['two-content'],
      label: 'Two content',
      titlePlaceholder: 'Add a comparison title',
      titleLabel: 'Slide title',
      bodyPlaceholder: 'Add first-column content',
      bodyLabel: 'First content column',
      secondaryBodyPlaceholder: 'Add second-column content',
      secondaryBodyLabel: 'Second content column'
    }),
    'section-header': Object.freeze({
      layout: 'section-header',
      id: SLIDE_LAYOUT_IDS['section-header'],
      label: 'Section header',
      titlePlaceholder: 'Add a section title',
      titleLabel: 'Section title',
      bodyPlaceholder: 'Add a short introduction',
      bodyLabel: 'Section introduction',
      secondaryBodyPlaceholder: null,
      secondaryBodyLabel: null
    })
  });
  const SLIDE_SIZES = Object.freeze(['widescreen', 'standard']);
  const DEFAULT_SLIDE_SIZE = 'widescreen';
  const SLIDE_THEMES = Object.freeze(['lavender', 'midnight', 'paper']);
  const DEFAULT_SLIDE_THEME = 'lavender';
  const SLIDE_THEME_BACKGROUND_COLORS = Object.freeze({
    lavender: '#FCF3E9',
    midnight: '#202B3B',
    paper: '#FFFFFF'
  });
  const MAX_SECTION_NAME_LENGTH = 80;
  let sectionSequence = 0;
  let slideSequence = 0;

  function assertPresentation(presentation) {
    if (!presentation || typeof presentation !== 'object' || Array.isArray(presentation)) {
      throw new TypeError('A presentation object is required.');
    }
    return presentation;
  }

  function createSlideId(usedIds = new Set()) {
    let id;
    do {
      const random = typeof globalThis.crypto?.randomUUID === 'function'
        ? globalThis.crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${(++slideSequence).toString(36)}`;
      id = `slide-${random}`;
    } while (usedIds.has(id));
    usedIds.add(id);
    return id;
  }

  function isValidSlideId(value) {
    return typeof value === 'string'
      && value.length > 0
      && value.length <= 100
      && value.trim() === value
      && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value);
  }

  function isValidSlideBackgroundColor(value) {
    return typeof value === 'string' && /^#[0-9A-F]{6}$/i.test(value);
  }

  function getReadableTextColor(backgroundColor) {
    if (!isValidSlideBackgroundColor(backgroundColor)) {
      throw new RangeError('The selected slide background colour is not supported.');
    }
    const hex = backgroundColor.slice(1);
    const channels = [0, 2, 4].map(offset => {
      const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    return luminance < 0.179 ? '#FFFFFF' : '#000000';
  }

  function normalizeSlide(slide, usedIds = null) {
    const source = slide && typeof slide === 'object' && !Array.isArray(slide) ? slide : {};
    const layoutFromId = typeof source.layoutId === 'string' ? SLIDE_LAYOUT_BY_ID.get(source.layoutId) : null;
    const layout = SLIDE_LAYOUTS.includes(source.layout)
      ? source.layout
      : (layoutFromId || DEFAULT_LAYOUT);
    const layoutId = SLIDE_LAYOUT_IDS[layout];
    const candidateId = source.id;
    const idIsAvailable = isValidSlideId(candidateId) && (!usedIds || !usedIds.has(candidateId));
    const id = idIsAvailable ? candidateId : createSlideId(usedIds || new Set());
    if (usedIds) usedIds.add(id);
    const normalized = {
      ...source,
      id,
      title: String(source.title ?? ''),
      body: String(source.body ?? ''),
      bodySecondary: String(source.bodySecondary ?? ''),
      notes: String(source.notes ?? ''),
      layout,
      layoutId
    };
    if (isValidSlideBackgroundColor(source.backgroundColor)) {
      normalized.backgroundColor = source.backgroundColor.toUpperCase();
    } else {
      delete normalized.backgroundColor;
    }
    if (source.hidden === true) normalized.hidden = true;
    else delete normalized.hidden;
    return normalized;
  }

  function normalizeSectionName(name) {
    const normalized = String(name ?? '').trim();
    if (!normalized) throw new TypeError('A section name is required.');
    if (normalized.length > MAX_SECTION_NAME_LENGTH) {
      throw new RangeError(`Section names must be ${MAX_SECTION_NAME_LENGTH} characters or fewer.`);
    }
    return normalized;
  }

  function createSectionId(sections) {
    const used = new Set(sections.map(section => section.id));
    let id;
    do {
      sectionSequence++;
      id = `section-${Date.now().toString(36)}-${sectionSequence.toString(36)}`;
    } while (used.has(id));
    return id;
  }

  function normalizeSections(presentation) {
    const source = Array.isArray(presentation.sections) ? presentation.sections : [];
    const seen = new Set();
    const sections = [];
    for (const item of source) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const id = typeof item.id === 'string' ? item.id.trim() : '';
      const name = typeof item.name === 'string' ? item.name.trim() : '';
      if (!id || id.length > 100 || !name || name.length > MAX_SECTION_NAME_LENGTH || seen.has(id)) continue;
      seen.add(id);
      sections.push({ id, name });
    }
    presentation.sections = sections;
    const validIds = new Set(sections.map(section => section.id));
    presentation.slides = presentation.slides.map(slide => {
      const normalized = normalizeSlide(slide);
      if (typeof normalized.sectionId !== 'string' || !validIds.has(normalized.sectionId)) {
        delete normalized.sectionId;
      }
      return normalized;
    });
    const usedIds = new Set(presentation.slides.map(slide => slide.sectionId).filter(Boolean));
    const firstIndex = new Map();
    presentation.slides.forEach((slide, index) => {
      if (slide.sectionId && !firstIndex.has(slide.sectionId)) firstIndex.set(slide.sectionId, index);
    });
    presentation.sections = sections
      .filter(section => usedIds.has(section.id))
      .sort((left, right) => firstIndex.get(left.id) - firstIndex.get(right.id));
  }

  function ensurePresentation(presentation, firstSlideTitle = 'Slide 1') {
    const target = assertPresentation(presentation);
    target.slideSize = SLIDE_SIZES.includes(target.slideSize) ? target.slideSize : DEFAULT_SLIDE_SIZE;
    target.themeId = SLIDE_THEMES.includes(target.themeId) ? target.themeId : DEFAULT_SLIDE_THEME;
    const usedIds = new Set();
    if (!Array.isArray(target.slides) || target.slides.length === 0) {
      target.slides = [normalizeSlide({
        title: String(firstSlideTitle),
        body: '',
        bodySecondary: '',
        notes: '',
        layout: DEFAULT_LAYOUT
      }, usedIds)];
    } else {
      target.slides = target.slides.map(slide => normalizeSlide(slide, usedIds));
    }
    normalizeSections(target);
    const requested = Number.isInteger(target.current) ? target.current : 0;
    target.current = Math.max(0, Math.min(requested, target.slides.length - 1));
    return target;
  }

  function assertSlideIndex(presentation, index) {
    if (!Number.isInteger(index) || index < 0 || index >= presentation.slides.length) {
      throw new RangeError('Slide index is outside the presentation.');
    }
  }

  function copySlide(slide) {
    return JSON.parse(JSON.stringify(slide));
  }

  function addSlide(presentation, slide = {}) {
    const target = ensurePresentation(presentation);
    const source = slide && typeof slide === 'object' && !Array.isArray(slide) ? slide : {};
    const inheritedSectionId = source.sectionId ?? target.slides[target.slides.length - 1]?.sectionId;
    const usedIds = new Set(target.slides.map(item => item.id));
    const next = normalizeSlide({
      ...source,
      ...(inheritedSectionId ? { sectionId: inheritedSectionId } : {}),
      title: source.title ?? `Slide ${target.slides.length + 1}`
    }, usedIds);
    target.slides.push(next);
    target.current = target.slides.length - 1;
    return next;
  }

  function duplicateSlide(presentation, index) {
    const target = ensurePresentation(presentation);
    const selected = index === undefined ? target.current : index;
    assertSlideIndex(target, selected);
    const copy = copySlide(target.slides[selected]);
    copy.id = createSlideId(new Set(target.slides.map(item => item.id)));
    target.slides.splice(selected + 1, 0, copy);
    target.current = selected + 1;
    return copy;
  }

  function deleteSlide(presentation, index) {
    const target = ensurePresentation(presentation);
    const selected = index === undefined ? target.current : index;
    assertSlideIndex(target, selected);
    if (target.slides.length === 1) return false;
    target.slides.splice(selected, 1);
    target.current = Math.max(0, Math.min(selected - 1, target.slides.length - 1));
    normalizeSections(target);
    return true;
  }

  function updateSlide(presentation, index, patch = {}) {
    const target = ensurePresentation(presentation);
    assertSlideIndex(target, index);
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      throw new TypeError('Slide changes must be an object.');
    }
    const slide = target.slides[index];
    if (Object.prototype.hasOwnProperty.call(patch, 'title')) slide.title = String(patch.title ?? '');
    if (Object.prototype.hasOwnProperty.call(patch, 'body')) slide.body = String(patch.body ?? '');
    if (Object.prototype.hasOwnProperty.call(patch, 'bodySecondary')) slide.bodySecondary = String(patch.bodySecondary ?? '');
    if (Object.prototype.hasOwnProperty.call(patch, 'notes')) slide.notes = String(patch.notes ?? '');
    return slide;
  }

  function getSlideLayoutDefinition(layout) {
    if (!SLIDE_LAYOUTS.includes(layout)) {
      throw new RangeError('The selected slide layout is not supported.');
    }
    return { ...SLIDE_LAYOUT_DEFINITIONS[layout] };
  }

  function resetSlideLayout(presentation, index) {
    const target = ensurePresentation(presentation);
    assertSlideIndex(target, index);
    const layout = target.slides[index].layout;
    getSlideLayoutDefinition(layout);
    return setSlideLayout(target, index, layout);
  }

  function setSlideLayout(presentation, index, layout) {
    const target = ensurePresentation(presentation);
    assertSlideIndex(target, index);
    if (!SLIDE_LAYOUTS.includes(layout)) {
      throw new RangeError('The selected slide layout is not supported.');
    }
    target.slides[index].layout = layout;
    target.slides[index].layoutId = SLIDE_LAYOUT_IDS[layout];
    return target.slides[index];
  }

  function moveSlide(presentation, fromIndex, toIndex) {
    const target = ensurePresentation(presentation);
    assertSlideIndex(target, fromIndex);
    assertSlideIndex(target, toIndex);
    const selectedSlide = target.slides[target.current];
    if (fromIndex === toIndex) return target.slides[fromIndex];

    const [moved] = target.slides.splice(fromIndex, 1);
    target.slides.splice(toIndex, 0, moved);
    target.current = target.slides.indexOf(selectedSlide);
    normalizeSections(target);
    return moved;
  }

  function setSlideHidden(presentation, index, hidden) {
    const target = ensurePresentation(presentation);
    assertSlideIndex(target, index);
    if (typeof hidden !== 'boolean') throw new TypeError('Hidden slide state must be a boolean.');
    if (hidden && target.slides[index].hidden !== true) {
      const visibleCount = target.slides.filter(slide => slide.hidden !== true).length;
      if (visibleCount <= 1) throw new RangeError('A presentation must keep at least one visible slide.');
    }
    if (hidden) target.slides[index].hidden = true;
    else delete target.slides[index].hidden;
    return target.slides[index].hidden === true;
  }

  function getVisibleSlideIndices(presentation) {
    const target = ensurePresentation(presentation);
    return target.slides.reduce((visible, slide, index) => {
      if (slide.hidden !== true) visible.push(index);
      return visible;
    }, []);
  }

  function getVisibleSlidePosition(presentation, slideNumber) {
    const target = ensurePresentation(presentation);
    if (!Number.isInteger(slideNumber) || slideNumber < 1 || slideNumber > target.slides.length) return -1;
    const slideIndex = slideNumber - 1;
    if (target.slides[slideIndex].hidden === true) return -1;
    return getVisibleSlideIndices(target).indexOf(slideIndex);
  }

  function getPresenterSnapshot(presentation, visiblePosition) {
    const target = ensurePresentation(presentation);
    const visibleIndices = getVisibleSlideIndices(target);
    if (!Number.isInteger(visiblePosition) || visiblePosition < 0 || visiblePosition >= visibleIndices.length) {
      throw new RangeError('Presenter position is outside the visible slides.');
    }

    const currentIndex = visibleIndices[visiblePosition];
    const nextIndex = visibleIndices[visiblePosition + 1] ?? null;
    return {
      visiblePosition,
      visibleCount: visibleIndices.length,
      currentIndex,
      nextIndex,
      currentSlide: copySlide(target.slides[currentIndex]),
      nextSlide: nextIndex === null ? null : copySlide(target.slides[nextIndex])
    };
  }

  function setSlideSize(presentation, slideSize) {
    const target = ensurePresentation(presentation);
    if (!SLIDE_SIZES.includes(slideSize)) {
      throw new RangeError('The selected presentation slide size is not supported.');
    }
    target.slideSize = slideSize;
    return target.slideSize;
  }

  function setSlideTheme(presentation, themeId) {
    const target = ensurePresentation(presentation);
    if (!SLIDE_THEMES.includes(themeId)) {
      throw new RangeError('The selected presentation theme is not supported.');
    }
    target.themeId = themeId;
    return target.themeId;
  }

  function setSlideBackgroundColor(presentation, index, backgroundColor) {
    const target = ensurePresentation(presentation);
    assertSlideIndex(target, index);
    if (backgroundColor === null || backgroundColor === undefined) {
      delete target.slides[index].backgroundColor;
      return null;
    }
    if (!isValidSlideBackgroundColor(backgroundColor)) {
      throw new RangeError('The selected slide background colour is not supported.');
    }
    target.slides[index].backgroundColor = backgroundColor.toUpperCase();
    return target.slides[index].backgroundColor;
  }

  function getSlideBackgroundColor(presentation, index) {
    const target = ensurePresentation(presentation);
    assertSlideIndex(target, index);
    return target.slides[index].backgroundColor || SLIDE_THEME_BACKGROUND_COLORS[target.themeId];
  }

  function createSection(presentation, name, startIndex) {
    const target = ensurePresentation(presentation);
    const start = startIndex === undefined ? target.current : startIndex;
    assertSlideIndex(target, start);
    const sectionName = normalizeSectionName(name);
    const previousSectionId = target.slides[start].sectionId || null;
    let end = start + 1;
    while (end < target.slides.length && (target.slides[end].sectionId || null) === previousSectionId) end++;

    const section = { id: createSectionId(target.sections), name: sectionName };
    target.sections.push(section);
    for (let index = start; index < end; index++) target.slides[index].sectionId = section.id;
    normalizeSections(target);
    return section;
  }

  function renameSection(presentation, sectionId, name) {
    const target = ensurePresentation(presentation);
    const section = target.sections.find(item => item.id === sectionId);
    if (!section) throw new RangeError('The selected section does not exist.');
    section.name = normalizeSectionName(name);
    return section;
  }

  function moveSlideToSection(presentation, index, sectionId = null) {
    const target = ensurePresentation(presentation);
    assertSlideIndex(target, index);
    if (sectionId !== null && !target.sections.some(section => section.id === sectionId)) {
      throw new RangeError('The selected section does not exist.');
    }
    if (sectionId) target.slides[index].sectionId = sectionId;
    else delete target.slides[index].sectionId;
    normalizeSections(target);
    return target.slides[index];
  }

  function deleteSection(presentation, sectionId, moveToSectionId = null) {
    const target = ensurePresentation(presentation);
    if (!target.sections.some(section => section.id === sectionId)) return false;
    if (moveToSectionId !== null && (
      moveToSectionId === sectionId || !target.sections.some(section => section.id === moveToSectionId)
    )) {
      throw new RangeError('The destination section does not exist.');
    }
    target.slides.forEach(slide => {
      if (slide.sectionId !== sectionId) return;
      if (moveToSectionId) slide.sectionId = moveToSectionId;
      else delete slide.sectionId;
    });
    target.sections = target.sections.filter(section => section.id !== sectionId);
    normalizeSections(target);
    return true;
  }

  function setCurrentSlide(presentation, index) {
    const target = ensurePresentation(presentation);
    assertSlideIndex(target, index);
    target.current = index;
    return target.current;
  }

  function cloneSnapshot(presentation) {
    return {
      slides: copySlide(presentation.slides),
      sections: presentation.sections.map(section => ({ ...section })),
      current: presentation.current,
      slideSize: presentation.slideSize,
      themeId: presentation.themeId
    };
  }

  function snapshotEquals(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  function restoreSnapshot(presentation, snapshot) {
    presentation.slides = copySlide(snapshot.slides);
    presentation.sections = snapshot.sections.map(section => ({ ...section }));
    presentation.current = snapshot.current;
    presentation.slideSize = snapshot.slideSize;
    presentation.themeId = SLIDE_THEMES.includes(snapshot.themeId) ? snapshot.themeId : DEFAULT_SLIDE_THEME;
    return presentation;
  }

  function createHistory(presentation, options = {}) {
    const target = ensurePresentation(presentation);
    const savedLimit = Number.isInteger(options.state?.limit) ? options.state.limit : 100;
    const requestedLimit = Number.isInteger(options.limit) ? options.limit : savedLimit;
    const limit = Math.max(1, Math.min(requestedLimit, 500));
    const groupWindow = 750;
    let current = cloneSnapshot(target);
    const past = [];
    const future = [];
    let lastGroup = null;
    let lastAt = 0;
    let restored = false;

    function normalizeSnapshot(snapshot) {
      if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.slides) || snapshot.slides.length === 0) {
        return null;
      }
      const normalized = ensurePresentation({
        slides: copySlide(snapshot.slides),
        sections: Array.isArray(snapshot.sections) ? snapshot.sections.map(section => ({ ...section })) : [],
        current: snapshot.current,
        slideSize: snapshot.slideSize,
        themeId: snapshot.themeId
      });
      return cloneSnapshot(normalized);
    }

    function restoreSavedState(saved) {
      if (!saved || typeof saved !== 'object' || saved.version !== 1) return;
      const savedCurrent = normalizeSnapshot(saved.current);
      if (!savedCurrent || !snapshotEquals(
        { slides: savedCurrent.slides, sections: savedCurrent.sections, slideSize: savedCurrent.slideSize, themeId: savedCurrent.themeId },
        { slides: current.slides, sections: current.sections, slideSize: current.slideSize, themeId: current.themeId }
      )) return;

      const savedPast = Array.isArray(saved.past) ? saved.past.map(normalizeSnapshot) : null;
      const savedFuture = Array.isArray(saved.future) ? saved.future.map(normalizeSnapshot) : null;
      if (!savedPast || !savedFuture || savedPast.some(item => !item) || savedFuture.some(item => !item)) return;

      current.current = target.current;
      past.push(...savedPast.slice(-limit));
      future.push(...savedFuture.slice(-limit));
      restored = true;
    }

    restoreSavedState(options.state);

    function trimPast() {
      while (past.length > limit) past.shift();
    }

    function commit(nextPresentation, group = null, now = Date.now()) {
      const nextTarget = ensurePresentation(nextPresentation);
      const next = cloneSnapshot(nextTarget);
      if (snapshotEquals(next, current)) {
        lastGroup = null;
        lastAt = 0;
        return false;
      }

      const grouped = typeof group === 'string'
        && group.length > 0
        && group === lastGroup
        && Number.isFinite(now)
        && now >= lastAt
        && now - lastAt <= groupWindow;

      if (!grouped) {
        past.push(current);
        trimPast();
      }

      current = next;
      future.length = 0;
      lastGroup = typeof group === 'string' && group.length > 0 ? group : null;
      lastAt = Number.isFinite(now) ? now : Date.now();
      return true;
    }

    function undo(nextPresentation) {
      const nextTarget = ensurePresentation(nextPresentation);
      if (past.length === 0) return false;
      future.push(current);
      current = past.pop();
      lastGroup = null;
      lastAt = 0;
      restoreSnapshot(nextTarget, current);
      return true;
    }

    function redo(nextPresentation) {
      const nextTarget = ensurePresentation(nextPresentation);
      if (future.length === 0) return false;
      past.push(current);
      trimPast();
      current = future.pop();
      lastGroup = null;
      lastAt = 0;
      restoreSnapshot(nextTarget, current);
      return true;
    }

    function sync(nextPresentation) {
      const nextTarget = ensurePresentation(nextPresentation);
      current.current = nextTarget.current;
      current.themeId = nextTarget.themeId;
      lastGroup = null;
      lastAt = 0;
    }

    function reset(nextPresentation) {
      const nextTarget = ensurePresentation(nextPresentation);
      current = cloneSnapshot(nextTarget);
      past.length = 0;
      future.length = 0;
      lastGroup = null;
      lastAt = 0;
    }

    function exportState() {
      return {
        version: 1,
        limit,
        current: cloneSnapshot(current),
        past: past.map(snapshot => ({
          slides: copySlide(snapshot.slides),
          sections: snapshot.sections.map(section => ({ ...section })),
          current: snapshot.current,
          slideSize: snapshot.slideSize,
          themeId: snapshot.themeId
        })),
        future: future.map(snapshot => ({
          slides: copySlide(snapshot.slides),
          sections: snapshot.sections.map(section => ({ ...section })),
          current: snapshot.current,
          slideSize: snapshot.slideSize,
          themeId: snapshot.themeId
        }))
      };
    }

    return {
      restored,
      canUndo: () => past.length > 0,
      canRedo: () => future.length > 0,
      commit,
      undo,
      redo,
      sync,
      reset,
      exportState
    };
  }

  return {
    SLIDE_LAYOUTS,
    DEFAULT_LAYOUT,
    SLIDE_LAYOUT_IDS,
    SLIDE_SIZES,
    DEFAULT_SLIDE_SIZE,
    SLIDE_THEMES,
    DEFAULT_SLIDE_THEME,
    SLIDE_THEME_BACKGROUND_COLORS,
    ensurePresentation,
    addSlide,
    duplicateSlide,
    deleteSlide,
    updateSlide,
    setSlideLayout,
    getSlideLayoutDefinition,
    resetSlideLayout,
    moveSlide,
    setCurrentSlide,
    setSlideSize,
    setSlideTheme,
    setSlideBackgroundColor,
    getSlideBackgroundColor,
    getReadableTextColor,
    setSlideHidden,
    getVisibleSlideIndices,
    getVisibleSlidePosition,
    getPresenterSnapshot,
    createSection,
    renameSection,
    moveSlideToSection,
    deleteSection,
    createHistory
  };
});
