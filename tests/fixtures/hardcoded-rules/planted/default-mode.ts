// A planted hardcoded rule: the static test must find it. Foreman must never do this.
export const modeOf = (configured?: string) => configured ?? "propose";
