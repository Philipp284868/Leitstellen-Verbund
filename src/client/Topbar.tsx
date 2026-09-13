import {
  Clock,
  Wallet,
  Award,
  Sun,
  Cloud,
  CloudRain,
  CloudLightning,
  CloudFog,
  Snowflake,
  Wind,
  X,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Save } from "../shared/model";
import { progress } from "../shared/progression";
import { credits } from "./ui";
import { useNetwork } from "./network";
import { weatherNames } from "../simulation/weather";
import { situationNames } from "../simulation/world-situation";
import { WorldSituationView, PublicAlarmList } from "./WorldSituationView";
import { HudNavigation } from "./HudNavigation";
export function Topbar({
  s,
  onMenu,
  panel,
  onSearch,
  onNavigationOpen,
}: {
  s: Save;
  onMenu: () => void;
  panel: (id: string) => void;
  onSearch: () => void;
  onNavigationOpen: () => void;
}) {
  const [situation, setSituation] = useState(false);
  const weatherTrigger = useRef<HTMLButtonElement>(null);
  const { alarms } = useNetwork();
  const xp = progress(s.xp),
    weather = s.environment;
  const elevatedSituation =
    s.worldSituation && !["quiet", "normal"].includes(s.worldSituation.profile)
      ? situationNames[s.worldSituation.profile]
      : undefined;
  const WeatherIcon = !weather
    ? Cloud
    : {
        sun: Sun,
        heat: Sun,
        cloud: Cloud,
        rain: CloudRain,
        "heavy-rain": CloudRain,
        storm: CloudLightning,
        gale: Wind,
        hurricane: Wind,
        fog: CloudFog,
        snow: Snowflake,
        ice: Snowflake,
        frost: Snowflake,
      }[weather.kind];
  useEffect(() => {
    if (!situation) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        setSituation(false);
        weatherTrigger.current?.focus();
      }
    };
    window.addEventListener("keydown", close, true);
    return () => window.removeEventListener("keydown", close, true);
  }, [situation]);
  return (
    <header className="topbar control-topbar">
      <HudNavigation
        panel={panel}
        onOpen={() => {
          setSituation(false);
          onNavigationOpen();
        }}
        onSearch={() => {
          setSituation(false);
          onSearch();
        }}
        onMenu={onMenu}
      />
      <div className="hud-status" aria-label="Leitstellenstatus">
        <div className="status-tile time-tile">
          <Clock />
          <span>
            <small>Serverzeit</small>
            <time>
              {new Date(s.time * 1000).toLocaleTimeString("de-DE", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
          </span>
        </div>
        <button
          ref={weatherTrigger}
          className="status-tile weather-tile"
          aria-label="Welt- & Wetterlage"
          title={
            elevatedSituation
              ? `Weltlage: ${elevatedSituation}`
              : "Welt- & Wetterlage"
          }
          aria-expanded={situation}
          onClick={() => setSituation(!situation)}
        >
          <WeatherIcon />
          <span>
            <strong>
              {weather
                ? `${weather.temperature.toLocaleString("de-DE")} °C`
                : "—"}
            </strong>
            <small>
              {weather ? weatherNames[weather.kind] : "Wetter nicht verfügbar"}
              {elevatedSituation && ` · ${elevatedSituation}`}
              {!!alarms.length &&
                ` · ${alarms.length} Warnung${alarms.length === 1 ? "" : "en"}`}
            </small>
          </span>
          {(!!alarms.length || elevatedSituation) && (
            <TriangleAlert size={16} />
          )}
        </button>
        <button
          className="status-tile money-tile"
          aria-label="Budget und Geldjournal"
          onClick={() => panel("archive")}
        >
          <Wallet />
          <span>
            <small>Budget</small>
            <strong title={credits(s.money)}>{credits(s.money)}</strong>
          </span>
        </button>
        <button
          className="status-tile level-tile"
          aria-label="Fortschritt"
          onClick={() => panel("progress")}
        >
          <Award />
          <span>
            <span className="xp-heading">
              <b>Fortschritt</b>
              <small>
                {xp.current.toLocaleString("de-DE")} /{" "}
                {xp.required.toLocaleString("de-DE")} XP
              </small>
            </span>
            <span className="xp-level">
              Level {xp.level.toLocaleString("de-DE")}
            </span>
            <progress
              aria-label="Erfahrung bis zum nächsten Level"
              value={xp.current}
              max={xp.required}
            />
          </span>
        </button>
      </div>
      {situation && (
        <section className="status-popup" aria-label="Welt- und Wetterdetails">
          <button
            className="close"
            aria-label="Wetterdetails schließen"
            onClick={() => {
              setSituation(false);
              weatherTrigger.current?.focus();
            }}
          >
            <X size={18} />
          </button>
          <WorldSituationView s={s} />
          <PublicAlarmList alarms={alarms} />
          <div className="action-grid">
            <button
              onClick={() => {
                setSituation(false);
                panel("situation");
              }}
            >
              Lagedetails öffnen
            </button>
            <button
              onClick={() => {
                setSituation(false);
                panel("civil");
              }}
            >
              Katastrophenbereitschaft
            </button>
          </div>
        </section>
      )}
    </header>
  );
}
