import { readFileSync } from "node:fs";
// Test-copy-only transport: the unchanged installer still validates its pinned
// catalog, compressed bytes and final files. Production never imports this file.
const transfers = JSON.parse(
  readFileSync(process.env.LV_TEST_TRANSFERS, "utf8"),
);
const original = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const file = transfers[String(input)];
  if (file)
    return Promise.resolve(
      new Response(readFileSync(file), {
        headers: { "Content-Length": String(readFileSync(file).length) },
      }),
    );
  return original(input, options);
};
