/** Source tags are evidence; a name alone never determines an organisation or subtype. */
export function classifyFacility(tags) {
  const emergency = tags.emergency || "",
    amenity = tags.amenity || "";
  const thw =
    /^(?:Bundesanstalt\s+)?Technisches Hilfswerk(?:\s*\(THW\))?$|^THW$/.test(
      tags.operator || "",
    ) && !!tags["ref:thw"];
  let kind,
    subtype = "unknown";
  if (amenity === "fire_station") {
    kind = "fire";
    const team = tags["fire_station:team"] || tags["fire_station:type"];
    subtype = ["professional", "occupation"].includes(team)
      ? "BF"
      : ["voluntary", "volunteer"].includes(team)
        ? "FF"
        : "unknown";
  } else if (amenity === "hospital" || tags.healthcare === "hospital")
    kind = "hospital";
  else if (emergency === "ambulance_station") kind = "ems";
  else if (amenity === "police" && (!tags.police || tags.police === "station"))
    kind = "police";
  else if (
    emergency === "disaster_response" ||
    (thw &&
      (amenity === "emergency_service" ||
        tags.emergency_service === "technical"))
  )
    kind = thw ? "thw" : "kats";
  else if (emergency === "air_rescue_service") kind = "heli";
  else if (
    ["water_rescue", "water_rescue_station", "lifeguard_base"].includes(
      emergency,
    ) ||
    (emergency === "lifeguard" && tags.lifeguard === "base")
  )
    kind = "water";
  else if (
    amenity === "training" &&
    ["firefighter", "firefighting", "emergency"].includes(tags.training)
  )
    kind = "school";
  else if (
    tags.police ||
    amenity === "police" ||
    amenity === "rescue_station" ||
    amenity === "emergency_service"
  ) {
    kind = "other";
    subtype = tags.police || "unknown";
  } else return;
  const inactive = [
    "disused",
    "abandoned",
    "demolished",
    "razed",
    "proposed",
    "construction",
  ].some(
    (key) =>
      (tags[key] && tags[key] !== "no") ||
      ["amenity", "emergency", "healthcare"].some((k) => tags[`${key}:${k}`]),
  );
  return {
    kind,
    subtype,
    emergency:
      tags.emergency === "yes"
        ? "yes"
        : tags.emergency === "no"
          ? "no"
          : "unknown",
    status: inactive ? "inactive" : kind === "other" ? "review" : "active",
  };
}
const normalize = (value) =>
  (value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("de-DE")
    .replace(/[^\p{L}\p{N}]/gu, "");
export function pointInRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i],
      [xj, yj] = ring[j];
    if (
      yi > point.lat !== yj > point.lat &&
      point.lon < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi
    )
      inside = !inside;
  }
  return inside;
}
export function covers(geometry, point) {
  if (geometry.type === "Point") return false;
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some(
    ([outer, ...holes]) =>
      pointInRing(point, outer) &&
      !holes.some((hole) => pointInRing(point, hole)),
  );
}
/** Containment plus shared identity. Nearby unrelated buildings are never merged. */
export function sameFacility(a, b) {
  if (a.kind !== b.kind) return false;
  if (a.source === b.source) return true;
  const contains =
    a.members?.includes(b.source) ||
    b.members?.includes(a.source) ||
    covers(a.geometry, b) ||
    covers(b.geometry, a);
  if (!contains) return false;
  const sameName =
    !!normalize(a.tags.name) &&
    normalize(a.tags.name) === normalize(b.tags.name);
  const sameWikidata = !!a.tags.wikidata && a.tags.wikidata === b.tags.wikidata;
  const sameRef = ["ref:thw", "ref"].some(
    (key) =>
      a.tags[key] &&
      a.tags[key] === b.tags[key] &&
      a.tags.operator &&
      a.tags.operator === b.tags.operator,
  );
  return (
    sameName ||
    sameWikidata ||
    sameRef ||
    ((a.members?.includes(b.source) || b.members?.includes(a.source)) &&
      (!a.tags.name || !b.tags.name))
  );
}
