const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  open: () => ipcRenderer.invoke('document:open'),
  save: (content, saveAs, format) => ipcRenderer.invoke('document:save', { content, saveAs, format }),
  newDocument: () => ipcRenderer.invoke('document:new'),
  image: () => ipcRenderer.invoke('document:image'),
  pdf: () => ipcRenderer.invoke('document:pdf'),
  dirty: value => ipcRenderer.send('document:dirty', value),
});
