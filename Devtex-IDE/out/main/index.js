// \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
let electron = require("electron");
let node_fs = require("node:fs");
let node_path = require("node:path");
node_path = __toESM(node_path);
let node_url = require("node:url");
// src/main/index.ts
var here = node_path.default.dirname((0, node_url.fileURLToPath)(require("url").pathToFileURL(__filename).href));
var rootPath = null;
var windowOptions = {
	width: 1480,
	height: 920,
	minWidth: 980,
	minHeight: 640,
	backgroundColor: "#080b10",
	webPreferences: {
		preload: node_path.default.join(here, "../preload/index.js"),
		contextIsolation: true,
		nodeIntegration: false,
		sandbox: true
	}
};
function isInsideRoot(target) {
	if (!rootPath) return false;
	const resolved = node_path.default.resolve(rootPath, target);
	return resolved === rootPath || resolved.startsWith(rootPath + node_path.default.sep);
}
function safePath(relativePath) {
	if (!rootPath || node_path.default.isAbsolute(relativePath)) throw new Error("No project is open or path is invalid.");
	const target = node_path.default.resolve(rootPath, relativePath);
	if (!isInsideRoot(target)) throw new Error("Path escapes the project directory.");
	return target;
}
async function readDirectory(relativePath = "") {
	const dir = relativePath ? safePath(relativePath) : rootPath;
	if (!dir) return [];
	return (await node_fs.promises.readdir(dir, { withFileTypes: true })).filter((e) => e.name !== "node_modules" && e.name !== ".git").sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name)).map((e) => ({
		name: e.name,
		path: relativePath ? relativePath + "/" + e.name : e.name,
		kind: e.isDirectory() ? "directory" : "file"
	}));
}
function createWindow() {
	const win = new electron.BrowserWindow(windowOptions);
	if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL);
	else win.loadFile(node_path.default.join(here, "../renderer/index.html"));
}
electron.ipcMain.handle("project:open", async () => {
	const picked = await electron.dialog.showOpenDialog({ properties: ["openDirectory"] });
	if (picked.canceled || !picked.filePaths[0]) return null;
	rootPath = picked.filePaths[0];
	return {
		name: node_path.default.basename(rootPath),
		files: await readDirectory()
	};
});
electron.ipcMain.handle("project:tree", async (_event, dir = "") => readDirectory(dir));
electron.ipcMain.handle("file:read", async (_event, relativePath) => node_fs.promises.readFile(safePath(relativePath), "utf8"));
electron.ipcMain.handle("file:write", async (_event, relativePath, content) => {
	const target = safePath(relativePath);
	await node_fs.promises.mkdir(node_path.default.dirname(target), { recursive: true });
	await node_fs.promises.writeFile(target, content, "utf8");
	return true;
});
electron.ipcMain.handle("file:create", async (_event, relativePath, kind) => {
	const target = safePath(relativePath);
	if (kind === "directory") await node_fs.promises.mkdir(target, { recursive: true });
	else {
		await node_fs.promises.mkdir(node_path.default.dirname(target), { recursive: true });
		await node_fs.promises.writeFile(target, "", { flag: "wx" });
	}
	return readDirectory(node_path.default.posix.dirname(relativePath) === "." ? "" : node_path.default.posix.dirname(relativePath));
});
electron.ipcMain.handle("project:root", () => rootPath);
electron.app.whenReady().then(() => {
	createWindow();
	electron.app.on("activate", () => {
		if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});
electron.app.on("window-all-closed", () => {
	if (process.platform !== "darwin") electron.app.quit();
});
