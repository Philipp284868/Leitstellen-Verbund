import { Flame, Cross, Shield, Wrench, Waves, Radio } from "lucide-react";
export function IncidentIcon({ org }: { org: string }) {
  const Icon =
    org === "Feuerwehr"
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
