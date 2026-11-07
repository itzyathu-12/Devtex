let electron = require("electron");
// src/preload/index.ts
electron.contextBridge.exposeInMainWorld("devtex", {
	openProject: () => electron.ipcRenderer.invoke("project:open"),
	getTree: (directory = "") => electron.ipcRenderer.invoke("project:tree", directory),
	getRoot: () => electron.ipcRenderer.invoke("project:root"),
	readFile: (filePath) => electron.ipcRenderer.invoke("file:read", filePath),
	writeFile: (filePath, content) => electron.ipcRenderer.invoke("file:write", filePath, content),
	create: (filePath, kind) => electron.ipcRenderer.invoke("file:create", filePath, kind)
});
