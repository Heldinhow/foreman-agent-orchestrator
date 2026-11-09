// A planted hardcoded rule: the static test must find it. Foreman must never do this.
export const neverPassed = new Set(["GITHUB_TOKEN", "SSH_AUTH_SOCK"]);
