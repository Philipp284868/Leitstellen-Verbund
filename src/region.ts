/** Regional extensions. The original city and every existing junction stay fixed. */
export const WORLD_WIDTH = 5200;
export const WORLD_HEIGHT = 3400;
export const METERS_PER_UNIT = 12;
export const towns = [
  { name: "ROSENFELD", x: 1810, y: 390, size: 1.2, angle: -0.2 },
  { name: "HOHENBRÜCK", x: 2860, y: 570, size: 1.8, angle: 0.25 },
  { name: "EICHENBACH", x: 4140, y: 310, size: 1.1, angle: -0.4 },
  { name: "BERGHEIM", x: 4690, y: 1140, size: 1.6, angle: 0.4 },
  { name: "WALDSTEIN", x: 3160, y: 1630, size: 1.4, angle: -0.2 },
  { name: "AUENBURG", x: 1720, y: 1460, size: 2, angle: 0.15 },
  { name: "WIESENTAL", x: 480, y: 1450, size: 1.1, angle: -0.3 },
  { name: "KIRCHHAIN", x: 740, y: 2670, size: 1.6, angle: 0.5 },
  { name: "OBERWALD", x: 2320, y: 2750, size: 1.3, angle: -0.4 },
  { name: "STEINFURT", x: 3890, y: 2730, size: 2, angle: 0.1 },
];
type Spec = [string, "main" | "street" | "lane" | "country", number[][]];
export const regionalRoads: Spec[] = [
  [
    "Östliche Landstraße",
    "country",
    [
      [1280, 250],
      [1470, 290],
      [1650, 350],
      [1810, 390],
    ],
  ],
  [
    "Hohenbrücker Chaussee",
    "country",
    [
      [1810, 390],
      [2130, 440],
      [2490, 390],
      [2690, 470],
      [2860, 570],
    ],
  ],
  [
    "Eichenbacher Landstraße",
    "country",
    [
      [2860, 570],
      [3190, 450],
      [3520, 530],
      [3800, 390],
      [4140, 310],
    ],
  ],
  [
    "Bergpass",
    "country",
    [
      [4140, 310],
      [4500, 340],
      [4810, 530],
      [4940, 870],
      [4690, 1140],
    ],
  ],
  [
    "Waldsteiner Straße",
    "country",
    [
      [4690, 1140],
      [4330, 1520],
      [3860, 1400],
      [3500, 1520],
      [3160, 1630],
    ],
  ],
  [
    "Auenburger Landstraße",
    "country",
    [
      [3160, 1630],
      [2820, 1500],
      [2460, 1710],
      [2070, 1600],
      [1720, 1460],
    ],
  ],
  [
    "Falkenrieder Südstraße",
    "country",
    [
      [665, 830],
      [820, 1000],
      [1180, 1060],
      [1490, 1270],
      [1720, 1460],
    ],
  ],
  [
    "Wiesentaler Straße",
    "country",
    [
      [1720, 1460],
      [1290, 1740],
      [970, 1640],
      [690, 1530],
      [480, 1450],
    ],
  ],
  [
    "Kirchhainer Landstraße",
    "country",
    [
      [480, 1450],
      [240, 1810],
      [330, 2200],
      [580, 2420],
      [740, 2670],
    ],
  ],
  [
    "Südliche Höhenstraße",
    "country",
    [
      [740, 2670],
      [1100, 2920],
      [1580, 2850],
      [1920, 2970],
      [2320, 2750],
    ],
  ],
  [
    "Steinfurter Chaussee",
    "country",
    [
      [2320, 2750],
      [2650, 2620],
      [3060, 2810],
      [3540, 2620],
      [3890, 2730],
    ],
  ],
  [
    "Östlicher Regionalring",
    "country",
    [
      [3890, 2730],
      [4460, 2780],
      [4830, 2440],
      [4930, 1860],
      [4690, 1140],
    ],
  ],
  [
    "Mittlere Talstraße",
    "country",
    [
      [3160, 1630],
      [3400, 1980],
      [3690, 2210],
      [3890, 2730],
    ],
  ],
];
for (const [i, town] of towns.entries()) {
  const transform = (points: number[][]) =>
    points.map(([x, y]) => [
      town.x +
        town.size * (x * Math.cos(town.angle) - y * Math.sin(town.angle)),
      town.y +
        town.size * (x * Math.sin(town.angle) + y * Math.cos(town.angle)),
    ]);
  // Irregular neighborhoods grow on one side of the regional junction, leaving
  // the connecting roads unobstructed. Distinct sizes, orientations and lanes.
  regionalRoads.push([
    `${town.name} Ortsstraße`,
    "street",
    transform([
      [0, 0],
      [-38, -65],
      [-30, -145],
      [35, -192],
      [120, -172],
      [156, -104],
      [107, -45],
      [0, 0],
    ]),
  ]);
  regionalRoads.push([
    `${town.name} Kirchweg`,
    "lane",
    transform([
      [-30, -145],
      [-104, -174],
      [-139, -231],
      [-91, -278],
      [4, -259],
      [35, -192],
    ]),
  ]);
  regionalRoads.push([
    `${town.name} Gartenweg`,
    "lane",
    transform([
      [120, -172],
      [178, -208],
      [234, -178],
      [258, -115],
    ]),
  ]);
  if (i % 2)
    regionalRoads.push([
      `${town.name} Marktgasse`,
      "street",
      transform([
        [-38, -65],
        [21, -99],
        [89, -109],
        [156, -104],
      ]),
    ]);
}
