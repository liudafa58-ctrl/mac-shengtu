const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== "win32") {
    return;
  }

  const projectDir = context.packager.projectDir;
  const rcedit = path.join(projectDir, "node_modules", "electron-winstaller", "vendor", "rcedit.exe");
  const icon = path.join(projectDir, "build", "icon.ico");
  const exe = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const tempDir = path.join(os.tmpdir(), "wenrugou-icon-patch");
  const tempExe = path.join(tempDir, "app.exe");
  const tempIcon = path.join(tempDir, "icon.ico");

  fs.rmSync(tempDir, { force: true, recursive: true });
  fs.mkdirSync(tempDir, { recursive: true });
  fs.copyFileSync(exe, tempExe);
  fs.copyFileSync(icon, tempIcon);

  execFileSync(rcedit, [tempExe, "--set-icon", tempIcon]);
  fs.copyFileSync(tempExe, exe);
};
