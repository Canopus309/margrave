// 데스크톱 앱 창. 게임 파일(index.html)을 그대로 띄우고, 저장은 문서\변경백 폴더에 한다.
const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const saveDir = () => path.join(app.getPath('documents'), '변경백');
// 저장 이름은 영문·숫자·_ 만 쓴다 (폴더 밖으로 나가는 이름 방지)
const fileOf = key => path.join(saveDir(), `${String(key).replace(/[^a-zA-Z0-9_]/g, '_')}.json`);

ipcMain.on('save:get', (ev, key) => {
  try { ev.returnValue = fs.readFileSync(fileOf(key), 'utf8'); } catch (e) { ev.returnValue = null; }
});
ipcMain.on('save:set', (ev, key, text) => {
  try {
    fs.mkdirSync(saveDir(), { recursive: true });
    // 쓰다가 꺼져도 저장이 깨지지 않게 임시 파일에 쓰고 바꿔 넣는다
    const f = fileOf(key), tmp = f + '.tmp';
    fs.writeFileSync(tmp, text, 'utf8');
    fs.renameSync(tmp, f);
    ev.returnValue = true;
  } catch (e) { ev.returnValue = false; }
});
ipcMain.on('save:remove', (ev, key) => {
  try { fs.rmSync(fileOf(key), { force: true }); ev.returnValue = true; } catch (e) { ev.returnValue = false; }
});
ipcMain.on('save:dir', ev => { ev.returnValue = saveDir(); });
ipcMain.handle('save:open', () => { fs.mkdirSync(saveDir(), { recursive: true }); return shell.openPath(saveDir()); });

function createWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1024, minHeight: 680,
    title: '변경백', backgroundColor: '#12151c', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, '..', 'index.html'));
  // F11 전체 화면, F12 개발자 도구
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') win.setFullScreen(!win.isFullScreen());
    if (input.key === 'F12') win.webContents.toggleDevTools();
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
