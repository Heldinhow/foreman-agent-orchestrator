import type { MachineIdentity } from "../../src/ledger/privacy.ts";

export const fixedClock = { now: () => new Date("2026-01-02T03:04:05.000Z") };

/** Fake machine values, so in-process tests never depend on the real machine. */
export const fakeIdentity: MachineIdentity = {
  home: "/nonexistent/sentinel-home",
  usernames: ["sentinel-user"],
  hostname: "sentinel-host",
};
