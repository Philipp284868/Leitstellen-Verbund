import { spawn } from "node:child_process";
export async function runCommand(
  args,
  env = {},
  executable = process.execPath,
) {
  const started = performance.now();
  const code = await new Promise((done, reject) => {
    const child = spawn(executable, args, {
      stdio: "inherit",
      windowsHide: true,
      env: { ...process.env, ...env },
    });
    child.once("error", reject);
    child.once("exit", (code) => done(code));
  });
  if (code !== 0)
    throw Error("Prüfprozess scheiterte (" + code + "): " + args.join(" "));
  return { command: args, ms: Math.round(performance.now() - started) };
}
