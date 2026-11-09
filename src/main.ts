#!/usr/bin/env bun
import { createApp } from "./cli/app.ts";

const app = createApp({
  clock: { now: () => new Date() },
  terminal: {
    writeOut: (text) => void process.stdout.write(text),
    writeErr: (text) => void process.stderr.write(text),
  },
});

process.exitCode = await app.exec(process.argv.slice(2));
