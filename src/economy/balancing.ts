import { bt, mt, vt, extensions } from "../catalog";
import { euro, sumCents } from "../money";
import {
  bookMoney,
  fundingTick,
  ledgerBalance,
  type MoneyState,
} from "./ledger";
import { ECONOMY_PRICES } from "./prices";
import { newEconomy } from "./schema";

/** Transparent affordability model, not a claim that real missions finish on a timetable.
 * Inputs deliberately include zero missions. Actual travel and dispatch are measured separately by the lab.
 */
export function economyBalanceAudit() {
  const first = bt("fire").price + vt("tsf").price;
  const cases = [
    {
      id: "entry",
      name: "Einstieg: Feuerwache und TSF-W",
      initial: ECONOMY_PRICES.start,
      spending: first,
      goal: vt("lf").price,
      requiredLevel: vt("lf").level,
      callsPerHour: 1,
    },
    {
      id: "expansion",
      name: "Früher Ausbau: eigener Rettungsdienst",
      initial: ECONOMY_PRICES.start,
      spending: first + vt("lf").price,
      goal: bt("ems").price + vt("rtw").price,
      requiredLevel: Math.max(bt("ems").level, vt("rtw").level),
      callsPerHour: 1,
    },
    {
      id: "medical",
      name: "Rettungsdienst: Notarzt ergänzen",
      initial: bt("ems").price + vt("rtw").price,
      spending: bt("ems").price + vt("rtw").price,
      goal: extensions.find((e) => e.id === "doctor")!.price + vt("nef").price,
      requiredLevel: vt("nef").level,
      callsPerHour: 1,
    },
    {
      id: "specialist",
      name: "Spezialisierung: Drehleiter",
      initial: ECONOMY_PRICES.start,
      spending: first + vt("lf").price,
      goal: vt("dlk").price,
      requiredLevel: vt("dlk").level,
      callsPerHour: 2,
    },
    {
      id: "advanced",
      name: "Große Leitstelle: Luftrettung ergänzen",
      initial: euro(1000000),
      spending: 0,
      goal: bt("heli").price + vt("rth").price,
      requiredLevel: Math.max(bt("heli").level, vt("rth").level),
      callsPerHour: 2,
    },
    {
      id: "absence",
      name: "Leeres Budget, keine Einsätze, 30 Tage abwesend",
      initial: 0,
      spending: 0,
      goal: vt("tsf").price,
      requiredLevel: vt("tsf").level,
      callsPerHour: 0,
    },
  ];
  return cases.map((c) => {
    const s: MoneyState = {
      money: c.initial,
      time: 0,
      generation: `balance-${c.id}`,
      desk: { sequence: 0 },
      economy: newEconomy(0, c.initial),
      receipts: [],
      journal: [],
    };
    if (c.spending) bookMoney(s, -c.spending, "Modell: vorhandene Ausstattung");
    const reserve = s.money;
    let completed = 0,
      payments = 0;
    const fixedPayment = mt("bin").reward;
    while (s.money < c.goal && s.time < 86400 * 30) {
      s.time += 900;
      fundingTick(s);
      const expected = Math.floor((s.time * c.callsPerHour) / 3600);
      while (completed < expected) {
        bookMoney(s, fixedPayment, "Modell: feste Einsatzabrechnung");
        payments = sumCents([payments, fixedPayment]);
        completed++;
      }
    }
    if (s.money < c.goal || ledgerBalance(s) !== s.money)
      throw Error(`Nicht tragfähiges Wirtschaftsmodell: ${c.id}`);
    const secondsToGoal = s.time,
      incomeCents = s.economy!.fundingPaidCents + payments;
    bookMoney(s, -c.goal, "Modell: nächste Anschaffung");
    const nextReserve = s.money;
    if (c.id === "absence") {
      s.time = 30 * 86400;
      fundingTick(s);
    }
    return {
      ...c,
      currency: "EUR",
      unit: "cent",
      reserve,
      nextReserve,
      secondsToGoal,
      incomeCents,
      fundingCents: incomeCents - payments,
      missionPaymentsCents: payments,
      completed,
      fixedPaymentCents: fixedPayment,
      finalCents: s.money,
    };
  });
}
