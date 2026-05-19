const { app, BrowserWindow, shell } = require("electron");
const net = require("node:net");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

app.setName("稳如狗生图工作台V1.0");

let mainWindow;

app.whenReady().then(async () => {
  const port = await findAvailablePort(8787);
  process.env.PORT = String(port);
  process.env.ELECTRON_DESKTOP = "1";

  await import(pathToFileURL(path.join(__dirname, "..", "dist-server", "index.js")).href);
  await waitForServer(port);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    title: "稳如狗生图工作台V1.0",
    icon: path.join(__dirname, "..", "build", "icon.ico"),
    backgroundColor: "#111613",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrl(url)) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isExternalUrl(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  await mainWindow.loadURL(`http://127.0.0.1:${port}/`);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0 && mainWindow) {
    mainWindow.show();
  }
});

function isExternalUrl(url) {
  return /^https?:\/\//i.test(url) && !url.startsWith("http://127.0.0.1:");
}

function findAvailablePort(startPort) {
  return new Promise((resolve) => {
    const tryPort = (port) => {
      const server = net.createServer();
      server.once("error", () => tryPort(port + 1));
      server.once("listening", () => {
        server.close(() => resolve(port));
      });
      server.listen(port, "127.0.0.1");
    };

    tryPort(startPort);
  });
}

async function waitForServer(port) {
  const url = `http://127.0.0.1:${port}/api/config`;
  const startedAt = Date.now();

  while (Date.now() - startedAt < 10000) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      await delay(150);
    }
  }

  throw new Error("Local app server did not start in time.");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
