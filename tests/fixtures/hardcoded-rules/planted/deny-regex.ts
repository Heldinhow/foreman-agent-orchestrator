// A planted hardcoded rule: the static test must find it. Foreman must never do this.
export const isSecretFile = (path: string) => /\.env$/.test(path) || path.endsWith(".key");
