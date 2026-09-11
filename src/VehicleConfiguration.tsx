import {
  equipmentAllowed,
  equipmentKeys,
  equipmentOptions,
  equipmentProfile,
  type Equipment,
} from "./simulation/vehicle-equipment";
import { credits } from "./ui";
export function VehicleConfiguration({
  kind,
  value,
  onChange,
  disabled = false,
}: {
  kind: string;
  value: Equipment;
  onChange: (next: Equipment) => void;
  disabled?: boolean;
}) {
  const slots = value.reduce((n, k) => n + equipmentOptions[k].slots, 0),
    profile = equipmentProfile({ type: kind, equipment: value });
  return (
    <fieldset disabled={disabled} className="command-fields">
      <legend>Ausrüstung konfigurieren · {slots}/6 Zuladungsplätze</legend>
      {equipmentKeys
        .filter((k) => equipmentAllowed(kind, k))
        .map((k) => (
          <label key={k}>
            <input
              type="checkbox"
              checked={value.includes(k)}
              disabled={
                !value.includes(k) && slots + equipmentOptions[k].slots > 6
              }
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...value, k]
                    : value.filter((x) => x !== k),
                )
              }
            />
            {equipmentOptions[k].name} · +{credits(equipmentOptions[k].price)}
          </label>
        ))}
      <p>
        Wassertank {profile.water} l · B-Schlauch {profile.hoseB} m · C-Schlauch{" "}
        {profile.hoseC} m · Atemschutz {profile.breathing} Geräte
      </p>
    </fieldset>
  );
}
