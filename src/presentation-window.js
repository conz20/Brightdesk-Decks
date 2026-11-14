'use strict';

(function () {
  const root = document.getElementById('presentation-root');
  const title = document.getElementById('audience-title');
  const slideSurface = root.querySelector('.audience-slide');
  const body = document.getElementById('audience-body');
  const columns = document.getElementById('audience-columns');
  const secondaryBody = document.getElementById('audience-body-secondary');
  const objectLayer = root.querySelector('.audience-object-layer');
  title.className = 'audience-title';
  const supportedLayouts = new Set(['title', 'title-content', 'two-content', 'section-header']);
  const supportedThemes = new Set(['lavender', 'midnight', 'paper']);
  const backgroundPattern = /^#[0-9A-F]{6}$/i;
  const supportedTransitions = new Set(['none', 'fade', 'push', 'wipe']);
  const supportedObjects = new Set(['text', 'rectangle', 'ellipse', 'line', 'image']);
  const imageDataPattern = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
  let lastRenderedSlideId = null;
  let activeTransitionClass = '';

  function getReadableTextColor(backgroundColor) {
    if (typeof backgroundColor !== 'string' || !backgroundPattern.test(backgroundColor)) return '';
    const hex = backgroundColor.slice(1);
    const channels = [0, 2, 4].map(offset => {
      const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    return luminance < 0.179 ? '#FFFFFF' : '#000000';
  }


  function renderObjects(objects) {
    if (!objectLayer) return;
    objectLayer.replaceChildren();
    if (!Array.isArray(objects)) return;
    for (const object of objects.slice(0, 500)) {
      if (!object || !supportedObjects.has(object.type)) continue;
      const element = document.createElement('div');
      element.className = `audience-object audience-object-${object.type}`;
      element.style.left = `${object.x}%`;
      element.style.top = `${object.y}%`;
      element.style.width = `${object.width}%`;
      element.style.height = object.type === 'line' ? '0' : `${object.height}%`;
      element.style.transform = object.rotation ? `rotate(${object.rotation}deg)` : '';
      element.style.backgroundColor = object.type === 'line' ? 'transparent' : (object.fill || 'transparent');
      element.style.color = object.textColor || '#26364D';
      element.style.border = object.type === 'line' || !object.stroke
        ? '0'
        : `${Math.max(0, Math.min(12, Number(object.strokeWidth) || 0))}px solid ${object.stroke}`;
      if (object.type === 'ellipse') element.style.borderRadius = '50%';
      if (object.type === 'line') {
        element.style.borderTop = `${Math.max(1, Math.min(12, Number(object.strokeWidth) || 1))}px solid ${object.stroke || '#26364D'}`;
      }
      if (object.type === 'text') {
        element.style.fontSize = `${Math.max(8, Math.min(96, Number(object.fontSize) || 20))}px`;
        element.style.fontWeight = object.bold === true ? '700' : '400';
        element.textContent = typeof object.text === 'string' ? object.text : '';
      } else if (object.type === 'image') {
        if (
          typeof object.imageData !== 'string' ||
          object.imageData.length > 7 * 1024 * 1024 ||
          !imageDataPattern.test(object.imageData) ||
          typeof object.imageName !== 'string'
        ) continue;
        const image = document.createElement('img');
        image.className = 'audience-object-image-content';
        image.src = object.imageData;
        image.alt = object.imageName || 'Slide picture';
        image.draggable = false;
        image.decoding = 'async';
        element.append(image);
      } else {
        element.textContent = typeof object.text === 'string' ? object.text : '';
      }
      objectLayer.append(element);
    }
  }

  function render(payload) {
    if (!payload || typeof payload !== 'object' || !payload.slide || typeof payload.slide !== 'object') return;
    const slide = payload.slide;
    const layout = supportedLayouts.has(slide.layout) ? slide.layout : 'title-content';
    const theme = supportedThemes.has(payload.themeId) ? payload.themeId : 'lavender';
    const slideId = typeof slide.id === 'string' ? slide.id : '';
    const slideChanged = Boolean(slideId) && slideId !== lastRenderedSlideId;
    if (slideChanged) {
      const transition = supportedTransitions.has(slide.transition) ? slide.transition : 'none';
      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
      activeTransitionClass = transition !== 'none' && !reducedMotion
        ? `audience-transition-${transition}`
        : '';
      lastRenderedSlideId = slideId;
    }
    const backgroundColor = typeof slide.backgroundColor === 'string' && backgroundPattern.test(slide.backgroundColor) ? slide.backgroundColor.toUpperCase() : '';
    const textColor = backgroundColor ? getReadableTextColor(backgroundColor) : '';
    const size = payload.slideSize === 'standard' ? 'standard' : 'widescreen';
    const blankMode = payload.blankMode === 'black' || payload.blankMode === 'white' ? payload.blankMode : '';

    const rootBaseClass = `audience-presentation theme-${theme} size-${size} layout-${layout}${blankMode ? ` is-blank-${blankMode}` : ''}`;
    root.className = rootBaseClass + (activeTransitionClass ? ` ${activeTransitionClass}` : '');
    if (slideChanged && activeTransitionClass) {
      root.className = rootBaseClass;
      void (slideSurface?.offsetWidth);
      root.className = rootBaseClass + ` ${activeTransitionClass}`;
    }
    root.style.backgroundColor = '';
    if (slideSurface) slideSurface.style.backgroundColor = backgroundColor;
    title.style.color = textColor;
    body.style.color = textColor;
    body.style.backgroundColor = backgroundColor;
    secondaryBody.style.color = textColor;
    secondaryBody.style.backgroundColor = backgroundColor;
    title.textContent = typeof slide.title === 'string' ? slide.title : '';
    body.textContent = typeof slide.body === 'string' ? slide.body : '';
    secondaryBody.textContent = typeof slide.bodySecondary === 'string' ? slide.bodySecondary : '';
    columns.hidden = false;
    secondaryBody.hidden = layout !== 'two-content';
    renderObjects(slide.objects);
  }

  if (window.brightdeskPresentation && typeof window.brightdeskPresentation.onPresentationUpdate === 'function') {
    window.brightdeskPresentation.onPresentationUpdate(render);
  }
})();
