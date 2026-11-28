'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('brightdeskPresentation', {
  onPresentationUpdate(callback) {
    if (typeof callback !== 'function') throw new TypeError('A presentation update callback is required.');
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('presentation:update', listener);
    return () => ipcRenderer.removeListener('presentation:update', listener);
  }
});
