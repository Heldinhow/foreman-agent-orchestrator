import { afterEach } from "bun:test";
import { removeTempDirs } from "./temp.ts";

afterEach(removeTempDirs);
