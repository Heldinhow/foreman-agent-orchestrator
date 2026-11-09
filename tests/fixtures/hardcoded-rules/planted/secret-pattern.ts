// A planted hardcoded rule: the static test must find it. Foreman must never do this.
export const secretPatterns = [/ghp_[A-Za-z0-9]+/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/];
