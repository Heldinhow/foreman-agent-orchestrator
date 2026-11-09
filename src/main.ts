#!/usr/bin/env bun
import { createLocalHumanChannel } from "./approvals/local-channel.ts";
import { createApp } from "./cli/app.ts";
import { shippedDefaultsFile } from "./policy/shipped-defaults.ts";

const app = createApp({
  clock: { now: () => new Date() },
  terminal: {
    writeOut: (text) => void process.stdout.write(text),
    writeErr: (text) => void process.stderr.write(text),
  },
  humanChannel: createLocalHumanChannel(),
  env: process.env,
  cwd: process.cwd(),
  policyDefaultsFile: shippedDefaultsFile(import.meta.dir),
});

process.exitCode = await app.exec(process.argv.slice(2));
