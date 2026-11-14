const fs = require('node:fs/promises');
const path = require('node:path');
const { TextDecoder } = require('node:util');
const appCatalog = require('./app-catalog');

const MAX_PROJECT_BYTES = 50 * 1024 * 1024;
const MAX_DOCUMENT_TEXT_BYTES = 10 * 1024 * 1024;
const MAX_SHEET_CELLS = 250_000;
const MAX_SLIDES = 2_000;
const KNOWN_APP_IDS = new Set(appCatalog.map(app => app.id));
const EXCLUDED_APP_IDS = new Set(['teams', 'outlook', 'onedrive']);
const SUPPORTED_SLIDE_LAYOUTS = new Set(['title', 'title-content', 'two-content', 'section-header']);
const SUPPORTED_SLIDE_LAYOUT_IDS = new Set(['layout-title', 'layout-title-content', 'layout-two-content', 'layout-section-header']);
const SLIDE_LAYOUT_ID_BY_NAME = Object.freeze({
  title: 'layout-title',
  'title-content': 'layout-title-content',
  'two-content': 'layout-two-content',
  'section-header': 'layout-section-header'
});
const SUPPORTED_SLIDE_SIZES = new Set(['widescreen', 'standard']);
const SUPPORTED_SLIDE_THEMES = new Set(['lavender', 'midnight', 'paper']);
const SLIDE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;
const SLIDE_BACKGROUND_COLOR_PATTERN = /^#[0-9A-F]{6}$/i;
const SUPPORTED_SLIDE_OBJECT_TYPES = new Set(['text', 'rectangle', 'ellipse', 'line']);
const SLIDE_OBJECT_ID_PATTERN = /^object-[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;
const MAX_SLIDE_OBJECTS_PER_SLIDE = 1_000;
const MAX_SLIDE_OBJECT_TEXT_LENGTH = 10_000;
const MAX_SLIDE_OBJECT_FONT_SIZE = 96;
const MAX_SLIDE_OBJECT_STROKE_WIDTH = 12;

/*
 * Load format-specific libraries only when the corresponding format is used.
 * This keeps lightweight project/CSV operations and unit tests usable before
 * the full desktop dependency set has been installed. Every package remains
 * declared in package.json for normal application installs and release builds.
 */

function decodeUtf8(buffer, errorMessage) {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer);
  } catch {
    throw new Error(errorMessage);
  }
}

function assertDocumentTextLimit(byteLength) {
  if (byteLength > MAX_DOCUMENT_TEXT_BYTES) {
    throw new Error('The imported document exceeds the 10 MB text limit.');
  }
}

function assertSheetDimensions(rowCount, columnCount) {
  if (!Number.isSafeInteger(rowCount) || !Number.isSafeInteger(columnCount) || rowCount < 0 || columnCount < 0) {
    throw new Error('The imported spreadsheet has invalid worksheet dimensions.');
  }
  const boundedRows = Math.max(1, rowCount);
  const boundedColumns = Math.max(1, columnCount);
  if (boundedRows > Math.floor(MAX_SHEET_CELLS / boundedColumns)) {
    throw new Error('The imported spreadsheet exceeds the 250,000-cell limit.');
  }
}

function assertSheetCellLimit(rows) {
  let cellCount = 0;
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    cellCount += row.length;
    if (cellCount > MAX_SHEET_CELLS) {
      throw new Error('The imported spreadsheet exceeds the 250,000-cell limit.');
    }
  }
}

function assertPresentationSlideLimit(slideCount) {
  if (slideCount > MAX_SLIDES) {
    throw new Error('The imported presentation exceeds the 2,000-slide limit.');
  }
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validateProject(project) {
  if (!isPlainObject(project)) throw new Error('This Brightdesk project is not a valid project object.');
  if (project.docs !== undefined && !isPlainObject(project.docs)) throw new Error('This Brightdesk project has an invalid document collection.');
  const docs = project.docs || {};
  for (const [appId, doc] of Object.entries(docs)) {
    if (EXCLUDED_APP_IDS.has(appId) || !KNOWN_APP_IDS.has(appId)) throw new Error(`This project contains an unsupported app module: ${appId}.`);
    if (!isPlainObject(doc)) throw new Error(`The ${appId} document is not valid.`);
    if (doc.title !== undefined && (typeof doc.title !== 'string' || Buffer.byteLength(doc.title, 'utf8') > 1000)) {
      throw new Error(`The ${appId} document has an invalid title.`);
    }
    if (appId === 'pages' && doc.html !== undefined && (typeof doc.html !== 'string' || Buffer.byteLength(doc.html, 'utf8') > MAX_DOCUMENT_TEXT_BYTES)) {
      throw new Error('The Brightdesk Pages document content is invalid or exceeds the 10 MB limit.');
    }
    if (appId === 'notes' && doc.text !== undefined && (typeof doc.text !== 'string' || Buffer.byteLength(doc.text, 'utf8') > MAX_DOCUMENT_TEXT_BYTES)) {
      throw new Error('The Brightdesk Notes content is invalid or exceeds the 10 MB limit.');
    }
    if (appId === 'sheets' && doc.cells !== undefined) {
      if (!Array.isArray(doc.cells)) throw new Error('The Brightdesk Sheets workbook has an invalid cell grid.');
      let cellCount = 0;
      for (const row of doc.cells) {
        if (!Array.isArray(row)) throw new Error('The Brightdesk Sheets workbook contains an invalid row.');
        cellCount += row.length;
        if (cellCount > MAX_SHEET_CELLS) throw new Error('The Brightdesk Sheets workbook exceeds the 250,000-cell project limit.');
        if (row.some(cell => cell !== null && !['string', 'number', 'boolean'].includes(typeof cell))) {
          throw new Error('The Brightdesk Sheets workbook contains an unsupported cell value.');
        }
      }
    }
    if (appId === 'slides') {
      if (doc.sections !== undefined && (!Array.isArray(doc.sections) || doc.sections.length > MAX_SLIDES)) {
        throw new Error('The Brightdesk Decks presentation has an invalid section collection.');
      }
      const sectionIds = new Set();
      for (const section of doc.sections || []) {
        if (
          !isPlainObject(section) ||
          typeof section.id !== 'string' ||
          !section.id.trim() ||
          section.id.length > 100 ||
          typeof section.name !== 'string' ||
          !section.name.trim() ||
          section.name.length > 80 ||
          sectionIds.has(section.id)
        ) {
          throw new Error('The Brightdesk Decks presentation contains an invalid section.');
        }
        sectionIds.add(section.id);
      }
      if (Array.isArray(doc.slides) && doc.slides.some(slide =>
        slide && slide.sectionId !== undefined && !sectionIds.has(slide.sectionId)
      )) {
        throw new Error('The Brightdesk Decks presentation refers to an unknown section.');
      }
    }
    if (appId === 'slides' && doc.slideSize !== undefined && !SUPPORTED_SLIDE_SIZES.has(doc.slideSize)) {
      throw new Error('The Brightdesk Decks presentation has an invalid slide size.');
    }
    if (appId === 'slides' && doc.themeId !== undefined && !SUPPORTED_SLIDE_THEMES.has(doc.themeId)) {
      throw new Error('The Brightdesk Decks presentation has an invalid theme.');
    }
    if (appId === 'slides' && doc.slides !== undefined) {
      if (!Array.isArray(doc.slides) || doc.slides.length > MAX_SLIDES) throw new Error('The Brightdesk Decks presentation has an invalid slide collection.');
      const slideIds = new Set();
      for (const slide of doc.slides) {
        if (
          !isPlainObject(slide) ||
          (slide.id !== undefined && (
            typeof slide.id !== 'string' ||
            !SLIDE_ID_PATTERN.test(slide.id) ||
            slideIds.has(slide.id)
          )) ||
          (slide.hidden !== undefined && typeof slide.hidden !== 'boolean') ||
          (slide.title !== undefined && typeof slide.title !== 'string') ||
          (slide.body !== undefined && (
            typeof slide.body !== 'string' ||
            Buffer.byteLength(slide.body, 'utf8') > MAX_DOCUMENT_TEXT_BYTES
          )) ||
          (slide.bodySecondary !== undefined && (
            typeof slide.bodySecondary !== 'string' ||
            Buffer.byteLength(slide.bodySecondary, 'utf8') > MAX_DOCUMENT_TEXT_BYTES
          )) ||
          (slide.notes !== undefined && (
            typeof slide.notes !== 'string' ||
            Buffer.byteLength(slide.notes, 'utf8') > MAX_DOCUMENT_TEXT_BYTES
          )) ||
          (slide.layout !== undefined && (
            typeof slide.layout !== 'string' ||
            !SUPPORTED_SLIDE_LAYOUTS.has(slide.layout)
          )) ||
          (slide.layoutId !== undefined && (
            typeof slide.layoutId !== 'string' ||
            !SUPPORTED_SLIDE_LAYOUT_IDS.has(slide.layoutId) ||
            (slide.layout !== undefined && SLIDE_LAYOUT_ID_BY_NAME[slide.layout] !== slide.layoutId)
          )) ||
          (slide.backgroundColor !== undefined && (
            typeof slide.backgroundColor !== 'string' ||
            !SLIDE_BACKGROUND_COLOR_PATTERN.test(slide.backgroundColor)
          )) ||
          (slide.objects !== undefined && (
            !Array.isArray(slide.objects) ||
            slide.objects.length > MAX_SLIDE_OBJECTS_PER_SLIDE
          ))
        ) {
          throw new Error('The Brightdesk Decks presentation contains an invalid slide.');
        }
        if (slide.objects !== undefined) {
          const objectIds = new Set();
          for (const object of slide.objects) {
            const validObject = isPlainObject(object)
              && typeof object.id === 'string'
              && SLIDE_OBJECT_ID_PATTERN.test(object.id)
              && !objectIds.has(object.id)
              && SUPPORTED_SLIDE_OBJECT_TYPES.has(object.type)
              && Number.isFinite(object.x) && object.x >= 0
              && Number.isFinite(object.y) && object.y >= 0
              && Number.isFinite(object.width) && object.width > 0
              && Number.isFinite(object.height) && object.height > 0
              && object.width <= 100 && object.height <= 100
              && object.x + object.width <= 100
              && object.y + object.height <= 100
              && (object.fill === undefined || object.fill === null || (typeof object.fill === 'string' && SLIDE_BACKGROUND_COLOR_PATTERN.test(object.fill)))
              && (object.stroke === undefined || object.stroke === null || (typeof object.stroke === 'string' && SLIDE_BACKGROUND_COLOR_PATTERN.test(object.stroke)))
              && (object.text === undefined || (typeof object.text === 'string' && object.text.length <= MAX_SLIDE_OBJECT_TEXT_LENGTH))
              && (object.strokeWidth === undefined || (Number.isFinite(object.strokeWidth) && object.strokeWidth >= 0 && object.strokeWidth <= MAX_SLIDE_OBJECT_STROKE_WIDTH))
              && (object.fontSize === undefined || (Number.isFinite(object.fontSize) && object.fontSize >= 8 && object.fontSize <= MAX_SLIDE_OBJECT_FONT_SIZE))
              && (object.textColor === undefined || (typeof object.textColor === 'string' && SLIDE_BACKGROUND_COLOR_PATTERN.test(object.textColor)))
              && (object.bold === undefined || typeof object.bold === 'boolean')
              && (object.rotation === undefined || (Number.isFinite(object.rotation) && object.rotation >= -360 && object.rotation <= 360));
            if (!validObject) throw new Error('The Brightdesk Decks presentation contains an invalid slide object.');
            objectIds.add(object.id);
          }
        }
        if (slide.id !== undefined) slideIds.add(slide.id);
      }
      if (doc.current !== undefined && (!Number.isInteger(doc.current) || doc.current < 0 || (doc.slides.length && doc.current >= doc.slides.length))) {
        throw new Error('The Brightdesk Decks presentation has an invalid selected slide.');
      }
    }
  }
  let serialized;
  try { serialized = JSON.stringify(project); } catch { throw new Error('This Brightdesk project cannot be saved as JSON.'); }
  if (Buffer.byteLength(serialized, 'utf8') > MAX_PROJECT_BYTES) throw new Error('This Brightdesk project exceeds the 50 MB size limit.');
  return project;
}

function cleanFileName(value) {
  return String(value || 'Brightdesk file').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 120) || 'Brightdesk file';
}
function parseDelimited(text, delimiter) {
  const rows = [];
  let row = [], cell = '', quoted = false, quoteClosed = false, fieldStarted = false, cellCount = 0;
  const pushCell = () => {
    cellCount++;
    if (cellCount > MAX_SHEET_CELLS) {
      throw new Error('The imported spreadsheet exceeds the 250,000-cell limit.');
    }
    row.push(cell);
    cell = '';
    quoteClosed = false;
    fieldStarted = false;
  };
  const rejectMalformedQuotes = () => {
    throw new Error('This delimited file contains invalid quotation marks.');
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const isNewline = ch === '\n' || ch === '\r';

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else { quoted = false; quoteClosed = true; }
      } else cell += ch;
      continue;
    }

    if (quoteClosed) {
      if (ch === delimiter) { pushCell(); continue; }
      if (isNewline) {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        pushCell();
        rows.push(row);
        row = [];
        continue;
      }
      rejectMalformedQuotes();
    }

    if (ch === '"') {
      if (fieldStarted) rejectMalformedQuotes();
      quoted = true;
      fieldStarted = true;
    } else if (ch === delimiter) {
      pushCell();
    } else if (isNewline) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      pushCell();
      rows.push(row);
      row = [];
    } else {
      cell += ch;
      fieldStarted = true;
    }
  }

  if (quoted) rejectMalformedQuotes();
  if (fieldStarted || row.length) {
    pushCell();
    rows.push(row);
  }
  return rows;
}
function parseCsv(text) { return parseDelimited(text, ','); }
function parseTsv(text) { return parseDelimited(text, '\t'); }
function ensureExtension(filePath, defaultExtension) {
  const extension = String(defaultExtension || '').replace(/^\./, '');
  if (!extension) return filePath;
  const currentExtension = path.extname(filePath);
  if (currentExtension && currentExtension !== '.') return filePath;
  const basePath = currentExtension === '.' ? filePath.slice(0, -1) : filePath;
  return `${basePath}.${extension}`;
}

function collectXmlText(value, output = []) {
  if (Array.isArray(value)) value.forEach(item => collectXmlText(item, output));
  else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (key === 't' || key.endsWith(':t')) {
        if (Array.isArray(child)) child.forEach(v => output.push(String(v)));
        else if (child !== undefined && typeof child !== 'object') output.push(String(child));
      } else collectXmlText(child, output);
    }
  }
  return output;
}
function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function resolveNotesSlideTarget(slidePart, relationship) {
  if (!relationship || relationship['@_TargetMode'] === 'External') return null;
  const type = String(relationship['@_Type'] || '');
  if (!type.endsWith('/notesSlide')) return null;

  let target = String(relationship['@_Target'] || '').trim();
  if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || /[?#]/.test(target)) return null;
  try {
    target = decodeURIComponent(target);
  } catch {
    return null;
  }

  target = target.replace(/\\/g, '/');
  const resolved = target.startsWith('/')
    ? path.posix.normalize(target.slice(1))
    : path.posix.normalize(path.posix.join(path.posix.dirname(slidePart), target));
  if (!resolved.startsWith('ppt/notesSlides/') || resolved.includes('/../')) return null;
  return resolved;
}

async function findNotesSlidePart(zip, slidePart, relationshipParser) {
  const relationshipsPart = path.posix.join(
    path.posix.dirname(slidePart),
    '_rels',
    path.posix.basename(slidePart) + '.rels'
  );
  const relationshipsFile = zip.file(relationshipsPart);
  if (!relationshipsFile) return null;

  const relationshipsXml = await relationshipsFile.async('string');
  const parsed = relationshipParser.parse(relationshipsXml);
  const relationships = asArray(parsed.Relationships?.Relationship);
  const notesRelationship = relationships.find(item =>
    String(item?.['@_Type'] || '').endsWith('/notesSlide')
  );
  return resolveNotesSlideTarget(slidePart, notesRelationship);
}


function resolvePresentationSlideTarget(relationship) {
  if (!relationship || String(relationship['@_TargetMode'] || '').toLowerCase() === 'external') return null;
  if (!String(relationship['@_Type'] || '').endsWith('/slide')) return null;

  let target = String(relationship['@_Target'] || '').trim();
  if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || /[?#]/.test(target)) return null;
  try {
    target = decodeURIComponent(target);
  } catch {
    return null;
  }

  target = target.replace(/\\/g, '/');
  if (target.split('/').some(segment => segment === '..')) return null;
  const resolved = target.startsWith('/')
    ? path.posix.normalize(target.replace(/^\/+/, ''))
    : path.posix.normalize(path.posix.join('ppt', target));
  if (!resolved.startsWith('ppt/slides/') || resolved.endsWith('/')) return null;
  return resolved;
}

async function getPptxSlidePartsInPresentationOrder(zip, relationshipParser) {
  const presentationFile = zip.file('ppt/presentation.xml');
  const relationshipsFile = zip.file('ppt/_rels/presentation.xml.rels');
  if (!presentationFile || !relationshipsFile) {
    throw new Error('The PowerPoint presentation is missing its slide-order metadata.');
  }

  const presentationXml = await presentationFile.async('string');
  const slideList = presentationXml.match(
    /<(?:[A-Za-z_][\w.-]*:)?sldIdLst\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?sldIdLst\s*>/i
  );
  if (!slideList) {
    throw new Error('The PowerPoint presentation has an invalid slide-order list.');
  }

  const slideReferences = [...slideList[1].matchAll(/<(?:[A-Za-z_][\w.-]*:)?sldId\b([^>]*)\/?\s*>/gi)];
  if (!slideReferences.length) {
    throw new Error('The PowerPoint presentation does not contain any slides.');
  }

  let parsedRelationships;
  try {
    parsedRelationships = relationshipParser.parse(await relationshipsFile.async('string'));
  } catch {
    throw new Error('The PowerPoint presentation relationships are invalid.');
  }
  const relationships = asArray(parsedRelationships.Relationships?.Relationship);
  const relationshipById = new Map();
  for (const relationship of relationships) {
    const id = String(relationship?.['@_Id'] || '');
    if (!id || relationshipById.has(id)) {
      throw new Error('The PowerPoint presentation contains invalid slide relationships.');
    }
    relationshipById.set(id, relationship);
  }

  const seenParts = new Set();
  return slideReferences.map(reference => {
    const relationshipId = reference[1].match(/(?:^|\s)[A-Za-z_][\w.-]*:id\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!relationshipId) {
      throw new Error('The PowerPoint presentation contains a slide without a valid relationship.');
    }
    const relationship = relationshipById.get(relationshipId);
    const part = resolvePresentationSlideTarget(relationship);
    if (!part || !zip.file(part) || seenParts.has(part)) {
      throw new Error('The PowerPoint presentation contains an invalid or external slide relationship.');
    }
    seenParts.add(part);
    return part;
  });
}

async function readNotesSlideText(zip, notesPart, notesParser) {
  const notesFile = zip.file(notesPart);
  if (!notesFile) return '';
  const uncompressedSize = notesFile._data?.uncompressedSize || 0;
  if (uncompressedSize > MAX_DOCUMENT_TEXT_BYTES) {
    throw new Error('A PowerPoint speaker-notes page exceeds the 10 MB text limit.');
  }

  let parsed;
  try {
    parsed = notesParser.parse(await notesFile.async('string'));
  } catch {
    throw new Error('The PowerPoint presentation contains invalid speaker-notes XML.');
  }

  const notesRoot = parsed.notes || parsed;
  const shapes = asArray(notesRoot.cSld?.spTree?.sp);
  const bodyPlaceholder = shapes.find(shape => shape?.nvSpPr?.nvPr?.ph?.['@_type'] === 'body');
  if (!bodyPlaceholder) return '';

  const paragraphs = asArray(bodyPlaceholder.txBody?.p);
  const notes = paragraphs
    .map(paragraph => collectXmlText(paragraph).join(''))
    .join('\n')
    .replace(/\r\n/g, '\n')
    .trimEnd();
  assertDocumentTextLimit(Buffer.byteLength(notes, 'utf8'));
  return notes;
}

const PPTX_CUSTOM_PROPERTIES_RELATIONSHIP = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties';
const PPTX_CUSTOM_PROPERTIES_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.custom-properties+xml';

async function writePptxThemeMetadata(filePath, themeId) {
  const JSZip = require('jszip');
  const { XMLParser } = require('fast-xml-parser');
  const archive = await JSZip.loadAsync(await fs.readFile(filePath));
  const relationshipsPath = '_rels/.rels';
  const contentTypesPath = '[Content_Types].xml';
  const relationshipsFile = archive.file(relationshipsPath);
  const contentTypesFile = archive.file(contentTypesPath);
  if (!relationshipsFile || !contentTypesFile) {
    throw new Error('The PowerPoint package is missing required metadata files.');
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true
  });
  let relationshipsXml = await relationshipsFile.async('string');
  let parsedRelationships;
  try {
    parsedRelationships = parser.parse(relationshipsXml);
  } catch {
    throw new Error('The PowerPoint package relationships are invalid.');
  }
  const relationships = asArray(parsedRelationships.Relationships?.Relationship);
  const matching = relationships.filter(item =>
    String(item?.['@_Type'] || '') === PPTX_CUSTOM_PROPERTIES_RELATIONSHIP
  );
  if (matching.some(item => item?.['@_TargetMode'] === 'External')) {
    throw new Error('The generated PowerPoint package contains an external custom-properties relationship.');
  }
  if (matching.some(item => String(item?.['@_Target'] || '').replace(/^\/+/, '') !== 'docProps/custom.xml')) {
    throw new Error('The generated PowerPoint custom-properties relationship has an unexpected target.');
  }

  const hasThemeProperties = matching.some(item =>
    String(item?.['@_Target'] || '').replace(/^\/+/, '') === 'docProps/custom.xml'
  );
  if (!hasThemeProperties) {
    const ids = relationships
      .map(item => String(item?.['@_Id'] || '').match(/^rId(\d+)$/))
      .filter(Boolean)
      .map(match => Number(match[1]));
    const nextId = Math.max(0, ...ids) + 1;
    const relationship = '<Relationship Id="rId' + nextId + '" Type="' +
      PPTX_CUSTOM_PROPERTIES_RELATIONSHIP + '" Target="docProps/custom.xml"/>';
    if (!relationshipsXml.includes('</Relationships>')) {
      throw new Error('The PowerPoint package relationships are malformed.');
    }
    relationshipsXml = relationshipsXml.replace('</Relationships>', relationship + '</Relationships>');
    archive.file(relationshipsPath, relationshipsXml);
  }

  let contentTypesXml = await contentTypesFile.async('string');
  if (!contentTypesXml.includes('PartName="/docProps/custom.xml"')) {
    const override = '<Override PartName="/docProps/custom.xml" ContentType="' +
      PPTX_CUSTOM_PROPERTIES_CONTENT_TYPE + '"/>';
    if (!contentTypesXml.includes('</Types>')) {
      throw new Error('The PowerPoint content-type manifest is malformed.');
    }
    contentTypesXml = contentTypesXml.replace('</Types>', override + '</Types>');
    archive.file(contentTypesPath, contentTypesXml);
  }

  const customProperties = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" ' +
    'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
    '<property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2" name="BrightdeskTheme">' +
    '<vt:lpwstr>' + themeId + '</vt:lpwstr></property></Properties>';
  archive.file('docProps/custom.xml', customProperties);
  const output = await archive.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
  await fs.writeFile(filePath, output);
}

async function readPptxThemeMetadata(zip) {
  const relationshipsFile = zip.file('_rels/.rels');
  if (!relationshipsFile) return 'lavender';
  const relationshipParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true
  });
  let relationships;
  try {
    relationships = relationshipParser.parse(await relationshipsFile.async('string'));
  } catch {
    return 'lavender';
  }
  const entries = asArray(relationships.Relationships?.Relationship);
  const relation = entries.find(item =>
    String(item?.['@_Type'] || '') === PPTX_CUSTOM_PROPERTIES_RELATIONSHIP &&
    item?.['@_TargetMode'] !== 'External'
  );
  if (!relation) return 'lavender';

  let target = String(relation['@_Target'] || '').trim();
  if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || /[?#]/.test(target)) return 'lavender';
  try {
    target = decodeURIComponent(target);
  } catch {
    return 'lavender';
  }
  const partName = path.posix.normalize(target.replace(/^\/+/, ''));
  if (partName !== 'docProps/custom.xml') return 'lavender';

  const customFile = zip.file(partName);
  if (!customFile || (customFile._data?.uncompressedSize || 0) > 64 * 1024) return 'lavender';
  let parsed;
  try {
    parsed = relationshipParser.parse(await customFile.async('string'));
  } catch {
    return 'lavender';
  }
  const properties = asArray(parsed.Properties?.property);
  const themeProperty = properties.find(item => item?.['@_name'] === 'BrightdeskTheme');
  const themeId = typeof themeProperty?.lpwstr === 'string' ? themeProperty.lpwstr.trim() : '';
  return SUPPORTED_SLIDE_THEMES.has(themeId) ? themeId : 'lavender';
}

function getReadablePptxTextColor(backgroundColor) {
  if (typeof backgroundColor !== 'string' || !SLIDE_BACKGROUND_COLOR_PATTERN.test(backgroundColor)) {
    return null;
  }
  const hex = backgroundColor.slice(1);
  const channels = [0, 2, 4].map(offset => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  return luminance < 0.179 ? 'FFFFFF' : '000000';
}

function readPptxSlideSolidBackground(xml) {
  const backgroundMatch = String(xml || '').match(/<(?:[A-Za-z_][\w.-]*:)?bg\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?bg\s*>/i);
  if (!backgroundMatch) return null;
  const fillMatch = backgroundMatch[1].match(/<(?:[A-Za-z_][\w.-]*:)?solidFill\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?solidFill\s*>/i);
  if (!fillMatch) return null;
  const colorMatch = fillMatch[1].match(/<(?:[A-Za-z_][\w.-]*:)?srgbClr\b[^>]*\bval=["']([0-9A-F]{6})["']/i);
  return colorMatch ? '#' + colorMatch[1].toUpperCase() : null;
}

async function openOfficeFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const stat = await fs.stat(filePath);
  if (stat.size > 50 * 1024 * 1024) throw new Error('This file is over the 50 MB import limit.');
  const buffer = await fs.readFile(filePath);
  if (ext === '.docx') {
    const mammoth = require('mammoth');
    const result = await mammoth.convertToHtml({ buffer });
    assertDocumentTextLimit(Buffer.byteLength(result.value, 'utf8'));
    return { kind: 'pages', title: path.basename(filePath, ext), html: result.value, warnings: result.messages.map(m => m.message) };
  }
  if (ext === '.xlsx' || ext === '.xlsm') {
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) return { kind: 'sheets', title: path.basename(filePath, ext), cells: [[]] };
    assertSheetDimensions(sheet.rowCount, sheet.columnCount);
    const rows = [];
    sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      rows[rowNumber - 1] = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        rows[rowNumber - 1][colNumber - 1] = cell.formula ? `=${cell.formula}` : (cell.value?.result ?? cell.value ?? '');
      });
    });
    assertSheetCellLimit(rows);
    return { kind: 'sheets', title: path.basename(filePath, ext), cells: rows };
  }
  if (ext === '.csv' || ext === '.tsv') {
    const text = decodeUtf8(buffer, 'This imported file is not valid UTF-8 text.').replace(/^\uFEFF/, '');
    const rows = ext === '.tsv' ? parseTsv(text) : parseCsv(text);
    assertSheetCellLimit(rows);
    return { kind: 'sheets', title: path.basename(filePath, ext), cells: rows };
  }
  if (ext === '.pptx') {
    const JSZip = require('jszip');
    const { XMLParser } = require('fast-xml-parser');
    const zip = await JSZip.loadAsync(buffer);
    let slideSize = 'widescreen';
    const presentationPart = zip.file('ppt/presentation.xml');
    if (presentationPart) {
      const presentationXml = await presentationPart.async('string');
      const sizeTag = presentationXml.match(/<(?:[A-Za-z0-9_]+:)?sldSz\b([^>]*)\/?\s*>/i);
      if (sizeTag) {
        const width = Number(sizeTag[1].match(/\bcx=["'](\d+)["']/i)?.[1]);
        const height = Number(sizeTag[1].match(/\bcy=["'](\d+)["']/i)?.[1]);
        if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
          const ratio = width / height;
          if (Math.abs(ratio - 4 / 3) < 0.02) slideSize = 'standard';
        }
      }
    }
    const parser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: false });
    const relationshipParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', removeNSPrefix: true });
    const notesParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', removeNSPrefix: true });
    const names = await getPptxSlidePartsInPresentationOrder(zip, relationshipParser);
    assertPresentationSlideLimit(names.length);
    const totalSlideBytes = names.reduce((total, name) => total + (zip.file(name)?._data?.uncompressedSize || 0), 0);
    if (totalSlideBytes > 50 * 1024 * 1024) throw new Error('The presentation contains too much uncompressed slide XML to import safely.');
    const slides = [];
    let totalNotesBytes = 0;
    for (const name of names) {
      const xml = await zip.files[name].async('string');
      const backgroundColor = readPptxSlideSolidBackground(xml);
      const hidden = /<(?:[A-Za-z0-9_]+:)?sld\b[^>]*\bshow=["'](?:0|false)["']/i.test(xml);
      const texts = collectXmlText(parser.parse(xml)).filter(Boolean);
      const notesPart = await findNotesSlidePart(zip, name, relationshipParser);
      let notes = '';
      if (notesPart) {
        const notesEntry = zip.file(notesPart);
        if (notesEntry) {
          totalNotesBytes += notesEntry._data?.uncompressedSize || 0;
          if (totalNotesBytes > MAX_PROJECT_BYTES) {
            throw new Error('The presentation contains too much uncompressed speaker-notes data to import safely.');
          }
          notes = await readNotesSlideText(zip, notesPart, notesParser);
        }
      }
      slides.push({
        ...(hidden ? { hidden: true } : {}),
        ...(backgroundColor ? { backgroundColor } : {}),
        title: texts[0] || `Slide ${slides.length + 1}`,
        body: texts.slice(1).join('\n'),
        notes
      });
    }
    return { kind: 'slides', title: path.basename(filePath, ext), slideSize, themeId: await readPptxThemeMetadata(zip), slides: slides.length ? slides : [{ title: 'Imported presentation', body: '' }] };
  }
  if (ext === '.txt' || ext === '.md' || ext === '.html') {
    assertDocumentTextLimit(buffer.byteLength);
    const text = decodeUtf8(buffer, 'This imported file is not valid UTF-8 text.');
    return { kind: ext === '.txt' ? 'notes' : 'pages', title: path.basename(filePath, ext), text, html: ext === '.html' ? text : undefined };
  }
  if (ext === '.bdesk') {
    const jsonText = decodeUtf8(buffer, 'This Brightdesk project file is not valid UTF-8 JSON.');
    let project;
    try { project = JSON.parse(jsonText); }
    catch { throw new Error('This Brightdesk project file is not valid JSON.'); }
    return validateProject(project);
  }
  throw new Error(`Brightdesk cannot open ${ext || 'this file type'} yet. Supported: DOCX, XLSX, CSV, PPTX, TXT, MD, HTML and BDESK.`);
}
function htmlToBlocks(html) {
  const stripped = String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|h[1-6]|li)>/gi, '\n');
  const noTags = stripped.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
  return noTags.split(/\n+/).map(text => text.trim()).filter(Boolean);
}
async function exportOfficeFile(payload, filePath) {
  const kind = payload.kind;
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.bdesk') {
    const project = validateProject(payload.project);
    await fs.writeFile(filePath, JSON.stringify(project, null, 2));
    return;
  }
  if (kind === 'pages' && ext === '.docx') {
    const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');
    const blocks = payload.blocks?.length ? payload.blocks : htmlToBlocks(payload.html).map(text => ({ text, type: 'paragraph' }));
    const children = blocks.map(block => new Paragraph({
      heading: block.type === 'h1' ? HeadingLevel.HEADING_1 : block.type === 'h2' ? HeadingLevel.HEADING_2 : undefined,
      bullet: block.type === 'li' ? { indent: 360 } : undefined,
      children: [new TextRun({ text: block.text || '', bold: !!block.bold, italics: !!block.italic, underline: block.underline ? {} : undefined })]
    }));
    const doc = new Document({ sections: [{ children }] });
    await fs.writeFile(filePath, await Packer.toBuffer(doc)); return;
  }
  if (kind === 'sheets' && (ext === '.xlsx' || ext === '.xlsm')) {
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet(payload.title || 'Sheet 1');
    (payload.rows || []).forEach((row, r) => row.forEach((value, c) => {
      const cell = sheet.getCell(r + 1, c + 1);
      if (typeof value === 'string' && value.startsWith('=')) cell.value = { formula: value.slice(1) };
      else cell.value = value === '' || value == null ? null : (Number.isFinite(Number(value)) && String(value).trim() !== '' ? Number(value) : value);
    }));
    sheet.views = [{ state: 'frozen', ySplit: 1, xSplit: 1 }];
    sheet.columns.forEach(col => { col.width = 16; });
    await workbook.xlsx.writeFile(filePath); return;
  }
  if (kind === 'sheets' && ext === '.csv') {
    const csv = (payload.rows || []).map(row => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    await fs.writeFile(filePath, '\uFEFF' + csv, 'utf8'); return;
  }
  if (kind === 'slides' && ext === '.pptx') {
    const PptxGenJS = require('pptxgenjs');
    const slideSize = SUPPORTED_SLIDE_SIZES.has(payload.slideSize) ? payload.slideSize : 'widescreen';
    const isStandard = slideSize === 'standard';
    const horizontalScale = isStandard ? 0.75 : 1;
    const x = value => value * horizontalScale;
    const w = value => value * horizontalScale;
    const themeId = SUPPORTED_SLIDE_THEMES.has(payload.themeId) ? payload.themeId : 'lavender';
    const theme = {
      lavender: {
        background: 'FCF3E9', surface: 'FFFFFF', title: '26364D',
        body: '4A5A70', accent: '9A5E20', divider: 'E5E8EE'
      },
      midnight: {
        background: '202B3B', surface: '202B3B', title: 'FFFFFF',
        body: 'D0D9E6', accent: 'D0D9E6', divider: '35445B'
      },
      paper: {
        background: 'FFFFFF', surface: 'FFFFFF', title: '26364D',
        body: '53647B', accent: '53647B', divider: 'E1E1E1'
      }
    }[themeId];
    const pptx = new PptxGenJS();
    pptx.layout = isStandard ? 'LAYOUT_4x3' : 'LAYOUT_WIDE';
    pptx.author = 'Brightdesk'; pptx.subject = 'Brightdesk presentation';
    for (const data of (payload.slides || [])) {
      const slide = pptx.addSlide();
      if (data.hidden === true) slide.hidden = true;
      const layout = SUPPORTED_SLIDE_LAYOUTS.has(data.layout) ? data.layout : 'title-content';
      const backgroundColor = typeof data.backgroundColor === 'string' && SLIDE_BACKGROUND_COLOR_PATTERN.test(data.backgroundColor)
        ? data.backgroundColor.toUpperCase()
        : null;
      const customTextColor = backgroundColor ? getReadablePptxTextColor(backgroundColor) : null;
      slide.background = { color: backgroundColor ? backgroundColor.slice(1) : (layout === 'title' ? theme.background : theme.surface) };
      const titleStyle = {
        x: x(0.72), y: 0.48, w: w(11.9), h: 0.9,
        fontFace: 'Aptos Display', fontSize: 30, bold: true,
        color: customTextColor || theme.title, margin: 0.04, breakLine: false
      };
      if (layout === 'title') {
        slide.addText(data.title || '', {
          ...titleStyle, x: x(1.1), y: 2.0, w: w(11.1), h: 1.5,
          fontSize: 38, align: 'center', valign: 'mid'
        });
        if (data.body) slide.addText(data.body, {
          x: x(1.4), y: 3.75, w: w(10.5), h: 0.9,
          fontFace: 'Aptos', fontSize: 22, color: customTextColor || theme.body,
          align: 'center', valign: 'mid', margin: 0.04
        });
      } else if (layout === 'section-header') {
        slide.addText(data.title || '', {
          ...titleStyle, x: x(0.95), y: 2.1, w: w(11.0), h: 1.4,
          fontSize: 36, color: customTextColor || theme.accent, valign: 'mid'
        });
        if (data.body) slide.addText(data.body, {
          x: x(1.0), y: 3.65, w: w(10.5), h: 1.0,
          fontFace: 'Aptos', fontSize: 21, color: customTextColor || theme.body,
          valign: 'top', margin: 0.04
        });
      } else if (layout === 'two-content') {
        slide.addText(data.title || '', titleStyle);
        slide.addShape(pptx.ShapeType.line, {
          x: x(6.65), y: 1.7, w: w(0), h: 4.9,
          line: { color: customTextColor || theme.divider, width: 1 }
        });
        slide.addText(data.body || '', {
          x: x(0.8), y: 1.7, w: w(5.45), h: 4.9,
          fontFace: 'Aptos', fontSize: 20, color: customTextColor || theme.body,
          valign: 'top', margin: 0.08, breakLine: false
        });
        slide.addText(data.bodySecondary || '', {
          x: x(6.95), y: 1.7, w: w(5.45), h: 4.9,
          fontFace: 'Aptos', fontSize: 20, color: customTextColor || theme.body,
          valign: 'top', margin: 0.08, breakLine: false
        });
      } else {
        slide.addText(data.title || '', titleStyle);
        slide.addText(data.body || '', {
          x: x(0.85), y: 1.7, w: w(11.7), h: 4.9,
          fontFace: 'Aptos', fontSize: 20, color: customTextColor || theme.body,
          breakLine: false, valign: 'top', margin: 0.08
        });
      }
      const slideObjects = Array.isArray(data.objects) ? data.objects : [];
      for (const object of slideObjects) {
        if (!isPlainObject(object) || !SUPPORTED_SLIDE_OBJECT_TYPES.has(object.type)) continue;
        const objectX = x(13.333333 * object.x / 100);
        const objectY = 7.5 * object.y / 100;
        const objectW = w(13.333333 * object.width / 100);
        const objectH = 7.5 * object.height / 100;
        const rotation = Number.isFinite(object.rotation) ? object.rotation : 0;
        const objectName = 'Brightdesk ' + String(object.id || object.type);
        if (object.type === 'text') {
          const textOptions = {
            x: objectX,
            y: objectY,
            w: objectW,
            h: objectH,
            fontFace: 'Aptos',
            fontSize: Number.isFinite(object.fontSize) ? object.fontSize : 20,
            color: String(object.textColor || theme.body).replace(/^#/, ''),
            bold: object.bold === true,
            margin: 0.04,
            valign: 'mid',
            breakLine: false,
            rotate: rotation,
            objectName
          };
          if (object.fill) textOptions.fill = { color: String(object.fill).replace(/^#/, '') };
          if (object.stroke && object.strokeWidth > 0) {
            textOptions.line = { color: String(object.stroke).replace(/^#/, ''), width: object.strokeWidth };
          } else {
            textOptions.line = { type: 'none' };
          }
          slide.addText(typeof object.text === 'string' ? object.text : '', textOptions);
          continue;
        }

        const shapeType = object.type === 'rectangle'
          ? pptx.ShapeType.rect
          : object.type === 'ellipse'
            ? pptx.ShapeType.ellipse
            : pptx.ShapeType.line;
        slide.addShape(shapeType, {
          x: objectX,
          y: objectY,
          w: objectW,
          h: object.type === 'line' ? 0 : objectH,
          rotate: rotation,
          objectName,
          fill: object.type === 'line' || object.fill === null
            ? { color: 'FFFFFF', transparency: 100 }
            : { type: 'solid', color: String(object.fill || '#F3EBDD').replace(/^#/, '') },
          line: object.stroke && object.strokeWidth > 0
            ? { color: String(object.stroke).replace(/^#/, ''), width: object.strokeWidth }
            : { type: 'none' }
        });
      }
      if (typeof data.notes === 'string' && data.notes.trim()) slide.addNotes(data.notes);
    }
    await pptx.writeFile({ fileName: filePath });
    await writePptxThemeMetadata(filePath, themeId);
    return;
  }
  if (kind === 'pages' && ext === '.html') { await fs.writeFile(filePath, payload.html || '', 'utf8'); return; }
  if (kind === 'notes' && (ext === '.md' || ext === '.txt')) { await fs.writeFile(filePath, payload.text || '', 'utf8'); return; }
  throw new Error(`This export format is not available for ${kind}.`);
}
module.exports = { cleanFileName, parseCsv, parseTsv, ensureExtension, openOfficeFile, exportOfficeFile, validateProject, assertSheetDimensions };
