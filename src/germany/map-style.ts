import type { LayerSpecification, StyleSpecification } from "maplibre-gl";

export const GERMANY_BOUNDS: [number, number, number, number] = [
  5.5, 47.1, 15.6, 55.2,
];
export type GeoManifest = {
  bounds: [number, number, number, number];
  minzoom?: number;
  maxzoom?: number;
  version?: string;
  dataset?: string;
  dem?: {
    minzoom: number;
    maxzoom: number;
    encoding: "terrarium";
    attribution: string;
    dataset: string;
  };
};
export async function loadGeoManifest(
  signal: AbortSignal,
): Promise<GeoManifest> {
  const response = await fetch("/geo/manifest", { signal });
  if (!response.ok)
    throw Error(
      "Deutschland-Kartendaten sind auf diesem Server noch nicht verfügbar.",
    );
  const value = await response.json();
  if (
    !Array.isArray(value.bounds) ||
    value.bounds.length !== 4 ||
    !value.bounds.every(Number.isFinite)
  )
    throw Error(
      "Das Kartenmanifest enthält keine gültigen geografischen Grenzen.",
    );
  if (
    value.dem &&
    (value.dem.encoding !== "terrarium" ||
      !Number.isInteger(value.dem.minzoom) ||
      !Number.isInteger(value.dem.maxzoom) ||
      value.dem.minzoom < 0 ||
      value.dem.maxzoom < value.dem.minzoom ||
      value.dem.maxzoom > 22 ||
      typeof value.dem.attribution !== "string" ||
      !/^[a-f0-9]{64}$/.test(value.dem.dataset))
  )
    throw Error("Das Höhenmodell besitzt kein gültiges Datenmanifest.");
  return value;
}

/** All geometry is served from the versioned, local OpenMapTiles data set. */
export function germanyStyle(manifest: GeoManifest): StyleSpecification {
  const demAttribution = manifest.dem?.attribution.replace(
    /[&<>"']/g,
    (value) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        value
      ]!,
  );
  return {
    version: 8,
    sources: {
      germany: {
        type: "vector",
        tiles: [
          `${location.origin}/geo/tiles/{z}/{x}/{y}.pbf${manifest.dataset ? `?dataset=${encodeURIComponent(manifest.dataset)}` : ""}`,
        ],
        bounds: manifest.bounds,
        minzoom: manifest.minzoom ?? 0,
        maxzoom: manifest.maxzoom ?? 14,
        attribution:
          '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap-Mitwirkende</a> · <a href="https://openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a>',
      },
      ...(manifest.dem
        ? {
            elevation: {
              type: "raster-dem" as const,
              tiles: [
                `${location.origin}/geo/dem/{z}/{x}/{y}.png?dataset=${encodeURIComponent(manifest.dem.dataset)}`,
              ],
              tileSize: 256,
              bounds: manifest.bounds,
              minzoom: manifest.dem.minzoom,
              maxzoom: manifest.dem.maxzoom,
              encoding: manifest.dem.encoding,
              attribution: demAttribution,
            },
          }
        : {}),
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": "#35433e" },
      },
      {
        id: "landcover",
        type: "fill",
        source: "germany",
        "source-layer": "landcover",
        paint: {
          "fill-color": [
            "match",
            ["get", "class"],
            "wood",
            "#233f34",
            "grass",
            "#3e5040",
            "ice",
            "#a4b4b4",
            "sand",
            "#73775a",
            "#435445",
          ],
          "fill-opacity": 0.85,
        },
      },
      {
        id: "landuse",
        type: "fill",
        source: "germany",
        "source-layer": "landuse",
        minzoom: 7,
        paint: {
          "fill-color": [
            "match",
            ["get", "class"],
            "residential",
            "#4a5050",
            "industrial",
            "#45535c",
            "commercial",
            "#565654",
            "railway",
            "#43494a",
            "farmland",
            "#586344",
            "cemetery",
            "#344b3e",
            "#475b44",
          ],
          "fill-opacity": 0.7,
        },
      },
      {
        id: "water",
        type: "fill",
        source: "germany",
        "source-layer": "water",
        paint: { "fill-color": "#173c50" },
      },
      {
        id: "waterway",
        type: "line",
        source: "germany",
        "source-layer": "waterway",
        minzoom: 7,
        paint: {
          "line-color": "#25566a",
          "line-width": ["interpolate", ["linear"], ["zoom"], 7, 0.6, 14, 2.2],
        },
      },
      ...(manifest.dem
        ? ([
            {
              // Elevation is supplied by the local, verified Copernicus DSM. A flat
              // map remains usable while no DEM has been explicitly prepared.
              id: "terrain-relief",
              type: "hillshade",
              source: "elevation",
              minzoom: 5,
              paint: {
                "hillshade-exaggeration": 0.3,
                "hillshade-shadow-color": "#14261e",
                "hillshade-highlight-color": "#c5ccb6",
                "hillshade-accent-color": "#405440",
                "hillshade-illumination-anchor": "map",
              },
            },
          ] satisfies LayerSpecification[])
        : []),
      {
        id: "buildings",
        type: "fill",
        source: "germany",
        "source-layer": "building",
        minzoom: 13,
        paint: {
          "fill-color": "#879087",
          "fill-outline-color": "#394744",
          "fill-opacity": 0.72,
        },
      },
      {
        id: "road-case",
        type: "line",
        source: "germany",
        "source-layer": "transportation",
        minzoom: 5,
        filter: ["!in", "class", "rail", "transit", "path"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#202d30",
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            5,
            0.8,
            10,
            2.6,
            16,
            10,
          ],
        },
      },
      {
        id: "roads",
        type: "line",
        source: "germany",
        "source-layer": "transportation",
        minzoom: 5,
        filter: ["!in", "class", "rail", "transit", "path"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": [
            "match",
            ["get", "class"],
            "motorway",
            "#bcb18a",
            "trunk",
            "#b2ad8f",
            "primary",
            "#a6ac9a",
            "#7a8a85",
          ],
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            5,
            0.4,
            10,
            1.2,
            16,
            6,
          ],
        },
      },
      {
        id: "rail",
        type: "line",
        source: "germany",
        "source-layer": "transportation",
        minzoom: 9,
        filter: ["==", "class", "rail"],
        paint: {
          "line-color": "#939b94",
          "line-width": 1,
          "line-dasharray": [2, 3],
        },
      },
      {
        id: "state-boundary",
        type: "line",
        source: "germany",
        "source-layer": "boundary",
        filter: ["==", "admin_level", 4],
        paint: {
          "line-color": "#99a5a0",
          "line-width": 1,
          "line-opacity": 0.5,
          "line-dasharray": [3, 3],
        },
      },
      {
        id: "national-boundary",
        type: "line",
        source: "germany",
        "source-layer": "boundary",
        filter: ["==", "admin_level", 2],
        paint: {
          "line-color": "#c5d4ce",
          "line-width": 1.5,
          "line-opacity": 0.75,
          "line-dasharray": [4, 2],
        },
      },
      // The feature layers below make local tile labels available to the canvas
      // overlay. System fonts avoid external glyph requests and font accounts.
      ...["place", "water_name", "mountain_peak"].map((sourceLayer) => ({
        id: `labels-${sourceLayer}`,
        type: "circle" as const,
        source: "germany",
        "source-layer": sourceLayer,
        paint: { "circle-radius": 0, "circle-opacity": 0 },
      })),
      {
        id: "labels-transportation_name",
        type: "line",
        source: "germany",
        "source-layer": "transportation_name",
        minzoom: 13,
        paint: { "line-width": 0, "line-opacity": 0 },
      },
    ],
  };
}

export function readGermanyCamera(
  raw: string | null,
  world: string,
  seed: number,
) {
  try {
    const value = JSON.parse(raw || "null");
    return value &&
      value.world === world &&
      value.seed === seed &&
      [value.lon, value.lat, value.zoom].every(Number.isFinite) &&
      value.lon >= 5.5 &&
      value.lon <= 15.6 &&
      value.lat >= 47.1 &&
      value.lat <= 55.2 &&
      value.zoom >= 4 &&
      value.zoom <= 18
      ? {
          lon: value.lon as number,
          lat: value.lat as number,
          zoom: value.zoom as number,
        }
      : null;
  } catch {
    return null;
  }
}
