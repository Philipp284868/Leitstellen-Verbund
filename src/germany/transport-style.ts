import type { ExpressionSpecification, LayerSpecification } from "maplibre-gl";
const roadClasses = [
  "motorway",
  "trunk",
  "primary",
  "secondary",
  "tertiary",
  "minor",
  "service",
  "track",
  "path",
];
const roadWidth: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  5,
  ["match", ["get", "class"], ["motorway", "trunk"], 0.7, 0.2],
  12,
  [
    "match",
    ["get", "class"],
    ["motorway", "trunk"],
    3.4,
    ["primary", "secondary"],
    2.2,
    ["tertiary", "minor"],
    1.2,
    0.6,
  ],
  17,
  [
    "match",
    ["get", "class"],
    ["motorway", "trunk"],
    12,
    ["primary", "secondary"],
    9,
    ["tertiary", "minor"],
    6,
    "service",
    3.5,
    1.5,
  ],
];
/** Real OMT class/brunnel/layer attributes. Each elevation paints roads and rails together. */
export function transportLayers(): LayerSpecification[] {
  const result: LayerSpecification[] = [];
  result.push({
    id: "platforms",
    type: "fill",
    source: "germany",
    "source-layer": "transportation",
    minzoom: 13,
    filter: [
      "all",
      ["==", ["geometry-type"], "Polygon"],
      ["==", ["get", "subclass"], "platform"],
    ],
    paint: { "fill-color": "#9d9d90", "fill-opacity": 0.65 },
  });
  for (let level = -5; level <= 5; level++)
    for (const stratum of ["tunnel", "surface", "bridge"] as const) {
      const actual: ExpressionSpecification = [
        "max",
        -5,
        [
          "min",
          5,
          [
            "coalesce",
            ["get", "layer"],
            stratum === "bridge" ? 1 : stratum === "tunnel" ? -1 : 0,
          ],
        ],
      ];
      const at: ExpressionSpecification = [
        "all",
        ["==", ["geometry-type"], "LineString"],
        ["==", actual, level],
        stratum === "surface"
          ? ["!", ["in", ["get", "brunnel"], ["literal", ["tunnel", "bridge"]]]]
          : ["==", ["get", "brunnel"], stratum],
      ];
      const id = `transport-${stratum}-${level}`;
      const tunnel = stratum === "tunnel";
      const base = {
        source: "germany",
        "source-layer": "transportation",
        type: "line" as const,
        minzoom: 5,
      };
      const road: ExpressionSpecification = [
        "all",
        at,
        ["in", ["get", "class"], ["literal", roadClasses]],
      ];
      result.push({
        ...base,
        id: id + "-road-case",
        filter: road,
        layout: {
          "line-cap": "round",
          "line-join": "round",
          "line-sort-key": ["coalesce", ["get", "layer"], 0],
        },
        paint: {
          "line-color": stratum === "bridge" ? "#bac1ad" : "#243533",
          "line-width": roadWidth.map((part, i) =>
            i >= 4 && i % 2 === 0
              ? ["+", part, stratum === "bridge" ? 2 : 1]
              : part,
          ) as ExpressionSpecification,
          "line-opacity": tunnel ? 0.25 : 0.95,
        },
      });
      result.push({
        ...base,
        id: id + "-road",
        filter: road,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": [
            "match",
            ["get", "class"],
            "motorway",
            "#d4b788",
            "trunk",
            "#c6b997",
            "primary",
            "#c4c3ac",
            "secondary",
            "#aeb9ad",
            "path",
            "#82927c",
            "#8ea49b",
          ],
          "line-width": roadWidth,
          "line-opacity": tunnel ? 0.4 : 1,
          ...(tunnel ? { "line-dasharray": [3, 2] } : {}),
        },
      });
      const rail: ExpressionSpecification = [
        "all",
        at,
        ["in", ["get", "class"], ["literal", ["rail", "transit"]]],
      ];
      result.push({
        ...base,
        id: id + "-rail-bed",
        minzoom: 9,
        filter: rail,
        paint: {
          "line-color": stratum === "bridge" ? "#d2cec1" : "#2a3438",
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            9,
            1.5,
            14,
            3,
            18,
            5,
          ],
          "line-opacity": tunnel ? 0.35 : 0.95,
        },
      });
      result.push({
        ...base,
        id: id + "-rail",
        minzoom: 9,
        filter: rail,
        paint: {
          "line-color": [
            "match",
            ["get", "subclass"],
            ["tram", "light_rail"],
            "#b8cccf",
            "subway",
            "#828cab",
            "#c5c9b7",
          ],
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            9,
            0.6,
            14,
            1.2,
            18,
            2,
          ],
          "line-opacity": tunnel ? 0.55 : 1,
          "line-dasharray": tunnel ? [3, 3] : [5, 1.5],
        },
      });
    }
  return result;
}
