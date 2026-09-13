import { afterEach, expect, it, vi } from "vitest";
import { ToastQueue } from "../src/client/toast-queue";
import {
  metricScale,
  markerFocusZoom,
  SCALE_REFERENCE_PX,
} from "../src/client/germany/metric-scale";
afterEach(() => vi.useRealTimers());
it("zeigt einen Hinweis genau 3000 ms ab DOM-Bestätigung, ohne Verlängerung durch Duplikate", () => {
  vi.useFakeTimers();
  const q = new ToastQueue(),
    detach = q.attach();
  q.add({ id: "case:1", text: "Einsatz beendet · +10 XP", priority: "normal" });
  vi.advanceTimersByTime(5000);
  expect(q.snapshot()?.id).toBe("case:1");
  q.shown("case:1");
  vi.advanceTimersByTime(2999);
  q.add({ id: "case:1", text: "Einsatz beendet · +10 XP", priority: "normal" });
  q.shown("case:1");
  expect(q.snapshot()?.id).toBe("case:1");
  vi.advanceTimersByTime(1);
  expect(q.snapshot()).toBeNull();
  detach();
});
it("begrenzt Burst, priorisiert kritische Hinweise und spielt nach Remount nichts erneut ab", () => {
  vi.useFakeTimers();
  const q = new ToastQueue();
  let detach = q.attach();
  q.add({
    id: "first",
    text: "Erste Lage",
    priority: "normal",
    group: "incident:1",
  });
  q.shown("first");
  for (let i = 0; i < 100; i++)
    q.add({
      id: `repeat:${i}`,
      text: "Weitere Fahrzeuglage",
      priority: "normal",
      group: "incident:1",
    });
  for (let i = 0; i < 100; i++)
    q.add({ id: `burst:${i}`, text: "Standort", priority: "normal" });
  q.add({
    id: "offline",
    text: "Serververbindung verloren",
    priority: "critical",
  });
  vi.advanceTimersByTime(3000);
  expect(q.snapshot()?.id).toBe("offline");
  q.shown("offline");
  vi.advanceTimersByTime(3000);
  expect(q.snapshot()).toBeNull();
  detach();
  q.add({ id: "away", text: "Nicht nachspielen", priority: "normal" });
  detach = q.attach();
  q.add({ id: "first", text: "Erste Lage", priority: "normal" });
  q.add({ id: "away", text: "Nicht nachspielen", priority: "normal" });
  expect(q.snapshot()).toBeNull();
  detach();
});
it("entfernt einen nicht abgelaufenen Hinweis bei Verlassen und startet seine Zeit nicht beim Remount neu", () => {
  vi.useFakeTimers();
  const q = new ToastQueue(),
    off = q.attach();
  q.add({ id: "m", text: "Lage", priority: "normal" });
  q.shown("m");
  vi.advanceTimersByTime(1000);
  off();
  const off2 = q.attach();
  q.add({ id: "m", text: "Lage", priority: "normal" });
  expect(q.snapshot()).toBeNull();
  vi.advanceTimersByTime(10000);
  expect(q.snapshot()).toBeNull();
  off2();
});
it.each([
  [1000, 1000, false],
  [500, 500, false],
  [499, 200, true],
  [250, 200, true],
  [200, 200, true],
  [100, 100, true],
  [50, 50, true],
])(
  "verwendet dieselbe metrische Rundung bei %s m Referenzdistanz",
  (distance, display, visible) => {
    const scale = metricScale(distance);
    expect(scale.meters).toBe(display);
    expect(scale.markers).toBe(visible);
    expect(scale.pixels).toBeCloseTo(
      (SCALE_REFERENCE_PX * display) / distance,
      8,
    );
  },
);
it.each([47.3, 52.52, 54.85])(
  "fokussiert bei Breite %s in das metrische 200-m-Intervall",
  (latitude) => {
    const zoom = markerFocusZoom(latitude),
      actual =
        (2 * Math.PI * 6371008.8 * Math.cos((latitude * Math.PI) / 180) * 100) /
        (512 * 2 ** zoom);
    expect(actual).toBeCloseTo(250, 7);
    expect(metricScale(actual).meters).toBe(200);
    expect(metricScale(actual * 2).markers).toBe(false);
  },
);
