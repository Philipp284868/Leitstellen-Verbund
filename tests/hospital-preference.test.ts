import { it, expect } from "vitest";
import { phaseFixture } from "./dispatch-fixture";
import { organizationCommand } from "../src/simulation/organizations";
import { selectHospital } from "../src/simulation/hospitals";
import { validate } from "../src/shared/model";
it("speichert eine bestätigte Deutschland-Klinik, weist erfundene und fremde Ziele ab und erhält die alte öffentliche Auswahl", () => {
  const s = phaseFixture("owner", "sick"),
    m = s.missions[0];
  m.control!.briefed = true;
  organizationCommand(
    s,
    {
      type: "hospital-select",
      mission: m.id,
      home: "public:way:100000",
    },
    "owner",
  );
  expect(m.organization!.hospital).toBe("public:way:100000");
  expect(selectHospital(s, m.pos, 1, m)?.id).toBe("public:way:100000");
  expect(validate(s).missions[0].organization!.hospital).toBe(
    "public:way:100000",
  );
  const previous = structuredClone(m.organization);
  for (const home of ["public:way:999999", "foreign-hospital"]) {
    expect(() =>
      organizationCommand(
        s,
        { type: "hospital-select", mission: m.id, home },
        "owner",
      ),
    ).toThrow("Klinik fehlt");
    expect(m.organization).toEqual(previous);
  }
  organizationCommand(
    s,
    {
      type: "hospital-select",
      mission: m.id,
      home: "public",
    },
    "owner",
  );
  expect(selectHospital(s, m.pos, 1, m)?.id).toBe("public:way:100000");
  organizationCommand(
    s,
    {
      type: "hospital-select",
      mission: m.id,
      home: "auto",
    },
    "owner",
  );
  expect(m.organization!.hospital).toBeUndefined();
});
