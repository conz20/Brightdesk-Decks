'use strict';

(function () {
  const root = document.getElementById('presentation-root');
  const title = document.getElementById('audience-title');
  const body = document.getElementById('audience-body');
  const columns = document.getElementById('audience-columns');
  const secondaryBody = document.getElementById('audience-body-secondary');
  title.className = 'audience-title';
  const supportedLayouts = new Set(['title', 'title-content', 'two-content', 'section-header']);
  const supportedThemes = new Set(['lavender', 'midnight', 'paper']);

  function render(payload) {
    if (!payload || typeof payload !== 'object' || !payload.slide || typeof payload.slide !== 'object') return;
    const slide = payload.slide;
    const layout = supportedLayouts.has(slide.layout) ? slide.layout : 'title-content';
    const theme = supportedThemes.has(payload.themeId) ? payload.themeId : 'lavender';
    const size = payload.slideSize === 'standard' ? 'standard' : 'widescreen';
    const blankMode = payload.blankMode === 'black' || payload.blankMode === 'white' ? payload.blankMode : '';

    root.className = `audience-presentation theme-${theme} size-${size} layout-${layout}${blankMode ? ` is-blank-${blankMode}` : ''}`;
    title.textContent = typeof slide.title === 'string' ? slide.title : '';
    body.textContent = typeof slide.body === 'string' ? slide.body : '';
    secondaryBody.textContent = typeof slide.bodySecondary === 'string' ? slide.bodySecondary : '';
    columns.hidden = false;
    secondaryBody.hidden = layout !== 'two-content';
  }

  if (window.brightdeskPresentation && typeof window.brightdeskPresentation.onPresentationUpdate === 'function') {
    window.brightdeskPresentation.onPresentationUpdate(render);
  }
})();
