const { app, BrowserWindow, Menu, ipcMain, dialog, screen, nativeImage } = require('electron');
const packageConfig = require('../package.json');
const { APP_SLUGS } = require('./standalone-downloads');
const path = require('node:path');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const { openOfficeFile, exportOfficeFile, cleanFileName, ensureExtension } = require('./file-service');
const { MAX_SLIDE_IMAGE_BYTES, createSlideImageDataUrl, inspectSlideImageDataUrl } = require('./slide-image-service');
const { BUILTIN_LANGUAGES, validateLanguagePack, getBuiltinLanguage } = require('./language-service');
const { DictionaryService } = require('./dictionary-service');
let mainWindow;
let agreementWindow;
let presenterWindow;
let presenterWindowReady = false;
let presenterState = null;
let presenterDisplayId = null;
let termsAccepted = false;
let autoUpdater;
const updatePublishingConfigured = Array.isArray(packageConfig.build?.publish) && packageConfig.build.publish.some(item => item?.provider === 'github' && item?.owner && item.owner !== 'YOUR_GITHUB_ACCOUNT');
let updateCheckInProgress = false;
let lastUpdateCheckAt = 0;
let dictionaryService;
const standaloneAppNames = {
  pages: 'Pages', sheets: 'Sheets', slides: 'Decks', notes: 'Notes',
  database: 'Database', forms: 'Forms', lists: 'Lists', planner: 'Planner',
  todo: 'To Do', loop: 'Workspace'
};
const supportedStandaloneApps = new Set(Object.keys(APP_SLUGS));
const standaloneAppId = packageConfig.brightdeskAppId || null;
if (standaloneAppId && !supportedStandaloneApps.has(standaloneAppId)) {
  throw new Error(`Unsupported Brightdesk standalone app: ${standaloneAppId}`);
}

function sendUpdateState(state) { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('updates:state', state); }
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 920, minWidth: 980, minHeight: 680,
    title: standaloneAppId ? `Brightdesk ${standaloneAppNames[standaloneAppId]}` : 'Brightdesk', backgroundColor: '#f5f6fa',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, additionalArguments: standaloneAppId ? [`--brightdesk-app=${standaloneAppId}`] : [] }
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', event => event.preventDefault());
  mainWindow.on('focus', () => { if (autoUpdater) checkForUpdates({ quiet: true }); });
  mainWindow.on('closed', () => {
    closePresenterWindow();
    mainWindow = null;
  });
}
function senderIsMain(event) { return mainWindow && event.sender === mainWindow.webContents; }

const SLIDE_PICTURE_ASSET_ID_PATTERN = /^picture-[a-f0-9-]{36}\.(?:png|jpg|webp)$/i;

function getSlidePictureAssetPath(assetId) {
  if (typeof assetId !== 'string' || !SLIDE_PICTURE_ASSET_ID_PATTERN.test(assetId)) {
    throw new TypeError('The saved picture reference is invalid.');
  }
  return path.join(app.getPath('userData'), 'slide-images', assetId);
}

function assertSlidePictureDimensions(imageInfo) {
  if (
    !imageInfo ||
    imageInfo.width < 1 || imageInfo.height < 1 ||
    imageInfo.width > 20000 || imageInfo.height > 20000 ||
    imageInfo.width * imageInfo.height > 40000000
  ) {
    throw new Error('This picture exceeds the supported image dimensions.');
  }
}

async function storeSlidePictureAsset(imageData) {
  const imageInfo = inspectSlideImageDataUrl(imageData);
  assertSlidePictureDimensions(imageInfo);
  const extension = imageInfo.mimeType === 'image/jpeg'
    ? 'jpg'
    : imageInfo.mimeType === 'image/webp' ? 'webp' : 'png';
  const assetId = 'picture-' + crypto.randomUUID() + '.' + extension;
  const assetPath = getSlidePictureAssetPath(assetId);
  await fs.mkdir(path.dirname(assetPath), { recursive: true });
  await fs.writeFile(assetPath, imageInfo.buffer, { flag: 'wx' });
  return assetId;
}

async function loadSlidePictureAsset(assetId) {
  const assetPath = getSlidePictureAssetPath(assetId);
  const buffer = await fs.readFile(assetPath);
  if (buffer.length > MAX_SLIDE_IMAGE_BYTES) {
    throw new Error('The locally saved picture exceeds the supported size.');
  }
  const imageData = createSlideImageDataUrl(buffer);
  const imageInfo = inspectSlideImageDataUrl(imageData);
  assertSlidePictureDimensions(imageInfo);
  const image = nativeImage.createFromBuffer(buffer);
  if (image.isEmpty()) throw new Error('Brightdesk could not read a locally saved picture.');
  const decoded = image.getSize();
  if (decoded.width !== imageInfo.width || decoded.height !== imageInfo.height) {
    throw new Error('The locally saved picture failed its dimension check.');
  }
  return imageData;
}

async function prepareProjectSlidePictures(value) {
  if (!value || typeof value !== 'object') return value;
  const docs = value.docs && typeof value.docs === 'object'
    ? Object.values(value.docs)
    : [value];
  for (const doc of docs) {
    if (!doc || !Array.isArray(doc.slides)) continue;
    for (const slide of doc.slides) {
      if (!Array.isArray(slide?.objects)) continue;
      for (const object of slide.objects) {
        if (object?.type !== 'image') continue;
        const imageInfo = inspectSlideImageDataUrl(object.imageData);
        assertSlidePictureDimensions(imageInfo);
        if (object.imageWidth !== imageInfo.width || object.imageHeight !== imageInfo.height) {
          throw new Error('A saved slide picture has mismatched pixel dimensions.');
        }
        object.imageAssetId = await storeSlidePictureAsset(object.imageData);
      }
    }
  }
  return value;
}

const supportedPresenterLayouts = new Set(['title', 'title-content', 'two-content', 'section-header']);
const supportedPresenterThemes = new Set(['lavender', 'midnight', 'paper']);
const supportedPresenterTransitions = new Set(['none', 'fade', 'push', 'wipe']);
const supportedPresenterObjects = new Set(['text', 'rectangle', 'ellipse', 'line', 'image']);
const MAX_PRESENTER_SLIDE_IMAGE_BYTES = 15 * 1024 * 1024;
const presenterColourPattern = /^#[0-9A-F]{6}$/i;

function normalizePresenterObjects(objects) {
  if (!Array.isArray(objects)) return [];
  const normalized = [];
  let totalImageBytes = 0;
  for (const source of objects.slice(0, 500)) {
    if (!source || typeof source !== 'object' || Array.isArray(source) || !supportedPresenterObjects.has(source.type)) continue;
    const { x, y, width, height } = source;
    if (![x, y, width, height].every(value => typeof value === 'number' && Number.isFinite(value))) continue;
    if (x < 0 || y < 0 || width <= 0 || height <= 0 || width > 100 || height > 100 || x + width > 100 || y + height > 100) continue;
    const imageInfo = source.type === 'image' ? inspectSlideImageDataUrl(source.imageData) : null;
    if (source.type === 'image' && (
      !imageInfo ||
      source.imageWidth !== imageInfo.width ||
      source.imageHeight !== imageInfo.height ||
      typeof source.imageName !== 'string' || !source.imageName.trim() || source.imageName.length > 255 ||
      !Number.isInteger(source.imageWidth) || source.imageWidth < 1 || source.imageWidth > 20000 ||
      !Number.isInteger(source.imageHeight) || source.imageHeight < 1 || source.imageHeight > 20000 ||
      source.imageWidth * source.imageHeight > 40000000 ||
      totalImageBytes + imageInfo.byteLength > MAX_PRESENTER_SLIDE_IMAGE_BYTES
    )) continue;
    if (imageInfo) totalImageBytes += imageInfo.byteLength;
    const fill = source.fill === null ? null : (typeof source.fill === 'string' && presenterColourPattern.test(source.fill) ? source.fill.toUpperCase() : null);
    const stroke = typeof source.stroke === 'string' && presenterColourPattern.test(source.stroke) ? source.stroke.toUpperCase() : null;
    const textColor = typeof source.textColor === 'string' && presenterColourPattern.test(source.textColor) ? source.textColor.toUpperCase() : '#26364D';
    const strokeWidth = typeof source.strokeWidth === 'number' && Number.isFinite(source.strokeWidth) ? Math.max(0, Math.min(12, source.strokeWidth)) : 1;
    const fontSize = typeof source.fontSize === 'number' && Number.isFinite(source.fontSize) ? Math.max(8, Math.min(96, source.fontSize)) : 20;
    const rotation = typeof source.rotation === 'number' && Number.isFinite(source.rotation) ? Math.max(-360, Math.min(360, source.rotation)) : 0;
    normalized.push({
      type: source.type,
      x, y, width, height,
      fill, stroke, textColor, strokeWidth, fontSize, rotation,
      text: typeof source.text === 'string' ? source.text.slice(0, 10000) : '',
      bold: source.bold === true,
      ...(imageInfo ? {
        imageData: source.imageData,
        imageName: source.imageName,
        imageWidth: source.imageWidth,
        imageHeight: source.imageHeight
      } : {})
    });
  }
  return normalized;
}

function normalizePresenterState(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TypeError('A presentation slide is required.');
  }
  const slide = payload.slide;
  if (!slide || typeof slide !== 'object' || Array.isArray(slide)) {
    throw new TypeError('The audience slide is invalid.');
  }
  const layout = supportedPresenterLayouts.has(slide.layout) ? slide.layout : 'title-content';
  const transition = supportedPresenterTransitions.has(slide.transition) ? slide.transition : 'none';
  const themeId = supportedPresenterThemes.has(payload.themeId) ? payload.themeId : 'lavender';
  const slideSize = payload.slideSize === 'standard' ? 'standard' : 'widescreen';
  const blankMode = payload.blankMode === 'black' || payload.blankMode === 'white' ? payload.blankMode : null;
  return {
    slide: {
      id: typeof slide.id === 'string' ? slide.id.slice(0, 100) : '',
      transition,
      title: typeof slide.title === 'string' ? slide.title.slice(0, 2000) : '',
      body: typeof slide.body === 'string' ? slide.body.slice(0, 30000) : '',
      bodySecondary: typeof slide.bodySecondary === 'string' ? slide.bodySecondary.slice(0, 30000) : '',
      layout,
      ...(typeof slide.backgroundColor === 'string' && presenterColourPattern.test(slide.backgroundColor)
        ? { backgroundColor: slide.backgroundColor.toUpperCase() }
        : {}),
      objects: normalizePresenterObjects(slide.objects)
    },
    themeId,
    slideSize,
    blankMode
  };
}

function closePresenterWindow() {
  presenterState = null;
  presenterWindowReady = false;
  presenterDisplayId = null;
  if (presenterWindow && !presenterWindow.isDestroyed()) presenterWindow.close();
  presenterWindow = null;
}

function createPresenterWindow(display, initialState) {
  presenterState = initialState;
  presenterWindowReady = false;
  const audienceWindow = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    title: 'Brightdesk Decks — Presentation',
    frame: false,
    autoHideMenuBar: true,
    show: false,
    fullscreen: true,
    backgroundColor: '#171729',
    webPreferences: {
      preload: path.join(__dirname, 'presentation-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  presenterWindow = audienceWindow;
  presenterDisplayId = display.id;
  audienceWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  audienceWindow.webContents.on('will-navigate', event => event.preventDefault());
  audienceWindow.webContents.once('did-finish-load', () => {
    if (presenterWindow !== audienceWindow || audienceWindow.isDestroyed()) return;
    presenterWindowReady = true;
    audienceWindow.webContents.send('presentation:update', presenterState);
    audienceWindow.showInactive();
  });
  audienceWindow.on('closed', () => {
    if (presenterWindow !== audienceWindow) return;
    presenterWindow = null;
    presenterWindowReady = false;
    presenterState = null;
    presenterDisplayId = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('presentation:display-lost');
    }
  });
  audienceWindow.loadFile(path.join(__dirname, 'presentation.html')).catch(error => {
    console.error('The audience presentation window could not be loaded.', error);
    if (presenterWindow === audienceWindow) {
      closePresenterWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('presentation:display-lost');
      }
    }
  });
  return audienceWindow;
}

function termsFilePath() { return path.join(app.getAppPath(), 'TERMS_AND_CONDITIONS.txt'); }
async function readTerms() { return fs.readFile(termsFilePath(), 'utf8'); }
async function hasCurrentTermsAcceptance() {
  try {
    const [terms, record] = await Promise.all([
      readTerms(),
      fs.readFile(path.join(app.getPath('userData'), 'terms-acceptance.json'), 'utf8').then(JSON.parse)
    ]);
    const digest = crypto.createHash('sha256').update(terms).digest('hex');
    return record?.termsSha256 === digest && record?.accepted === true;
  } catch { return false; }
}
function createAgreementWindow() {
  agreementWindow = new BrowserWindow({
    width: 780, height: 820, minWidth: 620, minHeight: 620,
    title: 'Brightdesk Terms and Conditions',
    resizable: true, minimizable: false, maximizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'terms-preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true
    }
  });
  agreementWindow.loadFile(path.join(__dirname, 'terms.html'));
  agreementWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  agreementWindow.webContents.on('will-navigate', event => event.preventDefault());
  agreementWindow.on('closed', () => {
    agreementWindow = null;
    if (!termsAccepted) app.quit();
  });
}
function acceptTermsAndContinue() {
  if (!agreementWindow) return;
  termsAccepted = true;
  agreementWindow.close();
  createWindow();
  initUpdater();
}
ipcMain.handle('terms:get-text', async event => {
  if (!agreementWindow || event.sender !== agreementWindow.webContents) throw new Error('Invalid terms window.');
  return readTerms();
});
ipcMain.handle('terms:accept', async event => {
  if (!agreementWindow || event.sender !== agreementWindow.webContents) throw new Error('Invalid terms window.');
  const terms = await readTerms();
  const termsSha256 = crypto.createHash('sha256').update(terms).digest('hex');
  const record = { accepted: true, termsVersion: '1.0', termsSha256, acceptedAt: new Date().toISOString(), appVersion: app.getVersion() };
  await fs.mkdir(app.getPath('userData'), { recursive: true });
  await fs.writeFile(path.join(app.getPath('userData'), 'terms-acceptance.json'), `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  acceptTermsAndContinue();
  return { ok: true };
});
ipcMain.handle('terms:decline', event => {
  if (!agreementWindow || event.sender !== agreementWindow.webContents) throw new Error('Invalid terms window.');
  termsAccepted = false;
  app.quit();
  return { ok: true };
});
ipcMain.handle('app:version', event => { if (!senderIsMain(event)) throw new Error('Invalid sender.'); return app.getVersion(); });

ipcMain.handle('presentation:start', async (event, payload) => {
  if (!senderIsMain(event)) throw new Error('Invalid sender.');
  const nextState = normalizePresenterState(payload);
  const displays = screen.getAllDisplays();
  const primaryDisplay = screen.getPrimaryDisplay();
  const externalDisplay = displays.find(display => display.id !== primaryDisplay.id);
  if (!externalDisplay) return { ok: false, reason: 'external-display-required' };

  if (presenterWindow && !presenterWindow.isDestroyed()) {
    presenterState = nextState;
    if (presenterWindowReady) presenterWindow.webContents.send('presentation:update', presenterState);
  } else {
    createPresenterWindow(externalDisplay, nextState);
  }
  return {
    ok: true,
    display: {
      id: externalDisplay.id,
      label: typeof externalDisplay.label === 'string' ? externalDisplay.label : '',
      bounds: { ...externalDisplay.bounds }
    }
  };
});
ipcMain.on('presentation:update', (event, payload) => {
  if (!senderIsMain(event) || !presenterWindow || presenterWindow.isDestroyed()) return;
  try {
    presenterState = normalizePresenterState(payload);
    if (presenterWindowReady) presenterWindow.webContents.send('presentation:update', presenterState);
  } catch (error) {
    console.warn('Ignored an invalid audience presentation update.', error.message);
  }
});
ipcMain.handle('presentation:end', event => {
  if (!senderIsMain(event)) throw new Error('Invalid sender.');
  closePresenterWindow();
  return { ok: true };
});

screen.on('display-removed', (_event, display) => {
  if (!presenterWindow || presenterDisplayId !== display.id) return;
  closePresenterWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('presentation:display-lost');
  }
});



function languagePackDirectory() {
  return path.join(app.getPath('userData'), 'language-packs');
}

async function readBundledLanguagePack(code) {
  const metadata = getBuiltinLanguage(code);
  if (!metadata) throw new Error('That language is not in the protected Brightdesk language catalogue.');
  const source = path.join(__dirname, 'languages', metadata.file);
  const pack = validateLanguagePack(JSON.parse(await fs.readFile(source, 'utf8')));
  if (pack.code !== metadata.code) throw new Error('The bundled language pack does not match its protected catalogue entry.');
  return { pack, bytes: await fs.readFile(source) };
}

async function ensureLanguagePackDirectory() {
  const directory = languagePackDirectory();
  await fs.mkdir(directory, { recursive: true });
  const defaultPath = path.join(directory, 'en-AU.json');
  const { pack, bytes } = await readBundledLanguagePack('en-AU');
  try {
    const existing = await fs.readFile(defaultPath);
    if (!crypto.timingSafeEqual(crypto.createHash('sha256').update(existing).digest(), crypto.createHash('sha256').update(bytes).digest())) {
      throw new Error('The installed default language pack has been changed. Brightdesk will not replace or accept modified language resources. Reinstall the official application package to restore it.');
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await fs.writeFile(defaultPath, bytes, { flag: 'wx', mode: 0o444 });
  }
  await fs.chmod(defaultPath, 0o444).catch(() => {});
  return directory;
}

async function readInstalledLanguagePacks() {
  const directory = await ensureLanguagePackDirectory();
  const packs = [];
  for (const metadata of BUILTIN_LANGUAGES) {
    const filename = `${metadata.code}.json`;
    const target = path.join(directory, filename);
    try {
      const [installedBytes, bundled] = await Promise.all([fs.readFile(target), readBundledLanguagePack(metadata.code)]);
      const actualHash = crypto.createHash('sha256').update(installedBytes).digest();
      const bundledHash = crypto.createHash('sha256').update(bundled.bytes).digest();
      if (!crypto.timingSafeEqual(actualHash, bundledHash)) {
        console.warn(`Ignoring modified language pack ${metadata.code}; only unmodified Brightdesk catalogue resources are accepted.`);
        continue;
      }
      packs.push(bundled.pack);
      await fs.chmod(target, 0o444).catch(() => {});
    } catch (error) {
      if (error.code !== 'ENOENT') console.warn(`Skipping language pack ${metadata.code}: ${error.message}`);
    }
  }
  if (!packs.some(pack => pack.code === 'en-AU')) throw new Error('The protected default English language pack is missing or has been modified.');
  return packs;
}

ipcMain.handle('languages:list', async event => {
  if (!senderIsMain(event)) throw new Error('Invalid sender.');
  const installed = await readInstalledLanguagePacks();
  const builtIn = BUILTIN_LANGUAGES.map(({ code, name, nativeName, proofingCode, isDefault }) => ({ code, name, nativeName, proofingCode, isDefault }));
  const session = mainWindow.webContents.session;
  return {
    available: builtIn,
    installed,
    spellCheckerLanguages: process.platform === 'darwin' ? [] : (session.availableSpellCheckerLanguages || []),
    usesNativeMacSpellChecker: process.platform === 'darwin'
  };
});

ipcMain.handle('languages:install', async (event, code) => {
  if (!senderIsMain(event)) throw new Error('Invalid sender.');
  const metadata = getBuiltinLanguage(code);
  if (!metadata) throw new Error('That language is not in the protected Brightdesk language catalogue.');
  const { pack, bytes } = await readBundledLanguagePack(code);
  const directory = await ensureLanguagePackDirectory();
  const destination = path.join(directory, `${pack.code}.json`);
  try {
    const existing = await fs.readFile(destination);
    const existingHash = crypto.createHash('sha256').update(existing).digest();
    const bundledHash = crypto.createHash('sha256').update(bytes).digest();
    if (!crypto.timingSafeEqual(existingHash, bundledHash)) throw new Error('An installed language pack has been modified. Brightdesk will not overwrite it. Reinstall the official application package to restore the protected resource.');
    return { ok: true, code: pack.code, alreadyInstalled: true };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await fs.writeFile(destination, bytes, { flag: 'wx', mode: 0o444 });
  await fs.chmod(destination, 0o444).catch(() => {});
  return { ok: true, code: pack.code };
});

ipcMain.handle('languages:set-proofing', async (event, code) => {
  if (!senderIsMain(event)) throw new Error('Invalid sender.');
  const packs = await readInstalledLanguagePacks();
  const pack = packs.find(item => item.code === code || (item.proofingCode && item.proofingCode === code));
  if (!pack) throw new Error('Install this language pack before selecting it for proofing.');
  if (process.platform === 'darwin') return { ok: true, usesNativeMacSpellChecker: true, supported: true };
  const session = mainWindow.webContents.session;
  const proofingCode = pack.proofingCode || pack.code;
  const available = session.availableSpellCheckerLanguages || [];
  if (!available.includes(proofingCode)) return { ok: false, supported: false, available };
  session.setSpellCheckerLanguages([proofingCode]);
  return { ok: true, supported: true, code: proofingCode };
});

ipcMain.handle('dictionaries:list', async event => {
  if (!senderIsMain(event)) throw new Error('Invalid sender.');
  return dictionaryService.installed();
});

ipcMain.handle('dictionaries:catalog', async event => {
  if (!senderIsMain(event)) throw new Error('Invalid sender.');
  const [installed, catalogue] = await Promise.all([dictionaryService.installed(), Promise.resolve(dictionaryService.catalogue())]);
  const installedCodes = new Set(installed.map(item => item.locale.toLowerCase()));
  return catalogue.map(item => ({ ...item, installed: installedCodes.has(item.locale.toLowerCase()) }));
});


ipcMain.handle('dictionaries:check', async (event, payload) => {
  if (!senderIsMain(event)) throw new Error('Invalid sender.');
  if (!payload || typeof payload.locale !== 'string' || typeof payload.text !== 'string') throw new Error('A dictionary language and document text are required.');
  return dictionaryService.checkText(payload.locale, payload.text);
});

async function checkForUpdates({ quiet = false, force = false } = {}) {
  if (!updatePublishingConfigured) return { ok: false, message: 'Automatic updates will be available after the Brightdesk GitHub release repository is configured.' };
  if (!autoUpdater) return { ok: false, message: 'The update service is not configured for this build yet.' };
  const now = Date.now();
  if (updateCheckInProgress) return { ok: true, message: 'An update check is already running.' };
  if (!force && now - lastUpdateCheckAt < 5 * 60 * 1000) return { ok: true, message: 'The update service checked recently.' };
  updateCheckInProgress = true; lastUpdateCheckAt = now;
  try { await autoUpdater.checkForUpdates(); return { ok: true }; }
  catch (error) {
    if (!quiet) sendUpdateState({ status: 'error', message: error.message || 'Could not check for updates.' });
    return { ok: false, message: error.message || 'Could not check for updates.' };
  } finally { updateCheckInProgress = false; }
}
function initUpdater() {
  if (!app.isPackaged) return;
  if (!updatePublishingConfigured) {
    sendUpdateState({ status: 'unavailable', message: 'Automatic updates are not configured for this build yet.' });
    return;
  }
  if (process.platform === 'linux' && !process.env.APPIMAGE) {
    sendUpdateState({ status: 'external', message: 'For .deb installs, update Brightdesk with your Linux package manager or install the latest .deb.' });
    return;
  }
  try {
    ({ autoUpdater } = require('electron-updater'));
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowUnverifiedLinuxPackages = false;
    autoUpdater.on('checking-for-update', () => sendUpdateState({ status: 'checking', message: 'Checking for updates…' }));
    autoUpdater.on('update-available', info => sendUpdateState({ status: 'available', message: `Brightdesk ${info.version} is available. Downloading the suite and changed app modules automatically…` }));
    autoUpdater.on('update-not-available', () => sendUpdateState({ status: 'current', message: 'Brightdesk is up to date.' }));
    autoUpdater.on('download-progress', p => sendUpdateState({ status: 'downloading', message: `Downloading update: ${Math.round(p.percent)}%` }));
    autoUpdater.on('update-downloaded', info => sendUpdateState({ status: 'downloaded', message: `Brightdesk ${info.version} and its updated app modules are ready. Restart to apply the update.` }));
    autoUpdater.on('error', err => sendUpdateState({ status: 'error', message: err.message || 'Update check failed.' }));
    /* The suite installer contains the app modules. A suite release updates the shell and every changed module together. */
    setTimeout(() => checkForUpdates({ quiet: true, force: true }), 12000);
    setInterval(() => checkForUpdates({ quiet: true, force: true }), 6 * 60 * 60 * 1000);
  } catch (error) { sendUpdateState({ status: 'unavailable', message: 'Update service is not configured in this build.' }); }
}

ipcMain.handle('file:open', async event => {
  if (!senderIsMain(event)) throw new Error('Invalid sender.');
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Office files', extensions: ['docx','xlsx','xlsm','csv','tsv','pptx','txt','md','html','bdesk'] }, { name: 'All files', extensions: ['*'] }]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const opened = await openOfficeFile(result.filePaths[0]);
  return prepareProjectSlidePictures(opened);
});
ipcMain.handle('slides:picture:open', async event => {
  if (!senderIsMain(event)) throw new Error('Invalid sender.');
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Pictures', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
  });
  if (result.canceled || !result.filePaths[0]) return null;

  const filePath = result.filePaths[0];
  const buffer = await fs.readFile(filePath);
  if (buffer.length > MAX_SLIDE_IMAGE_BYTES) {
    throw new Error('Choose a picture no larger than 5 MB.');
  }
  const imageData = createSlideImageDataUrl(buffer);
  const inspected = inspectSlideImageDataUrl(imageData);
  if (
    !inspected || inspected.width < 1 || inspected.height < 1 ||
    inspected.width > 20000 || inspected.height > 20000 ||
    inspected.width * inspected.height > 40000000
  ) {
    throw new Error('This picture exceeds the supported image dimensions.');
  }

  const image = nativeImage.createFromBuffer(buffer);
  if (image.isEmpty()) throw new Error('Brightdesk could not read this picture file.');
  const { width, height } = image.getSize();
  if (width !== inspected.width || height !== inspected.height) {
    throw new Error('Brightdesk could not verify this picture’s dimensions.');
  }
  if (
    !Number.isInteger(width) || !Number.isInteger(height) ||
    width < 1 || height < 1 || width > 20000 || height > 20000 ||
    width * height > 40000000
  ) {
    throw new Error('This picture exceeds the supported image dimensions.');
  }
  return {
    imageData,
    imageName: path.basename(filePath).slice(0, 255),
    imageWidth: width,
    imageHeight: height
  };
});
ipcMain.handle('slides:picture:store', async (event, imageData) => {
  if (!senderIsMain(event)) throw new Error('Invalid sender.');
  return storeSlidePictureAsset(imageData);
});
ipcMain.handle('slides:picture:load', async (event, assetId) => {
  if (!senderIsMain(event)) throw new Error('Invalid sender.');
  return loadSlidePictureAsset(assetId);
});
ipcMain.handle('slides:reuse', async event => {
  if (!senderIsMain(event)) throw new Error('Invalid sender.');
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'PowerPoint presentations', extensions: ['pptx'] }]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const imported = await openOfficeFile(result.filePaths[0]);
  if (imported?.kind !== 'slides' || !Array.isArray(imported.slides)) {
    throw new Error('Choose a valid PowerPoint presentation to reuse slides.');
  }
  return imported;
});
ipcMain.handle('file:export', async (event, payload) => {
  if (!senderIsMain(event)) throw new Error('Invalid sender.');
  if (!payload || !['pages','sheets','slides','notes'].includes(payload.kind)) throw new Error('Unsupported export request.');
  const filters = {
    pages: [{ name: 'DOCX document', extensions: ['docx'] }, { name: 'HTML', extensions: ['html'] }],
    sheets: [{ name: 'XLSX workbook', extensions: ['xlsx'] }, { name: 'CSV', extensions: ['csv'] }],
    slides: [{ name: 'PPTX presentation', extensions: ['pptx'] }],
    notes: [{ name: 'Markdown', extensions: ['md'] }, { name: 'Text', extensions: ['txt'] }]
  }[payload.kind];
  const result = await dialog.showSaveDialog(mainWindow, { defaultPath: cleanFileName(payload.title), filters });
  if (result.canceled || !result.filePath) return { canceled: true };
  const filePath = ensureExtension(result.filePath, filters[0]?.extensions?.[0]);
  await exportOfficeFile(payload, filePath);
  return { canceled: false, filePath };
});
ipcMain.handle('project:save', async (event, project) => {
  if (!senderIsMain(event)) throw new Error('Invalid sender.');
  const result = await dialog.showSaveDialog(mainWindow, { defaultPath: cleanFileName(project?.title || 'Brightdesk project') + '.bdesk', filters: [{ name: 'Brightdesk project', extensions: ['bdesk'] }] });
  if (result.canceled || !result.filePath) return { canceled: true };
  const filePath = ensureExtension(result.filePath, 'bdesk');
  await exportOfficeFile({ project }, filePath); return { canceled: false, filePath };
});
ipcMain.handle('project:open', async event => {
  if (!senderIsMain(event)) throw new Error('Invalid sender.');
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], filters: [{ name: 'Brightdesk project', extensions: ['bdesk'] }] });
  if (result.canceled || !result.filePaths[0]) return null;
  const opened = await openOfficeFile(result.filePaths[0]);
  return prepareProjectSlidePictures(opened);
});
ipcMain.handle('file:pdf', async (event, payload) => {
  if (!senderIsMain(event)) throw new Error('Invalid sender.');
  const result = await dialog.showSaveDialog(mainWindow, { defaultPath: cleanFileName(payload?.title || 'Brightdesk document') + '.pdf', filters: [{ name: 'PDF document', extensions: ['pdf'] }] });
  if (result.canceled || !result.filePath) return { canceled: true };
  const filePath = ensureExtension(result.filePath, 'pdf');
  const pdf = await mainWindow.webContents.printToPDF({ printBackground: true, pageSize: 'A4', margins: { top: 0.55, bottom: 0.55, left: 0.6, right: 0.6 } });
  await fs.writeFile(filePath, pdf); return { canceled: false, filePath };
});
ipcMain.handle('updates:check', async event => { if (!senderIsMain(event)) throw new Error('Invalid sender.'); return checkForUpdates({ force: true }); });
ipcMain.handle('updates:download', async event => { if (!senderIsMain(event)) throw new Error('Invalid sender.'); if (!autoUpdater) return { ok: false }; await autoUpdater.downloadUpdate(); return { ok: true }; });
ipcMain.handle('updates:install', async event => { if (!senderIsMain(event)) throw new Error('Invalid sender.'); if (!autoUpdater) return { ok: false }; autoUpdater.quitAndInstall(); return { ok: true }; });

app.whenReady().then(async () => { app.setName(packageConfig.productName || 'Brightdesk'); dictionaryService = new DictionaryService(app.getPath('userData')); Menu.setApplicationMenu(null); termsAccepted = await hasCurrentTermsAcceptance(); if (termsAccepted) { createWindow(); initUpdater(); } else { createAgreementWindow(); } app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) { if (termsAccepted) createWindow(); else createAgreementWindow(); } }); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
