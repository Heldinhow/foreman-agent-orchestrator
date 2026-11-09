// A planted hardcoded rule: the static test must find it. Foreman must never do this.
import { z } from "zod";

export const Mode = z.string().default("anything");
