import { readFile, writeFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
const files = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon.svg",
  ...(await readdir("dist/assets")).map((f) => "./assets/" + f),
];
const version = createHash("sha256")
  .update(await readFile("dist/index.html"))
  .digest("hex")
  .slice(0, 12);
await writeFile(
  "dist/sw.js",
  `const PREFIX='leitstellen-verbund-'+encodeURIComponent(new URL(self.registration.scope).pathname)+'-';const NAME=PREFIX+'${version}';const FILES=${JSON.stringify(files)};self.addEventListener('install',e=>e.waitUntil(caches.open(NAME).then(c=>c.addAll(FILES))));self.addEventListener('message',e=>{if(e.data?.type==='ACTIVATE')self.skipWaiting()});self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==NAME).map(k=>caches.delete(k))))));self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==self.location.origin||!u.href.startsWith(self.registration.scope))return;e.respondWith(caches.open(NAME).then(async c=>await c.match(e.request)||fetch(e.request)));});`,
);
