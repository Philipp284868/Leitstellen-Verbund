import { execFileSync } from "node:child_process";
execFileSync(
  process.execPath,
  [
    "node_modules/prettier/bin/prettier.cjs",
    "--check",
    "--cache",
    "--cache-location",
    ".tools/cache/prettier",
    "src/**/*.{ts,tsx,css}",
    "ops/**/*.mjs",
    "scripts/**/*.mjs",
    "tests/**/*.{ts,tsx,mjs}",
    "*.ts",
    "*.js",
    "index.html",
    ".github/workflows/*.yml",
  ],
  { stdio: "inherit", windowsHide: true },
);
