// 게임 쪽에 파일 저장 기능만 열어 준다 (window.margraveFS)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('margraveFS', {
  get: key => ipcRenderer.sendSync('save:get', key),
  set: (key, text) => ipcRenderer.sendSync('save:set', key, text),
  remove: key => ipcRenderer.sendSync('save:remove', key),
  dir: () => ipcRenderer.sendSync('save:dir'),
  openDir: () => ipcRenderer.invoke('save:open'),
});
