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

test('PPTX export applies custom slide background colours and readable text contrast', async () => {
  const JSZip = require('jszip');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'brightdesk-pptx-custom-background-'));
  const cases = [
    { backgroundColor: '#202B3B', textColor: 'FFFFFF' },
    { backgroundColor: '#F3EBDD', textColor: '000000' }
  ];
  try {
    for (const item of cases) {
      const filePath = path.join(directory, item.backgroundColor.slice(1) + '.pptx');
      await exportOfficeFile({
        kind: 'slides',
        themeId: 'lavender',
        slides: [{
          title: 'Readable title',
          body: 'Readable body',
          layout: 'title',
          backgroundColor: item.backgroundColor
        }]
      }, filePath);
      const archive = await JSZip.loadAsync(await fs.readFile(filePath));
      const slideXml = await archive.file('ppt/slides/slide1.xml')?.async('string');
      assert.match(slideXml || '', new RegExp('val="' + item.backgroundColor.slice(1) + '"'));
      assert.ok((slideXml || '').includes(item.textColor), 'the title and body text should use a high-contrast colour');
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
