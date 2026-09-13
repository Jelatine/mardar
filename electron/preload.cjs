const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  onHistory: callback => ipcRenderer.on('document:history', (_event, redo) => callback(redo)),
  recent: () => ipcRenderer.invoke('document:recent'),
  openRecent: file => ipcRenderer.invoke('document:open-recent', file),
  dismissPending: file => ipcRenderer.invoke('document:dismiss-pending', file),
  pending: () => ipcRenderer.invoke('document:pending'),
  openPending: file => ipcRenderer.invoke('document:open-pending', file),
  onOpenRequest: callback => ipcRenderer.on('document:requested', callback),
  about: () => ipcRenderer.invoke('app:about'),
  open: () => ipcRenderer.invoke('document:open'),
  save: (content, saveAs, format) => ipcRenderer.invoke('document:save', { content, saveAs, format }),
  newDocument: () => ipcRenderer.invoke('document:new'),
  image: () => ipcRenderer.invoke('document:image'),
  pdf: () => ipcRenderer.invoke('document:pdf'),
  dirty: value => ipcRenderer.send('document:dirty', value),
});
