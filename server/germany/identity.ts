import { z } from "zod";

const identitySchema = z.object({
  version: z.literal("11.0"),
  import_date: z.string().datetime(),
  data_date: z.string().datetime(),
  bbox: z.array(z.number().finite()).length(4),
  profiles: z
    .array(z.object({ name: z.string() }))
    .min(1)
    .refine((profiles) => profiles.some((p) => p.name === "car")),
  elevation: z.boolean(),
  encoded_values: z
    .record(z.string(), z.array(z.string()))
    .refine(
      (values) => "car_access" in values && "car_average_speed" in values,
    ),
});
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b, "en"))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
/** GraphHopper exposes import identity, not a PBF hash. The controlled pipeline binds it to the hashed package. */
export function assertGraphRuntimeIdentity(expected: unknown, actual: unknown) {
  const a = identitySchema.safeParse(expected),
    b = identitySchema.safeParse(actual);
  if (
    !a.success ||
    !b.success ||
    JSON.stringify(canonical(a.data)) !== JSON.stringify(canonical(b.data))
  )
    throw Error(
      "Routingdienst passt nicht zum freigegebenen Geodatenpaket. Importkennung und Straßenprofil prüfen.",
    );
}
