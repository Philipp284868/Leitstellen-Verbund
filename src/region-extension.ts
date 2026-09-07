/** Authored, deterministic continuation of the original region; coordinates never rescaled. */
export const regionTowns = [
  ["TANNENFELS", 5710, 540],
  ["OSTERHOF", 6990, 420],
  ["FELSENAU", 7750, 1290],
  ["SONNBERG", 5910, 1860],
  ["BIRKENHEIM", 7020, 2570],
  ["KLOSTERFELD", 7700, 3480],
  ["MOORBURG", 5380, 3210],
  ["HASELBACH", 4490, 4180],
  ["TALHEIM", 2960, 3920],
  ["WALDRODE", 1640, 3990],
  ["WESTERODE", 420, 3890],
  ["WEIDENAU", 860, 5020],
  ["BACHSTETTEN", 2300, 5260],
  ["MARIENFELD", 3740, 5130],
  ["HARTENBERG", 5460, 4670],
  ["OSTERWALD", 6840, 4480],
  ["LICHTENAU", 7680, 5300],
  ["RIEDBURG", 6470, 5880],
  ["FINKENHEIM", 4590, 6070],
  ["SÜDERFELD", 3090, 6360],
  ["HOFSTETTEN", 1680, 6100],
  ["ERLENAU", 420, 6640],
  ["SILBERBACH", 930, 7780],
  ["MÜHLHEIM", 2430, 7750],
  ["KORNBERG", 4070, 7480],
  ["NEUSTETTEN", 5680, 7800],
  ["OSTERFELD", 6980, 7220],
  ["SÜDBRUCK", 7750, 7890],
].map(([name, x, y], i) => ({
  name: String(name),
  x: Number(x),
  y: Number(y),
  size: 0.9 + (i % 4) * 0.18,
  angle: ((i % 7) - 3) * 0.17,
}));
export type ExtensionSpec = [
  string,
  "country" | "street" | "lane" | "main",
  number[][],
];
export function extendedRoadSpecs(): ExtensionSpec[] {
  const result: ExtensionSpec[] = [];
  const connected = [
    { name: "BERGHEIM", x: 4690, y: 1140 },
    { name: "STEINFURT", x: 3890, y: 2730 },
    { name: "KIRCHHAIN", x: 740, y: 2670 },
  ];
  for (const [i, t] of regionTowns.entries()) {
    const a = connected.reduce((a, b) =>
      Math.hypot(a.x - t.x, a.y - t.y) < Math.hypot(b.x - t.x, b.y - t.y)
        ? a
        : b,
    );
    const dx = t.x - a.x,
      dy = t.y - a.y;
    result.push([
      `${a.name}–${t.name} Landstraße`,
      "country",
      [
        [a.x, a.y],
        [a.x + dx * 0.32 - dy * 0.06, a.y + dy * 0.32 + dx * 0.06],
        [a.x + dx * 0.7 + dy * 0.04, a.y + dy * 0.7 - dx * 0.04],
        [t.x, t.y],
      ],
    ]);
    const transform = (p: number[][]) =>
      p.map(([x, y]) => [
        t.x + t.size * (x * Math.cos(t.angle) - y * Math.sin(t.angle)),
        t.y + t.size * (x * Math.sin(t.angle) + y * Math.cos(t.angle)),
      ]);
    result.push([
      `${t.name} Hauptstraße`,
      "street",
      transform([
        [0, 0],
        [-60, -40],
        [-115, -140],
        [-75, -240],
        [60, -260],
        [170, -175],
        [130, -60],
        [0, 0],
      ]),
    ]);
    result.push([
      `${t.name} Kirchweg`,
      "lane",
      transform([
        [-115, -140],
        [-210, -160],
        [-245, -250],
        [-150, -310],
        [-75, -240],
      ]),
    ]);
    result.push([
      `${t.name} Siedlungsweg`,
      "lane",
      transform([
        [170, -175],
        [240, -210],
        [310, -125],
        [270, -40],
        [130, -60],
      ]),
    ]);
    result.push([
      `${t.name} Marktstraße`,
      "street",
      transform([
        [-60, -40],
        [0, -115],
        [80, -145],
        [170, -175],
      ]),
    ]);
    if (i % 3 === 0)
      result.push([
        `${t.name} Gewerbezufahrt`,
        "street",
        transform([
          [0, 0],
          [70, 70],
          [190, 110],
          [270, 60],
        ]),
      ]);
    connected.push(t);
  }
  // Additional independent corridors provide alternatives to town access roads.
  for (const [ai, bi] of [
    [0, 1],
    [1, 2],
    [2, 5],
    [5, 16],
    [16, 27],
    [27, 25],
    [25, 22],
    [22, 10],
    [10, 8],
    [8, 6],
    [6, 0],
    [12, 18],
    [18, 17],
    [17, 4],
  ]) {
    const a = regionTowns[ai],
      b = regionTowns[bi];
    result.push([
      `Schnellstraße ${a.name}–${b.name}`,
      "country",
      [
        [a.x, a.y],
        [(a.x + b.x) / 2 + 50, (a.y + b.y) / 2 - 70],
        [b.x, b.y],
      ],
    ]);
  }
  return result;
}
