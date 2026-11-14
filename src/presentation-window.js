'use strict';

(function () {
  const root = document.getElementById('presentation-root');
  const title = document.getElementById('audience-title');
  const slideSurface = root.querySelector('.audience-slide');
  const body = document.getElementById('audience-body');
  const columns = document.getElementById('audience-columns');
  const secondaryBody = document.getElementById('audience-body-secondary');
  title.className = 'audience-title';
  const supportedLayouts = new Set(['title', 'title-content', 'two-content', 'section-header']);
  const supportedThemes = new Set(['lavender', 'midnight', 'paper']);
  const backgroundPattern = /^#[0-9A-F]{6}$/i;

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


  function render(payload) {
    if (!payload || typeof payload !== 'object' || !payload.slide || typeof payload.slide !== 'object') return;
    const slide = payload.slide;
    const layout = supportedLayouts.has(slide.layout) ? slide.layout : 'title-content';
    const theme = supportedThemes.has(payload.themeId) ? payload.themeId : 'lavender';
    const backgroundColor = typeof slide.backgroundColor === 'string' && backgroundPattern.test(slide.backgroundColor) ? slide.backgroundColor.toUpperCase() : '';
    const textColor = backgroundColor ? getReadableTextColor(backgroundColor) : '';
    const size = payload.slideSize === 'standard' ? 'standard' : 'widescreen';
    const blankMode = payload.blankMode === 'black' || payload.blankMode === 'white' ? payload.blankMode : '';

    root.className = `audience-presentation theme-${theme} size-${size} layout-${layout}${blankMode ? ` is-blank-${blankMode}` : ''}`;
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
  }

  if (window.brightdeskPresentation && typeof window.brightdeskPresentation.onPresentationUpdate === 'function') {
    window.brightdeskPresentation.onPresentationUpdate(render);
  }
})();
