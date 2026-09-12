import { createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { gzip } from "node:zlib";
import { promisify } from "node:util";
const compress = promisify(gzip);

/** Compression works through an unchanged reverse proxy; private offers never enter shared caches. */
export async function respondFacilities(
  req: IncomingMessage,
  res: ServerResponse,
  data: unknown,
  staticMap: boolean,
) {
  const payload = Buffer.from(JSON.stringify(data));
  res.setHeader("Vary", "Accept-Encoding");
  if (staticMap) {
    const etag = `W/"${createHash("sha256").update(payload).digest("base64url")}"`;
    res.setHeader("ETag", etag);
    res.setHeader("Cache-Control", "private, max-age=30");
    if (req.headers["if-none-match"] === etag) {
      res.writeHead(304);
      res.end();
      return;
    }
  }
  const gzipAccepted = (req.headers["accept-encoding"] || "")
    .split(",")
    .some((part) => {
      const [encoding, ...parameters] = part.trim().toLowerCase().split(";");
      const q = parameters.find((p) => p.trim().startsWith("q="));
      return encoding === "gzip" && (!q || Number(q.trim().slice(2)) > 0);
    });
  const compressed = gzipAccepted && payload.length >= 1024;
  const body = compressed ? await compress(payload, { level: 4 }) : payload;
  if (compressed) res.setHeader("Content-Encoding", "gzip");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Length", body.length);
  res.writeHead(200);
  res.end(body);
}
