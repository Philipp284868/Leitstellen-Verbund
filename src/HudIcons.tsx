import {
  Flame,
  Cross,
  Shield,
  Wrench,
  Waves,
  Radio,
  Phone,
  Layers,
} from "lucide-react";
import type { IncidentKind } from "./mission-presentation";
export function IncidentIcon({
  org,
  category,
}: {
  org?: string;
  category?: IncidentKind;
}) {
  const categories = {
    unknown: Phone,
    mixed: Layers,
    technical: Wrench,
    fire: Flame,
    medical: Cross,
    police: Shield,
    water: Waves,
    other: Radio,
  };
  const Icon = category
    ? categories[category]
    : org === "Unbekannt"
      ? Phone
      : org === "Feuerwehr"
        ? Flame
        : org === "Rettungsdienst"
          ? Cross
          : org === "Polizei"
            ? Shield
            : org === "THW"
              ? Wrench
              : org === "Wasserrettung"
                ? Waves
                : Radio;
  return <Icon aria-hidden="true" />;
}
