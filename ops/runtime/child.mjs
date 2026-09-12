import { spawn } from "node:child_process";
export function execute(file, args, options = {}) {
  return new Promise((done, reject) => {
    const child = spawn(process.execPath, [file, ...args], {
      ...options,
      windowsHide: true,
      stdio: "inherit",
      shell: false,
    });
    const stop = () => child.kill("SIGTERM");
    process.once("SIGTERM", stop);
    process.once("SIGINT", stop);
    const cleanup = () => {
      process.removeListener("SIGTERM", stop);
      process.removeListener("SIGINT", stop);
    };
    child.once("error", (e) => {
      cleanup();
      reject(e);
    });
    child.once("exit", (code) => {
      cleanup();
      if (code === 0) done();
      else reject(Error("Betriebsschritt fehlgeschlagen: " + code));
    });
  });
}
