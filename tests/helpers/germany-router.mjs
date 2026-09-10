import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const runtimeIdentity = JSON.parse(
  readFileSync(
    new URL("../fixtures/germany-graph-runtime.json", import.meta.url),
    "utf8",
  ),
);
let mode = "normal";
let requests = 0;
const radians = Math.PI / 180;
const meters = (a, b) => {
  const dlat = (b[1] - a[1]) * radians,
    dlon = (b[0] - a[0]) * radians;
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(a[1] * radians) *
      Math.cos(b[1] * radians) *
      Math.sin(dlon / 2) ** 2;
  return 6371008.8 * 2 * Math.asin(Math.sqrt(h));
};
const server = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/info") return res.end(JSON.stringify(runtimeIdentity));
  if (req.url === "/stats") return res.end(JSON.stringify({ requests }));
  requests++;
  if (mode === "unavailable") {
    res.statusCode = 503;
    return res.end(
      JSON.stringify({ message: "Routing service temporarily unavailable" }),
    );
  }
  if (mode === "invalid") return res.end(JSON.stringify({ paths: [] }));
  if (mode === "timeout") return setTimeout(() => res.end("{}"), 1500);
  if (mode === "unreachable") {
    res.statusCode = 400;
    return res.end(JSON.stringify({ message: "Connection not found" }));
  }
  const parts = [];
  for await (const c of req) parts.push(c);
  const request = JSON.parse(Buffer.concat(parts).toString());
  if (
    request.points_encoded !== false ||
    request.way_point_max_distance !== 0 ||
    !request.details.includes("edge_id") ||
    request.profile !== "car" ||
    request["ch.disable"] !== true ||
    request["lm.disable"] !== false ||
    request["lm.active_landmarks"] !== 16 ||
    request.custom_model !== undefined
  ) {
    res.statusCode = 400;
    return res.end(
      JSON.stringify({ message: "Required route contract missing" }),
    );
  }
  const [a, b] = request.points,
    mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
    coords = [a, mid, b];
  const lengths = [meters(a, mid), meters(mid, b)],
    speeds = [30, 60];
  // The shared browser fixture has several independent road segments. Reusing
  // edge 12 for every route would let one flooded street close the entire map.
  // Fixed IDs remain the default for the focused provider contract tests.
  const edge = (from, to, fallback) =>
    process.env.LV_FIXTURE_UNIQUE_EDGES === "1"
      ? createHash("sha256")
          .update([from.join(","), to.join(",")].sort().join(";"))
          .digest()
          .readUInt32BE(0) % 1000000000
      : fallback;
  const adjusted = speeds;
  const times = lengths.map(
    (n, i) => (1000 * n) / (adjusted[i] / 3.6) + (i === 1 ? 5000 : 0),
  );
  if (mode === "snap") coords[0] = [a[0] + 0.1, a[1]];
  res.end(
    JSON.stringify({
      paths: [
        {
          distance: lengths[0] + lengths[1],
          time: times[0] + times[1],
          points: { type: "LineString", coordinates: coords },
          details: {
            edge_id: [
              [0, 1, edge(a, mid, 12)],
              [1, 2, edge(mid, b, 13)],
            ],
            time: [
              [0, 1, times[0]],
              [1, 2, times[1]],
            ],
            average_speed: [
              [0, 1, adjusted[0]],
              [1, 2, (lengths[1] / (times[1] / 1000)) * 3.6],
            ],
            car_average_speed: [
              [0, 1, speeds[0]],
              [1, 2, speeds[1]],
            ],
            max_speed: [
              [0, 1, 30],
              [1, 2, 80],
            ],
            street_name: [
              [0, 1, "Teststraße"],
              [1, 2, "Testallee"],
            ],
            road_class: [
              [0, 1, "RESIDENTIAL"],
              [1, 2, "PRIMARY"],
            ],
            road_environment: [
              [0, 1, "ROAD"],
              [1, 2, "BRIDGE"],
            ],
          },
        },
      ],
    }),
  );
});
server.listen(0, "127.0.0.1", () =>
  process.send?.({
    ready: true,
    origin: `http://127.0.0.1:${server.address().port}`,
  }),
);
process.on("message", (message) => {
  if (message === "stop") server.close(() => process.exit());
  else {
    mode = message.mode;
    process.send?.({ mode });
  }
});
