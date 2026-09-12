import { useEffect, useRef, useState } from "react";
import type { Mission, Save, Vehicle } from "../../shared/model";
import type { TravelMode } from "../../simulation/dynamics-schema";
import { hospitalOptions } from "../../simulation/hospitals";
import type { Alarm } from "../../simulation/schema";
import { useGame } from "../store";
import { approachContext } from "./approach-key";
import type { Point } from "../../shared/germany/projection";
import { project, unproject } from "../../shared/germany/projection";
import { GeoRequestCache, type QueryResult } from "./request-cache";
const cache = new GeoRequestCache();
function useGeoQuery<T>(key: string, path: string, enabled: boolean) {
  const { mode } = useGame();
  const [state, setState] = useState<
    QueryResult<T> & {
      key: string;
    }
  >({
    key: "",
    loading: true,
  });
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const release = cache.subscribe<T>(
      key,
      path,
      (result) => setState({ ...result, key }),
      mode,
    );
    const timer = setTimeout(() => setRefresh((value) => value + 1), 15010);
    return () => {
      release();
      clearTimeout(timer);
    };
  }, [key, path, enabled, refresh, mode]);
  return state.key === key ? state : ({ loading: true } as QueryResult<T>);
}
function useScope(s: Save) {
  const { mode } = useGame();
  return `${s.world}:${s.worldSeed}:${s.generation}:${s.player.id}:${mode}`;
}
export function ApproachText({
  s,
  vehicle,
  target,
  mode = "priority",
  alarm,
}: {
  s: Save;
  vehicle: Vehicle;
  target: Point;
  mode?: TravelMode;
  alarm?: Alarm;
}) {
  const element = useRef<HTMLSpanElement>(null),
    [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!element.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: "60px" },
    );
    observer.observe(element.current);
    return () => observer.disconnect();
  }, []);
  const scope = useScope(s);
  const params = new URLSearchParams({
    vehicle: vehicle.id,
    x: String(target.x),
    y: String(target.y),
    mode,
    ...(alarm ? { alarm } : {}),
  });
  const path = `/api/geo/approach?${params}`;
  const result = useGeoQuery<{
    text: string;
  }>(`${scope}:${path}:${approachContext(s, vehicle)}`, path, visible);
  return (
    <span ref={element} aria-busy={result.loading}>
      {result.error || result.data?.text || "Anfahrt wird berechnet …"}
    </span>
  );
}
export function useHospitalOptions(
  s: Save,
  origin: Point,
  seats: number,
  mission?: Mission,
  vehicle?: Vehicle,
  enabled = true,
) {
  const scope = useScope(s),
    params = new URLSearchParams({
      x: String(origin.x),
      y: String(origin.y),
      seats: String(seats),
      ...(mission ? { mission: mission.id } : {}),
      ...(vehicle ? { vehicle: vehicle.id } : {}),
    });
  const path = `/api/geo/hospitals?${params}`;
  const result = useGeoQuery<{
    options: ReturnType<typeof hospitalOptions>;
  }>(`${scope}:${path}`, path, enabled);
  return {
    options: result.data?.options ?? [],
    loading: enabled && result.loading,
    error: result.error,
  };
}
/** Stable OSM node IDs are resolved by the server, never indexed into a client graph. */
export function DutyLocation({
  label,
  nodeId,
  home,
  onChange,
}: {
  label: string;
  nodeId: number;
  home: Point;
  onChange: (nodeId: number) => void;
}) {
  const { mode } = useGame();
  const [query, setQuery] = useState(""),
    [places, setPlaces] = useState<
      {
        id: string;
        name: string;
        lon: number;
        lat: number;
      }[]
    >([]);
  const [name, setName] = useState(`Standort ${nodeId}`),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setName(`Standort ${nodeId}`);
    void fetch(`/geo/node?id=${nodeId}`, {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw Error(
            "Gespeicherter Standort kann momentan nicht aufgelöst werden.",
          );
        const value = await response.json();
        const point = value.point || value;
        const p = unproject(point);
        if (!Number.isFinite(p.lon) || !Number.isFinite(p.lat))
          throw Error("Ungültige Standortkoordinate.");
        setName(value.name || `${p.lat.toFixed(4)}° N, ${p.lon.toFixed(4)}° O`);
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(String(reason.message || reason));
      });
    return () => controller.abort();
  }, [nodeId]);
  useEffect(() => {
    const controller = new AbortController();
    setPlaces([]);
    if (!query.trim()) return;
    const timer = setTimeout(() => {
      void fetch(`/geo/search?q=${encodeURIComponent(query.trim())}`, {
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok)
            throw Error("Ortssuche ist momentan nicht verfügbar.");
          const rows = await response.json();
          if (Array.isArray(rows))
            setPlaces(
              rows
                .filter(
                  (value) =>
                    Number.isFinite(value.lon) && Number.isFinite(value.lat),
                )
                .slice(0, 6),
            );
        })
        .catch((reason) => {
          if (!controller.signal.aborted)
            setError(String(reason.message || reason));
        });
    }, 240);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);
  const [choice, setChoice] = useState<Point | null>(null);
  useEffect(() => {
    if (!choice) return;
    const controller = new AbortController();
    setPending(true);
    setError("");
    void fetch(
      `/api/geo/site?${new URLSearchParams({ x: String(choice.x), y: String(choice.y), type: "fire", purpose: "staff" })}`,
      {
        credentials: "same-origin",
        signal: controller.signal,
        headers: { "x-game-mode": mode },
      },
    )
      .then(async (response) => {
        if (!response.ok)
          throw Error("Straßenanbindung kann nicht geprüft werden.");
        const value = await response.json();
        if (
          value.reason ||
          !Number.isSafeInteger(value.nodeId) ||
          value.nodeId < 0
        )
          throw Error(
            value.reason || "Kein gültiger Straßenstandort gefunden.",
          );
        if (!controller.signal.aborted) {
          onChange(value.nodeId);
          setQuery("");
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(String(reason.message || reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setPending(false);
      });
    return () => controller.abort();
  }, [choice, mode]);
  return (
    <div className="duty-location">
      <label>
        {label}
        <input
          aria-label={`${label} suchen`}
          value={query}
          placeholder="Realen Ort oder Adresse suchen …"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <small>
        Aktuell: {name} · Standort {nodeId}
      </small>
      {places.map((place) => (
        <button
          type="button"
          key={place.id}
          disabled={pending}
          onClick={() => setChoice(project(place))}
        >
          {place.name}
        </button>
      ))}
      <button
        type="button"
        disabled={pending}
        onClick={() => setChoice({ ...home })}
      >
        Direkt an der Wache
      </button>
      {pending && <small role="status">Straßenstandort wird geprüft …</small>}
      {error && <small role="alert">{error}</small>}
    </div>
  );
}
