import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
const root = resolve("dist");
createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    if (!path.startsWith("/Leitstellen-Verbund/")) {
      res.writeHead(404);
      res.end();
      return;
    }
    path = path.slice("/Leitstellen-Verbund/".length) || "index.html";
    const file = resolve(root, path);
    if (!file.startsWith(root + "/") && !file.startsWith(root + "\\"))
      throw Error("Path");
    const mime = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
      ".svg": "image/svg+xml",
      ".webmanifest": "application/manifest+json",
    };
    res.setHeader(
      "Content-Type",
      mime[extname(file)] || "application/octet-stream",
    );
    res.setHeader("Cache-Control", "no-cache");
    res.end(await readFile(file));
  } catch {
    res.writeHead(404);
    res.end("Nicht gefunden");
  }
}).listen(4173, "127.0.0.1", () =>
  console.log("Local: http://127.0.0.1:4173/Leitstellen-Verbund/"),
);
