const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { cleanFileName, parseCsv, parseTsv, ensureExtension, exportOfficeFile, openOfficeFile, validateProject, assertSheetDimensions } = require('../src/file-service');

test('cleanFileName removes unsafe characters and limits length', () => {
  assert.equal(cleanFileName('budget: 2026/report?'), 'budget_ 2026_report_');
  assert.ok(cleanFileName('x'.repeat(200)).length <= 120);
});

test('parseCsv handles quoted commas, quotes, and new lines', () => {
  assert.deepEqual(parseCsv('Name,Note\r\nAlex,"hello, world"\r\nSam,"said ""hi"""'), [
    ['Name','Note'], ['Alex','hello, world'], ['Sam','said "hi"']
  ]);
});

test('parseTsv preserves quoted tabs, quotes, and new lines', () => {
  assert.deepEqual(parseTsv('Name\tNote\r\nAlex\t"hello\tworld"\r\nSam\t"said ""hi"""'), [
    ['Name','Note'], ['Alex','hello\tworld'], ['Sam','said "hi"']
  ]);
});

test('save paths receive the default extension only when missing', () => {
  assert.equal(ensureExtension('/tmp/report', 'docx'), '/tmp/report.docx');
  assert.equal(ensureExtension('/tmp/report.csv', 'xlsx'), '/tmp/report.csv');
  assert.equal(ensureExtension('/tmp/report.', 'pdf'), '/tmp/report.pdf');
});

test('TSV files import with tab-aware quoting', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'brightdesk-tsv-'));
  const filePath = path.join(directory, 'test.tsv');
  try {
    await fs.writeFile(filePath, 'Name\tNote\r\nAlex\t"hello\tworld"', 'utf8');
    const imported = await openOfficeFile(filePath);
    assert.deepEqual(imported.cells, [['Name','Note'], ['Alex','hello\tworld']]);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('Brightdesk project file can be saved and reopened', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'brightdesk-test-'));
  const filePath = path.join(directory, 'test.bdesk');
  const project = { title: 'Test', docs: { pages: { title: 'My page', html: '<p>Hello</p>' } } };
  try {
    await exportOfficeFile({ project }, filePath);
    const reopened = await openOfficeFile(filePath);
    assert.deepEqual(reopened, project);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('CSV export writes valid quoted cells', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'brightdesk-csv-'));
  const filePath = path.join(directory, 'test.csv');
  try {
    await exportOfficeFile({ kind: 'sheets', title: 'Test', rows: [['Name','Value'], ['Alex','a,b'], ['Sam','say "hi"']] }, filePath);
    const data = (await fs.readFile(filePath, 'utf8')).replace(/^\uFEFF/, '');
    assert.deepEqual(parseCsv(data), [['Name','Value'], ['Alex','a,b'], ['Sam','say "hi"']]);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});


test('Brightdesk project validation rejects malformed document collections and unknown modules', () => {
  assert.throws(() => validateProject({ title: 'Bad', docs: [] }), /invalid document collection/);
  assert.throws(() => validateProject({ title: 'Bad', docs: { pages: 'not a document' } }), /document is not valid/);
  assert.throws(() => validateProject({ title: 'Bad', docs: { outlook: { title: 'Mail' } } }), /unsupported app module/);
  assert.throws(() => validateProject({ title: 'Bad', docs: { unknown: { title: 'Unknown' } } }), /unsupported app module/);
});

test('Brightdesk project validation enforces core document size and shape limits', () => {
  assert.throws(() => validateProject({ docs: { pages: { html: 'x'.repeat(10 * 1024 * 1024 + 1) } } }), /10 MB limit/);
  assert.throws(() => validateProject({ docs: { sheets: { cells: [['=SUM(A1:A2)', { bad: true }]] } } }), /unsupported cell value/);
  assert.throws(() => validateProject({ docs: { slides: { slides: [{ title: 'Slide' }], current: 3 } } }), /invalid selected slide/);
});

test('Brightdesk project import rejects malformed JSON with a clear error', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'brightdesk-invalid-project-'));
  const filePath = path.join(directory, 'broken.bdesk');
  try {
    await fs.writeFile(filePath, '{not json', 'utf8');
    await assert.rejects(openOfficeFile(filePath), /not valid JSON/);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('text imports reject malformed UTF-8 rather than silently replacing bytes', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'brightdesk-invalid-utf8-'));
  const invalidText = Buffer.from([0x6e,0x61,0x6d,0x65,0x2c,0x76,0x61,0x6c,0x75,0x65,0x0a,0x41,0x6c,0x65,0x78,0x2c,0xc3,0x28]);
  const invalidProject = Buffer.concat([
    Buffer.from('{"docs":{"notes":{"text":"'),
    Buffer.from([0xc3,0x28]),
    Buffer.from('"}}}')
  ]);
  try {
    for (const extension of ['.csv','.tsv','.txt','.md','.html']) {
      const filePath = path.join(directory, 'broken' + extension);
      await fs.writeFile(filePath, invalidText);
      await assert.rejects(openOfficeFile(filePath), /not valid UTF-8 text/);
    }
    const projectPath = path.join(directory, 'broken.bdesk');
    await fs.writeFile(projectPath, invalidProject);
    await assert.rejects(openOfficeFile(projectPath), /not valid UTF-8 JSON/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('CSV and TSV imports reject spreadsheets over the 250,000-cell limit', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'brightdesk-large-sheet-'));
  const columns = Array(250001).fill('x');
  try {
    for (const extension of ['.csv', '.tsv']) {
      const row = Buffer.from(columns.join(extension === '.tsv' ? '\t' : ','));
      const filePath = path.join(directory, 'large' + extension);
      await fs.writeFile(filePath, row);
      await assert.rejects(openOfficeFile(filePath), /250,000-cell limit/);
    }
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('TXT, Markdown and HTML imports enforce the 10 MB text limit', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'brightdesk-large-text-'));
  const oversizedText = Buffer.alloc(10 * 1024 * 1024 + 1, 0x61);
  try {
    for (const extension of ['.txt', '.md', '.html']) {
      const filePath = path.join(directory, 'large' + extension);
      await fs.writeFile(filePath, oversizedText);
      await assert.rejects(openOfficeFile(filePath), /10 MB text limit/);
    }
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('CSV and TSV parsers stop as soon as the 250,000-cell limit is exceeded', () => {
  const csv = Array(250001).fill('x').join(',');
  const tsv = Array(250001).fill('x').join('\t');
  assert.throws(() => parseCsv(csv), /250,000-cell limit/);
  assert.throws(() => parseTsv(tsv), /250,000-cell limit/);
});

test('XLSX worksheet dimensions reject oversized cell grids before row conversion', () => {
  assert.doesNotThrow(() => assertSheetDimensions(250000, 0));
  assert.doesNotThrow(() => assertSheetDimensions(0, 250000));
  assert.throws(() => assertSheetDimensions(250001, 0), /250,000-cell limit/);
  assert.throws(() => assertSheetDimensions(0, 250001), /250,000-cell limit/);

  assert.doesNotThrow(() => assertSheetDimensions(500, 500));
  assert.doesNotThrow(() => assertSheetDimensions(0, 0));
  assert.throws(() => assertSheetDimensions(500001, 1), /250,000-cell limit/);
  assert.throws(() => assertSheetDimensions(501, 500), /250,000-cell limit/);
});

test('CSV and TSV parsers reject malformed quotes and preserve empty quoted cells', () => {
  const cases = [
    [parseCsv, 'Name,Note\nAlex,"hello"', [['Name','Note'], ['Alex','hello']]],
    [parseTsv, 'Name\tNote\nAlex\t"hello"', [['Name','Note'], ['Alex','hello']]]
  ];
  for (const [parse, validInput, expected] of cases) {
    assert.throws(() => parse('"unfinished'), /invalid quotation/);
    assert.throws(() => parse('Alex"bad,value'), /invalid quotation/);
    assert.throws(() => parse('"closed"trailing,value'), /invalid quotation/);
    assert.deepEqual(parse(validInput), expected);
    assert.deepEqual(parse('""'), [['']]);
  }
});


test('Brightdesk project validation checks speaker notes in Decks slides', () => {
  assert.doesNotThrow(() => validateProject({
    docs: { slides: { slides: [{ title: 'Slide', body: 'Content', notes: 'Presenter cue' }], current: 0 } }
  }));
  assert.throws(() => validateProject({
    docs: { slides: { slides: [{ title: 'Slide', body: 'Content', notes: { invalid: true } }], current: 0 } }
  }), /invalid slide/);
  assert.throws(() => validateProject({
    docs: { slides: { slides: [{ title: 'Slide', body: 'Content', notes: 'x'.repeat(10 * 1024 * 1024 + 1) }], current: 0 } }
  }), /invalid slide/);
});

test('PPTX export includes speaker notes for each slide', async () => {
  const JSZip = require('jszip');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'brightdesk-pptx-notes-'));
  const filePath = path.join(directory, 'speaker-notes.pptx');
  try {
    await exportOfficeFile({
      kind: 'slides',
      slides: [
        { title: 'Welcome', body: 'Hello', notes: 'Introduce the team and welcome everyone.' },
        { title: 'Plan', body: 'Next steps', notes: 'Pause for questions after this slide.' }
      ]
    }, filePath);
    const archive = await JSZip.loadAsync(await fs.readFile(filePath));
    const firstNotes = await archive.file('ppt/notesSlides/notesSlide1.xml')?.async('string');
    const secondNotes = await archive.file('ppt/notesSlides/notesSlide2.xml')?.async('string');
    assert.match(firstNotes || '', /Introduce the team and welcome everyone/);
    assert.match(secondNotes || '', /Pause for questions after this slide/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});


test('Brightdesk project validation accepts supported slide layouts and secondary text', () => {
  assert.doesNotThrow(() => validateProject({
    docs: {
      slides: {
        slides: [{
          title: 'Compare',
          body: 'First column',
          bodySecondary: 'Second column',
          notes: 'Discuss both sides.',
          layout: 'two-content'
        }],
        current: 0
      }
    }
  }));
});

test('Brightdesk project validation rejects unknown slide layouts', () => {
  assert.throws(() => validateProject({
    docs: { slides: { slides: [{ title: 'Slide', body: '', layout: 'unknown-layout' }], current: 0 } }
  }), /invalid slide/);
});

test('Brightdesk project validation bounds secondary slide content', () => {
  assert.throws(() => validateProject({
    docs: { slides: { slides: [{ title: 'Slide', body: '', bodySecondary: 'x'.repeat(10 * 1024 * 1024 + 1) }], current: 0 } }
  }), /invalid slide/);
});

test('PPTX export writes both content placeholders for a two-content slide', async () => {
  const JSZip = require('jszip');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'brightdesk-pptx-layout-'));
  const filePath = path.join(directory, 'two-content.pptx');
  try {
    await exportOfficeFile({
      kind: 'slides',
      slides: [{
        title: 'Compare approaches',
        body: 'Approach A',
        bodySecondary: 'Approach B',
        layout: 'two-content'
      }]
    }, filePath);
    const archive = await JSZip.loadAsync(await fs.readFile(filePath));
    const slideXml = await archive.file('ppt/slides/slide1.xml')?.async('string');
    assert.match(slideXml || '', /Approach A/);
    assert.match(slideXml || '', /Approach B/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});


test('Brightdesk project validation accepts supported presentation slide sizes', () => {
  for (const slideSize of ['widescreen', 'standard']) {
    assert.doesNotThrow(() => validateProject({
      docs: {
        slides: {
          title: 'Sized presentation',
          slideSize,
          slides: [{ title: 'Welcome', body: 'Hello' }],
          current: 0
        }
      }
    }));
  }
});

test('Brightdesk project validation rejects unsupported presentation slide sizes', () => {
  assert.throws(() => validateProject({
    docs: {
      slides: {
        slideSize: 'cinemascope',
        slides: [{ title: 'Welcome', body: 'Hello' }],
        current: 0
      }
    }
  }), /invalid slide size/);
});

test('PPTX export writes standard 4:3 dimensions and reopening retains the size', async () => {
  const JSZip = require('jszip');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'brightdesk-pptx-standard-'));
  const filePath = path.join(directory, 'standard.pptx');
  try {
    await exportOfficeFile({
      kind: 'slides',
      slideSize: 'standard',
      slides: [{ title: 'Standard size', body: 'Four by three' }]
    }, filePath);

    const archive = await JSZip.loadAsync(await fs.readFile(filePath));
    const presentationXml = await archive.file('ppt/presentation.xml')?.async('string');
    assert.match(presentationXml || '', /cx="9144000"[^>]*cy="6858000"/);

    const reopened = await openOfficeFile(filePath);
    assert.equal(reopened.slideSize, 'standard');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('PPTX export retains widescreen 16:9 dimensions by default', async () => {
  const JSZip = require('jszip');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'brightdesk-pptx-widescreen-'));
  const filePath = path.join(directory, 'widescreen.pptx');
  try {
    await exportOfficeFile({
      kind: 'slides',
      slides: [{ title: 'Widescreen', body: 'Sixteen by nine' }]
    }, filePath);

    const archive = await JSZip.loadAsync(await fs.readFile(filePath));
    const presentationXml = await archive.file('ppt/presentation.xml')?.async('string');
    assert.match(presentationXml || '', /cx="12192000"[^>]*cy="6858000"/);
    const reopened = await openOfficeFile(filePath);
    assert.equal(reopened.slideSize, 'widescreen');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});


test('Brightdesk project validation checks slide size even before a slide collection is created', () => {
  assert.throws(() => validateProject({
    docs: { slides: { title: 'Unfinished deck', slideSize: 'panoramic' } }
  }), /invalid slide size/);
});


test('Brightdesk project validation accepts and preserves named slide sections', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'brightdesk-sections-'));
  const filePath = path.join(directory, 'sections.bdesk');
  const project = {
    title: 'Sections',
    docs: {
      slides: {
        title: 'Sections',
        sections: [{ id: 'opening', name: 'Opening' }],
        slides: [
          { title: 'Welcome', body: '', sectionId: 'opening' },
          { title: 'Agenda', body: '', sectionId: 'opening' }
        ],
        current: 0
      }
    }
  };
  try {
    assert.doesNotThrow(() => validateProject(project));
    await exportOfficeFile({ project }, filePath);
    const reopened = await openOfficeFile(filePath);
    assert.deepEqual(reopened.docs.slides.sections, [{ id: 'opening', name: 'Opening' }]);
    assert.equal(reopened.docs.slides.slides[1].sectionId, 'opening');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('Brightdesk project validation rejects malformed or duplicate slide sections', () => {
  assert.throws(() => validateProject({
    docs: { slides: { sections: 'not an array', slides: [{ title: 'Slide' }] } }
  }), /invalid section collection/);
  assert.throws(() => validateProject({
    docs: {
      slides: {
        sections: [{ id: 'same', name: 'One' }, { id: 'same', name: 'Two' }],
        slides: [{ title: 'Slide', sectionId: 'same' }]
      }
    }
  }), /invalid section/);
  assert.throws(() => validateProject({
    docs: {
      slides: {
        sections: [{ id: 'known', name: 'Known' }],
        slides: [{ title: 'Slide', sectionId: 'missing' }]
      }
    }
  }), /unknown section/);
});


test('Brightdesk project validation rejects slide membership without a matching section', () => {
  assert.throws(() => validateProject({
    docs: { slides: { slides: [{ title: 'Slide', sectionId: 'missing' }] } }
  }), /unknown section/);
});


test('Brightdesk project validation accepts boolean hidden slide state and rejects other values', () => {
  assert.doesNotThrow(() => validateProject({
    docs: { slides: { slides: [{ title: 'Hidden', body: '', hidden: true }], current: 0 } }
  }));
  assert.throws(() => validateProject({
    docs: { slides: { slides: [{ title: 'Bad hidden state', body: '', hidden: 'yes' }], current: 0 } }
  }), /invalid slide/);
});

test('PPTX export and import preserve hidden slide state', async () => {
  const JSZip = require('jszip');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'brightdesk-pptx-hidden-'));
  const filePath = path.join(directory, 'hidden-slides.pptx');
  try {
    await exportOfficeFile({
      kind: 'slides',
      slides: [
        { title: 'Visible slide', body: 'Audience sees this' },
        { title: 'Hidden slide', body: 'Keep this in the deck', hidden: true }
      ]
    }, filePath);

    const archive = await JSZip.loadAsync(await fs.readFile(filePath));
    const visibleXml = await archive.file('ppt/slides/slide1.xml')?.async('string');
    const hiddenXml = await archive.file('ppt/slides/slide2.xml')?.async('string');
    assert.doesNotMatch(visibleXml || '', /\bshow=["'](?:0|false)["']/i);
    assert.match(hiddenXml || '', /\bshow=["'](?:0|false)["']/i);

    const reopened = await openOfficeFile(filePath);
    assert.equal(reopened.slides[0].hidden, undefined);
    assert.equal(reopened.slides[1].hidden, true);
    assert.equal(reopened.slides[1].body, 'Keep this in the deck');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});


test('PPTX import restores speaker notes for each matching slide', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'brightdesk-pptx-notes-import-'));
  const filePath = path.join(directory, 'speaker-notes-import.pptx');
  const expectedNotes = [
    'Introduce the team & explain the purpose.\nPause for questions.',
    '',
    'Close with the agreed next steps.'
  ];
  try {
    await exportOfficeFile({
      kind: 'slides',
      slides: [
        { title: 'Welcome', body: 'Hello', notes: expectedNotes[0] },
        { title: 'Agenda', body: 'Today', notes: expectedNotes[1] },
        { title: 'Next steps', body: 'Plan', notes: expectedNotes[2] }
      ]
    }, filePath);

    const reopened = await openOfficeFile(filePath);

    assert.equal(reopened.slides.length, 3);
    assert.deepEqual(reopened.slides.map(slide => slide.notes), expectedNotes);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});


test('PPTX import ignores external speaker-notes relationships without following their URLs', async () => {
  const JSZip = require('jszip');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'brightdesk-pptx-external-notes-'));
  const filePath = path.join(directory, 'external-notes.pptx');
  try {
    await exportOfficeFile({
      kind: 'slides',
      slides: [{ title: 'External notes', body: 'Keep imports local', notes: 'Do not fetch external notes.' }]
    }, filePath);

    const archive = await JSZip.loadAsync(await fs.readFile(filePath));
    const relationshipsPath = 'ppt/slides/_rels/slide1.xml.rels';
    const relationships = await archive.file(relationshipsPath)?.async('string');
    assert.ok(relationships, 'the slide has an internal relationships part');
    assert.match(relationships, /Target="\.\.\/notesSlides\/notesSlide1\.xml"/);
    archive.file(
      relationshipsPath,
      relationships.replace(
        'Target="../notesSlides/notesSlide1.xml"',
        'Target="https://example.invalid/notesSlide1.xml" TargetMode="External"'
      )
    );
    await fs.writeFile(filePath, await archive.generateAsync({ type: 'nodebuffer' }));

    const reopened = await openOfficeFile(filePath);
    assert.equal(reopened.slides[0].notes, '');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});


test('Brightdesk project validation accepts optional stable slide IDs and rejects malformed or duplicate IDs', () => {
  assert.doesNotThrow(() => validateProject({
    docs: { slides: { slides: [{ title: 'Legacy slide', body: '' }] } }
  }));
  assert.doesNotThrow(() => validateProject({
    docs: {
      slides: {
        slides: [
          { id: 'slide-opening', title: 'Opening', body: '' },
          { id: 'slide-agenda', title: 'Agenda', body: '' }
        ]
      }
    }
  }));
  assert.throws(() => validateProject({
    docs: {
      slides: {
        slides: [
          { id: 'slide-same', title: 'One', body: '' },
          { id: 'slide-same', title: 'Two', body: '' }
        ]
      }
    }
  }), /invalid slide/);
  assert.throws(() => validateProject({
    docs: { slides: { slides: [{ id: 'not a safe ID', title: 'Bad', body: '' }] } }
  }), /invalid slide/);
});

test('Brightdesk project export and import preserve stable slide IDs', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'brightdesk-stable-slide-ids-'));
  const filePath = path.join(directory, 'stable-slide-ids.bdesk');
  const expectedIds = ['slide-opening', 'slide-agenda'];
  const project = {
    title: 'Stable identities',
    docs: {
      slides: {
        title: 'Stable identities',
        slides: [
          { id: expectedIds[0], title: 'Opening', body: 'Welcome' },
          { id: expectedIds[1], title: 'Agenda', body: 'Plan' }
        ],
        current: 0
      }
    }
  };
  try {
    await exportOfficeFile({ project }, filePath);
    const reopened = await openOfficeFile(filePath);
    assert.deepEqual(reopened.docs.slides.slides.map(slide => slide.id), expectedIds);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});


test('Brightdesk project validation accepts only supported persisted slide themes', () => {
  for (const themeId of ['lavender', 'midnight', 'paper']) {
    assert.doesNotThrow(() => validateProject({
      docs: { slides: { themeId, slides: [{ title: 'Slide', body: '' }] } }
    }));
  }
  assert.throws(() => validateProject({
    docs: { slides: { themeId: 'ultraviolet', slides: [{ title: 'Slide', body: '' }] } }
  }), /invalid theme/);
});

test('PPTX export applies the saved Brightdesk slide theme colours', async () => {
  const JSZip = require('jszip');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'brightdesk-pptx-themes-'));
  const themeCases = [
    { themeId: 'lavender', background: 'FCF3E9', title: '26364D' },
    { themeId: 'midnight', background: '202B3B', title: 'FFFFFF' },
    { themeId: 'paper', background: 'FFFFFF', title: '26364D' }
  ];
  try {
    for (const theme of themeCases) {
      const filePath = path.join(directory, theme.themeId + '.pptx');
      await exportOfficeFile({
        kind: 'slides',
        themeId: theme.themeId,
        slides: [{ title: 'Theme proof', body: 'Same content, saved theme', layout: 'title' }]
      }, filePath);
      const archive = await JSZip.loadAsync(await fs.readFile(filePath));
      const slideXml = await archive.file('ppt/slides/slide1.xml')?.async('string');
      assert.match(slideXml || '', new RegExp('val="' + theme.background + '"'));
      assert.match(slideXml || '', new RegExp('val="' + theme.title + '"'));

      const customProperties = await archive.file('docProps/custom.xml')?.async('string');
      const packageRelationships = await archive.file('_rels/.rels')?.async('string');
      const contentTypes = await archive.file('[Content_Types].xml')?.async('string');
      assert.match(customProperties || '', new RegExp('name="BrightdeskTheme"><vt:lpwstr>' + theme.themeId + '</vt:lpwstr>'));
      assert.match(packageRelationships || '', /relationships\/custom-properties/);
      assert.match(contentTypes || '', /application\/vnd\.openxmlformats-officedocument\.custom-properties\+xml/);

      const reopened = await openOfficeFile(filePath);
      assert.equal(reopened.themeId, theme.themeId);
    }
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('Brightdesk project export and import preserve the selected slide theme', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'brightdesk-slide-theme-project-'));
  const filePath = path.join(directory, 'midnight-theme.bdesk');
  try {
    await exportOfficeFile({
      project: {
        title: 'Night presentation',
        docs: {
          slides: {
            title: 'Night presentation',
            themeId: 'midnight',
            slides: [{ id: 'slide-night', title: 'Night', body: 'Text' }],
            current: 0
          }
        }
      }
    }, filePath);
    const reopened = await openOfficeFile(filePath);
    assert.equal(reopened.docs.slides.themeId, 'midnight');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});


test('PPTX import ignores external Brightdesk theme metadata relationships', async () => {
  const JSZip = require('jszip');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'brightdesk-pptx-external-theme-'));
  const filePath = path.join(directory, 'external-theme.pptx');
  try {
    await exportOfficeFile({
      kind: 'slides',
      themeId: 'midnight',
      slides: [{ title: 'External theme', body: 'Keep it local' }]
    }, filePath);

    const archive = await JSZip.loadAsync(await fs.readFile(filePath));
    const relationshipsPath = '_rels/.rels';
    const relationships = await archive.file(relationshipsPath)?.async('string');
    assert.ok(relationships, 'the package has a root relationships part');
    assert.match(relationships, /relationships\/custom-properties/);
    archive.file(
      relationshipsPath,
      relationships.replace(
        'Target="docProps/custom.xml"',
        'Target="https://example.invalid/custom.xml" TargetMode="External"'
      )
    );
    await fs.writeFile(filePath, await archive.generateAsync({ type: 'nodebuffer' }));

    const reopened = await openOfficeFile(filePath);
    assert.equal(reopened.themeId, 'lavender');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});


test('Brightdesk project validation accepts legacy slides and known stable layout IDs', () => {
  assert.doesNotThrow(() => validateProject({
    docs: { slides: { slides: [{ title: 'Legacy', body: '' }] } }
  }));
  assert.doesNotThrow(() => validateProject({
    docs: {
      slides: {
        slides: [
          { title: 'Title', body: '', layout: 'title', layoutId: 'layout-title' },
          { title: 'Standard', body: '', layout: 'title-content', layoutId: 'layout-title-content' },
          { title: 'Comparison', body: '', layout: 'two-content', layoutId: 'layout-two-content' },
          { title: 'Section', body: '', layout: 'section-header', layoutId: 'layout-section-header' }
        ]
      }
    }
  }));
  assert.doesNotThrow(() => validateProject({
    docs: { slides: { slides: [{ title: 'Migrating layout', body: '', layoutId: 'layout-two-content' }] } }
  }));
  assert.throws(() => validateProject({
    docs: { slides: { slides: [{ title: 'Bad', body: '', layoutId: 'layout-random' }] } }
  }), /invalid slide/);
  assert.throws(() => validateProject({
    docs: { slides: { slides: [{ title: 'Mismatch', body: '', layout: 'two-content', layoutId: 'layout-title' }] } }
  }), /invalid slide/);
});

test('Brightdesk project export and import preserve stable slide layout IDs', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'brightdesk-layout-identifiers-'));
  const filePath = path.join(directory, 'layout-identifiers.bdesk');
  const expected = [
    { id: 'slide-title', layout: 'title', layoutId: 'layout-title' },
    { id: 'slide-body', layout: 'title-content', layoutId: 'layout-title-content' },
    { id: 'slide-compare', layout: 'two-content', layoutId: 'layout-two-content' },
    { id: 'slide-section', layout: 'section-header', layoutId: 'layout-section-header' }
  ];
  try {
    await exportOfficeFile({
      project: {
        title: 'Layout identities',
        docs: {
          slides: {
            title: 'Layout identities',
            slides: expected.map((item, index) => ({
              ...item, title: 'Slide ' + (index + 1), body: 'Content',
              ...(item.layout === 'two-content' ? { bodySecondary: 'Second column' } : {})
            })),
            current: 0
          }
        }
      }
    }, filePath);
    const reopened = await openOfficeFile(filePath);
    assert.deepEqual(reopened.docs.slides.slides.map(slide => ({
      id: slide.id, layout: slide.layout, layoutId: slide.layoutId
    })), expected);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});


test('Brightdesk project validation accepts only six-digit hexadecimal slide background colours', () => {
  assert.doesNotThrow(() => validateProject({
    docs: { slides: { slides: [{ title: 'Legacy', body: '' }] } }
  }));
  assert.doesNotThrow(() => validateProject({
    docs: { slides: { slides: [{ title: 'Custom', body: '', backgroundColor: '#1A2B3C' }] } }
  }));
  for (const backgroundColor of ['red', '#fff', '#12345G', 'rgb(1,2,3)']) {
    assert.throws(() => validateProject({
      docs: { slides: { slides: [{ title: 'Invalid', body: '', backgroundColor }] } }
    }), /invalid slide/);
  }
});

test('Brightdesk project export and import preserve custom slide backgrounds', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'brightdesk-slide-background-'));
  const filePath = path.join(directory, 'custom-background.bdesk');
  const expected = ['#1A2B3C', '#F3EBDD'];
  try {
    await exportOfficeFile({
      project: {
        title: 'Custom backgrounds',
        docs: {
          slides: {
            title: 'Custom backgrounds',
            slides: expected.map((backgroundColor, index) => ({
              id: 'slide-background-' + index,
              title: 'Slide ' + index,
              body: 'Body',
              backgroundColor
            })),
            current: 0
          }
        }
      }
    }, filePath);
    const reopened = await openOfficeFile(filePath);
    assert.deepEqual(reopened.docs.slides.slides.map(slide => slide.backgroundColor), expected);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('PPTX export applies custom slide background colours and readable text contrast to every layout', async () => {
  const JSZip = require('jszip');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'brightdesk-pptx-custom-background-'));
  const cases = [
    { layout: 'title', backgroundColor: '#202B3B', textColor: 'FFFFFF' },
    { layout: 'title-content', backgroundColor: '#202B3B', textColor: 'FFFFFF' },
    { layout: 'two-content', backgroundColor: '#202B3B', textColor: 'FFFFFF' },
    { layout: 'section-header', backgroundColor: '#202B3B', textColor: 'FFFFFF' },
    { layout: 'title-content', backgroundColor: '#F3EBDD', textColor: '000000' },
    { layout: 'two-content', backgroundColor: '#F3EBDD', textColor: '000000' }
  ];
  try {
    for (const [index, item] of cases.entries()) {
      const filePath = path.join(directory, item.layout + '-' + index + '.pptx');
      await exportOfficeFile({
        kind: 'slides',
        themeId: 'lavender',
        slides: [{
          title: 'Readable title',
          body: 'Readable body',
          bodySecondary: 'Readable second column',
          layout: item.layout,
          backgroundColor: item.backgroundColor
        }]
      }, filePath);
      const archive = await JSZip.loadAsync(await fs.readFile(filePath));
      const slideXml = await archive.file('ppt/slides/slide1.xml')?.async('string');
      assert.match(slideXml || '', new RegExp('val="' + item.backgroundColor.slice(1) + '"'));
      assert.ok(
        (slideXml || '').includes(item.textColor),
        item.layout + ' title and body text should use the high-contrast colour'
      );
      const reopened = await openOfficeFile(filePath);
      assert.equal(reopened.slides[0].backgroundColor, item.backgroundColor);
    }
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('PPTX import follows presentation relationship order rather than slide filenames', async () => {
  const JSZip = require('jszip');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'brightdesk-pptx-slide-order-'));
  const filePath = path.join(directory, 'reordered-slides.pptx');
  const expectedSlides = [
    { title: 'Opening slide', body: 'First in the show', notes: 'Opening notes.' },
    { title: 'Closing slide', body: 'Second in the show', notes: 'Closing notes.', hidden: true }
  ];
  try {
    await exportOfficeFile({ kind: 'slides', slides: expectedSlides }, filePath);

    const archive = await JSZip.loadAsync(await fs.readFile(filePath));
    const relationshipsPath = 'ppt/_rels/presentation.xml.rels';
    const relationships = await archive.file(relationshipsPath)?.async('string');
    assert.ok(relationships, 'the presentation has a relationships part');
    assert.match(relationships, /Target=["']slides\/slide1\.xml["']/);
    assert.match(relationships, /Target=["']slides\/slide2\.xml["']/);

    const reorderedRelationships = relationships
      .replace('Target="slides/slide1.xml"', 'Target="slides/__temporary-slide.xml"')
      .replace('Target="slides/slide2.xml"', 'Target="slides/slide1.xml"')
      .replace('Target="slides/__temporary-slide.xml"', 'Target="slides/slide2.xml"');
    archive.file(relationshipsPath, reorderedRelationships);
    await fs.writeFile(filePath, await archive.generateAsync({ type: 'nodebuffer' }));

    const reopened = await openOfficeFile(filePath);

    assert.deepEqual(reopened.slides.map(slide => ({
      title: slide.title,
      body: slide.body,
      notes: slide.notes,
      hidden: slide.hidden === true
    })), [
      { title: 'Closing slide', body: 'Second in the show', notes: 'Closing notes.', hidden: true },
      { title: 'Opening slide', body: 'First in the show', notes: 'Opening notes.', hidden: false }
    ]);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});



test('PPTX import follows presentation slide order, supports namespace aliases, and ignores orphan slide parts', async () => {
  const JSZip = require('jszip');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'brightdesk-pptx-slide-order-'));
  const filePath = path.join(directory, 'slide-order.pptx');
  const archive = new JSZip();

  const slideXml = (textPrefix, title, body, hidden = false) => `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:${textPrefix}="http://schemas.openxmlformats.org/drawingml/2006/main"${hidden ? ' show="0"' : ''}>
  <p:cSld><p:spTree><p:sp><p:txBody>
    <${textPrefix}:p><${textPrefix}:r><${textPrefix}:t>${title}</${textPrefix}:t></${textPrefix}:r></${textPrefix}:p>
    <${textPrefix}:p><${textPrefix}:r><${textPrefix}:t>${body}</${textPrefix}:t></${textPrefix}:r></${textPrefix}:p>
  </p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`;

  try {
    archive.file('ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
                xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst>
    <p:sldId id="256" r:id="rId2"/>
    <p:sldId id="257" r:id="rId1"/>
  </p:sldIdLst>
  <p:sldSz cx="9144000" cy="6858000"/>
</p:presentation>`);
    archive.file('ppt/_rels/presentation.xml.rels', `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide10.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>`);
    archive.file('ppt/slides/slide1.xml', slideXml('a', 'Unreferenced slide', 'Must not be imported'));
    archive.file('ppt/slides/slide2.xml', slideXml('a', 'Second slide', 'Second body'));
    archive.file('ppt/slides/slide10.xml', slideXml('d', 'First slide', 'First body &amp; details', true));

    await fs.writeFile(filePath, await archive.generateAsync({ type: 'nodebuffer' }));
    const imported = await openOfficeFile(filePath);

    assert.deepEqual(imported.slides.map(slide => slide.title), ['First slide', 'Second slide']);
    assert.deepEqual(imported.slides.map(slide => slide.body), ['First body & details', 'Second body']);
    assert.equal(imported.slides[0].hidden, true);
    assert.equal(imported.slideSize, 'standard');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});


test('Brightdesk project validation accepts structured slide objects and rejects unsafe object data', () => {
  const valid = {
    docs: {
      slides: {
        slides: [{
          title: 'Objects',
          body: '',
          objects: [
            { id: 'object-rectangle', type: 'rectangle', x: 10, y: 15, width: 30, height: 25, fill: '#F3EBDD', stroke: '#26364D', strokeWidth: 2, text: '', fontSize: 20, textColor: '#26364D', bold: false, rotation: 0 },
            { id: 'object-text', type: 'text', x: 48, y: 12, width: 36, height: 18, fill: null, stroke: null, strokeWidth: 0, text: 'Quarterly results', fontSize: 26, textColor: '#202B3B', bold: true, rotation: 0 }
          ]
        }]
      }
    }
  };
  assert.doesNotThrow(() => validateProject(valid));

  const invalidCases = [
    [{ id: 'object-shape', type: 'rectangle', x: -1, y: 0, width: 20, height: 20 }],
    [{ id: 'object-shape', type: 'rectangle', x: 90, y: 0, width: 20, height: 20 }],
    [{ id: 'object-shape', type: 'rectangle', x: 0, y: 0, width: 20, height: 20, fill: 'red' }],
    [{ id: 'object-shape', type: 'unsupported', x: 0, y: 0, width: 20, height: 20 }],
    [{ id: 'object-same', type: 'ellipse', x: 0, y: 0, width: 20, height: 20 }, { id: 'object-same', type: 'ellipse', x: 25, y: 0, width: 20, height: 20 }]
  ];
  for (const objects of invalidCases) {
    assert.throws(() => validateProject({
      docs: { slides: { slides: [{ title: 'Bad objects', body: '', objects }] } }
    }), /invalid slide object/);
  }
});

test('Brightdesk projects accept only bounded embedded PNG, JPEG or WebP picture objects', () => {
  const imageData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==';
  const picture = {
    id: 'object-picture',
    type: 'image',
    x: 10, y: 15, width: 40, height: 30,
    fill: null, stroke: null, strokeWidth: 0,
    text: '', fontSize: 20, textColor: '#26364D', bold: false, rotation: 0,
    imageData, imageName: 'team-photo.png', imageWidth: 1, imageHeight: 1
  };
  const project = {
    docs: { slides: { slides: [{ title: 'Pictures', body: '', objects: [picture] }] } }
  };
  assert.doesNotThrow(() => validateProject(project));

  const invalidPictures = [
    { ...picture, imageData: 'https://example.com/picture.png' },
    { ...picture, imageData: 'data:image/svg+xml;base64,PHN2Zy8+' },
    { ...picture, imageData: 'data:image/png;base64,AAAA' },
    { ...picture, imageWidth: 0 },
    { ...picture, imageHeight: 50000 },
    { ...picture, imageWidth: 2 },
    { ...picture, imageAssetId: '../../picture.png' },
    { ...picture, imageName: 'x'.repeat(256) }
  ];
  for (const invalid of invalidPictures) {
    assert.throws(() => validateProject({
      docs: { slides: { slides: [{ title: 'Unsafe picture', body: '', objects: [invalid] }] } }
    }), /invalid slide object/);
  }

  const oversized = 'A'.repeat(7_000_004);
  assert.throws(() => validateProject({
    docs: { slides: { slides: [{ title: 'Large picture', body: '', objects: [{ ...picture, imageData: 'data:image/png;base64,' + oversized }] }] } }
  }), /invalid slide object/);
});

test('Brightdesk project files preserve an embedded picture without an external file link', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'brightdesk-slide-picture-'));
  const filePath = path.join(directory, 'slide-picture.bdesk');
  const imageData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==';
  const picture = {
    id: 'object-picture',
    type: 'image',
    x: 10, y: 15, width: 40, height: 30,
    fill: null, stroke: null, strokeWidth: 0,
    text: '', fontSize: 20, textColor: '#26364D', bold: false, rotation: 0,
    imageData, imageName: 'team-photo.png', imageWidth: 1, imageHeight: 1
  };
  try {
    await exportOfficeFile({
      project: {
        title: 'Slide picture',
        docs: { slides: { title: 'Slide picture', slides: [{ title: 'Pictures', body: '', objects: [picture] }], current: 0 } }
      }
    }, filePath);
    const reopened = await openOfficeFile(filePath);
    assert.deepEqual(reopened.docs.slides.slides[0].objects[0], picture);
    assert.equal(reopened.docs.slides.slides[0].objects[0].imageData, imageData);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('Brightdesk project export and import preserve structured slide objects and their identities', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'brightdesk-slide-objects-'));
  const filePath = path.join(directory, 'slide-objects.bdesk');
  const objects = [
    { id: 'object-rectangle', type: 'rectangle', x: 10, y: 15, width: 30, height: 25, fill: '#F3EBDD', stroke: '#26364D', strokeWidth: 2, text: '', fontSize: 20, textColor: '#26364D', bold: false, rotation: 0 },
    { id: 'object-text', type: 'text', x: 45, y: 12, width: 40, height: 18, fill: null, stroke: null, strokeWidth: 0, text: 'Quarterly results', fontSize: 26, textColor: '#202B3B', bold: true, rotation: 0 }
  ];
  try {
    await exportOfficeFile({
      project: {
        title: 'Slide objects',
        docs: { slides: { title: 'Slide objects', slides: [{ id: 'slide-objects', title: 'Objects', body: '', objects }], current: 0 } }
      }
    }, filePath);
    const reopened = await openOfficeFile(filePath);
    assert.deepEqual(reopened.docs.slides.slides[0].objects, objects);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});


test('PPTX export keeps text boxes and basic vector shapes editable as native slide objects', async () => {
  const JSZip = require('jszip');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'brightdesk-pptx-slide-objects-'));
  const filePath = path.join(directory, 'native-slide-objects.pptx');
  try {
    await exportOfficeFile({
      kind: 'slides',
      themeId: 'paper',
      slides: [{
        title: 'Native objects',
        body: 'Body text',
        objects: [
          { id: 'object-rectangle', type: 'rectangle', x: 10, y: 20, width: 25, height: 30, fill: '#F3EBDD', stroke: '#26364D', strokeWidth: 2, text: '', fontSize: 20, textColor: '#26364D', bold: false, rotation: 0 },
          { id: 'object-ellipse', type: 'ellipse', x: 45, y: 20, width: 18, height: 18, fill: '#DCEBFA', stroke: '#26364D', strokeWidth: 1, text: '', fontSize: 20, textColor: '#26364D', bold: false, rotation: 0 },
          { id: 'object-line', type: 'line', x: 12, y: 62, width: 42, height: 1, fill: null, stroke: '#9A5E20', strokeWidth: 2, text: '', fontSize: 20, textColor: '#26364D', bold: false, rotation: 0 },
          { id: 'object-text', type: 'text', x: 20, y: 75, width: 55, height: 12, fill: null, stroke: null, strokeWidth: 0, text: 'Quarterly results', fontSize: 26, textColor: '#202B3B', bold: true, rotation: 0 }
        ]
      }]
    }, filePath);
    const archive = await JSZip.loadAsync(await fs.readFile(filePath));
    const xml = await archive.file('ppt/slides/slide1.xml')?.async('string');
    assert.match(xml || '', /F3EBDD/);
    assert.match(xml || '', /DCEBFA/);
    assert.match(xml || '', /9A5E20/);
    assert.match(xml || '', /Quarterly results/);
    assert.match(xml || '', /202B3B/, 'the text box keeps its own selected text colour');
    assert.match(xml || '', /<p:sp>/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});


test('Brightdesk PowerPoint object round-trip restores editable object types, geometry and formatting', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'brightdesk-pptx-object-roundtrip-'));
  const filePath = path.join(directory, 'object-roundtrip.pptx');
  const objects = [
    { id: 'object-rectangle', type: 'rectangle', x: 10, y: 20, width: 25, height: 30, fill: '#F3EBDD', stroke: '#26364D', strokeWidth: 2, text: '', fontSize: 20, textColor: '#26364D', bold: false, rotation: 0 },
    { id: 'object-ellipse', type: 'ellipse', x: 45, y: 20, width: 18, height: 18, fill: '#DCEBFA', stroke: '#26364D', strokeWidth: 1, text: '', fontSize: 20, textColor: '#26364D', bold: false, rotation: 0 },
    { id: 'object-line', type: 'line', x: 12, y: 62, width: 42, height: 1, fill: null, stroke: '#9A5E20', strokeWidth: 2, text: '', fontSize: 20, textColor: '#26364D', bold: false, rotation: 0 },
    { id: 'object-text', type: 'text', x: 20, y: 75, width: 55, height: 12, fill: null, stroke: null, strokeWidth: 0, text: 'Quarterly results', fontSize: 26, textColor: '#202B3B', bold: true, rotation: 0 }
  ];
  try {
    await exportOfficeFile({
      kind: 'slides',
      themeId: 'paper',
      slides: [{ title: 'Native objects', body: 'Body copy', objects }]
    }, filePath);

    const reopened = await openOfficeFile(filePath);
    const imported = reopened.slides[0].objects;
    assert.deepEqual(imported.map(object => object.id), objects.map(object => object.id));
    assert.deepEqual(imported.map(object => object.type), objects.map(object => object.type));
    assert.equal(imported[0].fill, '#F3EBDD');
    assert.equal(imported[1].fill, '#DCEBFA');
    assert.equal(imported[2].stroke, '#9A5E20');
    assert.equal(imported[3].text, 'Quarterly results');
    assert.equal(imported[3].fontSize, 26);
    assert.equal(imported[3].bold, true);
    assert.ok(!reopened.slides[0].body.includes('Quarterly results'));
    assert.ok(Math.abs(imported[0].x - objects[0].x) < 0.01);
    assert.ok(Math.abs(imported[0].width - objects[0].width) < 0.01);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});


test('Decks exports embedded slide pictures as real PowerPoint picture objects', async () => {
  const JSZip = require('jszip');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'brightdesk-pptx-slide-picture-'));
  const filePath = path.join(directory, 'slide-picture.pptx');
  const imageData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==';
  try {
    await exportOfficeFile({
      kind: 'slides',
      slides: [{
        title: 'Picture slide',
        body: '',
        objects: [{
          id: 'object-picture',
          type: 'image',
          x: 10, y: 15, width: 40, height: 30,
          imageData, imageName: 'team-photo.png', imageWidth: 1, imageHeight: 1,
          fill: null, stroke: null, strokeWidth: 0,
          text: '', fontSize: 20, textColor: '#26364D', bold: false, rotation: 0
        }]
      }]
    }, filePath);

    const archive = await JSZip.loadAsync(await fs.readFile(filePath));
    const slideXml = await archive.file('ppt/slides/slide1.xml').async('string');
    const mediaName = Object.keys(archive.files).find(name => name.startsWith('ppt/media/') && name.endsWith('.png'));
    assert.match(slideXml, /<p:pic>/);
    assert.ok(mediaName, 'the PPTX contains a local PNG media part');
    assert.deepEqual(
      await archive.file(mediaName).async('nodebuffer'),
      Buffer.from(imageData.split(',')[1], 'base64')
    );
    const reopened = await openOfficeFile(filePath);
    assert.equal(reopened.slides[0].objects.length, 1);
    assert.equal(reopened.slides[0].objects[0].type, 'image');
    assert.ok(reopened.slides[0].objects[0].imageName.length > 0);
    assert.equal(reopened.slides[0].objects[0].imageWidth, 1);
    assert.equal(reopened.slides[0].objects[0].imageHeight, 1);
    assert.equal(reopened.slides[0].objects[0].imageData, imageData);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('Decks skips external and cropped PowerPoint picture relationships without fetching or altering them', async () => {
  const JSZip = require('jszip');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'brightdesk-pptx-picture-safety-'));
  const sourcePath = path.join(directory, 'source.pptx');
  const externalPath = path.join(directory, 'external.pptx');
  const croppedPath = path.join(directory, 'cropped.pptx');
  const imageData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==';
  try {
    await exportOfficeFile({
      kind: 'slides',
      slides: [{
        title: 'Picture safety',
        body: '',
        objects: [{
          id: 'object-picture',
          type: 'image',
          x: 10, y: 15, width: 40, height: 30,
          imageData, imageName: 'safe.png', imageWidth: 1, imageHeight: 1,
          fill: null, stroke: null, strokeWidth: 0,
          text: '', fontSize: 20, textColor: '#26364D', bold: false, rotation: 0
        }]
      }]
    }, sourcePath);

    const externalArchive = await JSZip.loadAsync(await fs.readFile(sourcePath));
    const relationshipName = 'ppt/slides/_rels/slide1.xml.rels';
    const relationshipXml = await externalArchive.file(relationshipName).async('string');
    const externalXml = relationshipXml.replace(
      /(<Relationship\\b(?=[^>]*\\bType=["'][^"']*\\/image["'])[^>]*?)\\sTarget=["'][^"']*["']/,
      '$1 Target="https://example.invalid/picture.png" TargetMode="External"'
    );
    assert.notEqual(externalXml, relationshipXml);
    externalArchive.file(relationshipName, externalXml);
    await fs.writeFile(externalPath, await externalArchive.generateAsync({ type: 'nodebuffer' }));
    const externalImport = await openOfficeFile(externalPath);
    assert.equal(externalImport.slides[0].objects?.length || 0, 0);

    const croppedArchive = await JSZip.loadAsync(await fs.readFile(sourcePath));
    const slideName = 'ppt/slides/slide1.xml';
    const slideXml = await croppedArchive.file(slideName).async('string');
    const croppedXml = slideXml.replace(/<a:srcRect\\s*\\/?\\s*>/, '<a:srcRect l="1000"/>');
    assert.notEqual(croppedXml, slideXml);
    croppedArchive.file(slideName, croppedXml);
    await fs.writeFile(croppedPath, await croppedArchive.generateAsync({ type: 'nodebuffer' }));
    const croppedImport = await openOfficeFile(croppedPath);
    assert.equal(croppedImport.slides[0].objects?.length || 0, 0);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('Decks preserves supported slide transitions across PowerPoint export and import', async () => {
  const JSZip = require('jszip');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'brightdesk-pptx-transition-roundtrip-'));
  const filePath = path.join(directory, 'transitions.pptx');
  try {
    await exportOfficeFile({
      kind: 'slides',
      slides: [
        { title: 'No transition', body: 'First', transition: 'none' },
        { title: 'Fade', body: 'Second', transition: 'fade' },
        { title: 'Push', body: 'Third', transition: 'push' },
        { title: 'Wipe', body: 'Fourth', transition: 'wipe' }
      ]
    }, filePath);

    const archive = await JSZip.loadAsync(await fs.readFile(filePath));
    const fadeXml = await archive.file('ppt/slides/slide2.xml').async('string');
    const pushXml = await archive.file('ppt/slides/slide3.xml').async('string');
    const wipeXml = await archive.file('ppt/slides/slide4.xml').async('string');
    assert.match(fadeXml, /<p:transition[^>]*>\s*<p:fade\s*\/?\s*>\s*<\/p:transition>/);
    assert.match(pushXml, /<p:transition[^>]*>\s*<p:push\b/);
    assert.match(wipeXml, /<p:transition[^>]*>\s*<p:wipe\b/);

    const reopened = await openOfficeFile(filePath);
    assert.deepEqual(reopened.slides.map(slide => slide.transition), ['none', 'fade', 'push', 'wipe']);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('Decks ignores unsupported PowerPoint transition names and defaults them to none', async () => {
  const JSZip = require('jszip');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'brightdesk-pptx-unknown-transition-'));
  const filePath = path.join(directory, 'unknown-transition.pptx');
  try {
    await exportOfficeFile({
      kind: 'slides',
      slides: [{ title: 'Transition', body: 'Content', transition: 'fade' }]
    }, filePath);

    const archive = await JSZip.loadAsync(await fs.readFile(filePath));
    const slideXml = await archive.file('ppt/slides/slide1.xml').async('string');
    archive.file('ppt/slides/slide1.xml', slideXml.replace(/<p:fade\s*\/?\s*>/, '<p:morph/>'));
    await fs.writeFile(filePath, await archive.generateAsync({ type: 'nodebuffer' }));

    const reopened = await openOfficeFile(filePath);
    assert.equal(reopened.slides[0].transition, 'none');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
