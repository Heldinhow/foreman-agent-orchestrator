/** A problem with config or its location. The CLI exits with the invalid-config code. */
export class ConfigError extends Error {}

export interface ConfigIssue {
  file: string;
  /** Dotted path to the key. Absent when the whole file is the problem, as with a syntax error. */
  key?: string;
  reason: string;
}

function formatIssue({ file, key, reason }: ConfigIssue): string {
  return key === undefined ? `${file}: ${reason}` : `${file}: ${key}: ${reason}`;
}

/** One or more invalid config values, each naming the file, key and reason. */
export class ConfigInvalidError extends ConfigError {
  readonly issues: readonly ConfigIssue[];

  constructor(issues: readonly ConfigIssue[]) {
    super(`invalid config\n${issues.map((issue) => `  ${formatIssue(issue)}`).join("\n")}`);
    this.issues = issues;
  }
}
