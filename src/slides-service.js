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

  function ensurePresentation(presentation, firstSlideTitle = 'Slide 1') {
    const target = assertPresentation(presentation);
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
    const next = normalizeSlide({
      ...source,
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
    return moved;
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
      current: presentation.current
    };
  }

  function snapshotEquals(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  function restoreSnapshot(presentation, snapshot) {
    presentation.slides = copySlide(snapshot.slides);
    presentation.current = snapshot.current;
    return presentation;
  }

  function createHistory(presentation, options = {}) {
    const target = ensurePresentation(presentation);
    const requestedLimit = Number.isInteger(options.limit) ? options.limit : 100;
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
        current: snapshot.current
      });
      return cloneSnapshot(normalized);
    }

    function restoreSavedState(saved) {
      if (!saved || typeof saved !== 'object' || saved.version !== 1) return;
      const savedCurrent = normalizeSnapshot(saved.current);
      if (!savedCurrent || !snapshotEquals(savedCurrent.slides, current.slides)) return;

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
          current: snapshot.current
        })),
        future: future.map(snapshot => ({
          slides: copySlide(snapshot.slides),
          current: snapshot.current
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
    ensurePresentation,
    addSlide,
    duplicateSlide,
    deleteSlide,
    updateSlide,
    setSlideLayout,
    moveSlide,
    setCurrentSlide,
    createHistory
  };
});
