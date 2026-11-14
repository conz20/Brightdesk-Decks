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
  const SLIDE_SIZES = Object.freeze(['widescreen', 'standard']);
  const DEFAULT_SLIDE_SIZE = 'widescreen';
  const MAX_SECTION_NAME_LENGTH = 80;
  let sectionSequence = 0;

  function assertPresentation(presentation) {
    if (!presentation || typeof presentation !== 'object' || Array.isArray(presentation)) {
      throw new TypeError('A presentation object is required.');
    }
    return presentation;
  }

  function normalizeSlide(slide) {
    const source = slide && typeof slide === 'object' && !Array.isArray(slide) ? slide : {};
    const layout = SLIDE_LAYOUTS.includes(source.layout) ? source.layout : DEFAULT_LAYOUT;
    return {
      ...source,
      title: String(source.title ?? ''),
      body: String(source.body ?? ''),
      bodySecondary: String(source.bodySecondary ?? ''),
      notes: String(source.notes ?? ''),
      layout
    };
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
    if (!Array.isArray(target.slides) || target.slides.length === 0) {
      target.slides = [{
        title: String(firstSlideTitle),
        body: '',
        bodySecondary: '',
        notes: '',
        layout: DEFAULT_LAYOUT
      }];
    } else {
      target.slides = target.slides.map(normalizeSlide);
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
    const next = normalizeSlide({
      ...source,
      ...(inheritedSectionId ? { sectionId: inheritedSectionId } : {}),
      title: source.title ?? `Slide ${target.slides.length + 1}`
    });
    target.slides.push(next);
    target.current = target.slides.length - 1;
    return next;
  }

  function duplicateSlide(presentation, index) {
    const target = ensurePresentation(presentation);
    const selected = index === undefined ? target.current : index;
    assertSlideIndex(target, selected);
    const copy = copySlide(target.slides[selected]);
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

  function setSlideLayout(presentation, index, layout) {
    const target = ensurePresentation(presentation);
    assertSlideIndex(target, index);
    if (!SLIDE_LAYOUTS.includes(layout)) {
      throw new RangeError('The selected slide layout is not supported.');
    }
    target.slides[index].layout = layout;
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

  function setSlideSize(presentation, slideSize) {
    const target = ensurePresentation(presentation);
    if (!SLIDE_SIZES.includes(slideSize)) {
      throw new RangeError('The selected presentation slide size is not supported.');
    }
    target.slideSize = slideSize;
    return target.slideSize;
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
      slideSize: presentation.slideSize
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
        slideSize: snapshot.slideSize
      });
      return cloneSnapshot(normalized);
    }

    function restoreSavedState(saved) {
      if (!saved || typeof saved !== 'object' || saved.version !== 1) return;
      const savedCurrent = normalizeSnapshot(saved.current);
      if (!savedCurrent || !snapshotEquals(
        { slides: savedCurrent.slides, sections: savedCurrent.sections, slideSize: savedCurrent.slideSize },
        { slides: current.slides, sections: current.sections, slideSize: current.slideSize }
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
          slideSize: snapshot.slideSize
        })),
        future: future.map(snapshot => ({
          slides: copySlide(snapshot.slides),
          sections: snapshot.sections.map(section => ({ ...section })),
          current: snapshot.current,
          slideSize: snapshot.slideSize
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
    SLIDE_SIZES,
    DEFAULT_SLIDE_SIZE,
    ensurePresentation,
    addSlide,
    duplicateSlide,
    deleteSlide,
    updateSlide,
    setSlideLayout,
    moveSlide,
    setCurrentSlide,
    setSlideSize,
    createSection,
    renameSection,
    moveSlideToSection,
    deleteSection,
    createHistory
  };
});
