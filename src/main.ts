#!/usr/bin/env bun
import { createApp } from "./cli/app.ts";
import { shippedDefaultsFile } from "./policy/shipped-defaults.ts";

const app = createApp({
  clock: { now: () => new Date() },
  terminal: {
    writeOut: (text) => void process.stdout.write(text),
    writeErr: (text) => void process.stderr.write(text),
  },
  env: process.env,
  cwd: process.cwd(),
  policyDefaultsFile: shippedDefaultsFile(import.meta.dir),
});

process.exitCode = await app.exec(process.argv.slice(2));
