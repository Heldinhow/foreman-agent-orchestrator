import { createHash, createHmac, randomBytes } from "node:crypto";

/** Proof that a human confirmed one exact display. */
export interface HumanConfirmation {
  channel: string;
  displayHash: string;
}

/** A route Foreman trusts to carry a decision, because it authenticates a human. */
export interface HumanChannel {
  /** The name recorded in the Ledger. */
  readonly name: string;
  /** Throws `HumanChannelRefusal` if this command may be running for a Worker. */
  refuseWorker(): void;
  /**
   * Shows `render()` to the human and returns once they've confirmed it, or throws.
   * `render` is called again after they answer, so it must read the current state: if the
   * result differs from what was shown, the answer no longer counts.
   */
  confirm(render: () => string): HumanConfirmation;
}

export class HumanChannelRefusal extends Error {
  override readonly name = "HumanChannelRefusal";
}

export interface NonceTerminal {
  write(text: string): void;
  /** One line typed by the human, or undefined at the end of input. */
  readLine(): string | undefined;
}

/**
 * Shows a display with a fresh nonce, and returns the display's hash once the human has typed
 * the nonce. The nonce is derived from that hash under a key made for this call alone, so it
 * is random per invocation and is correct only for this exact display.
 */
export function confirmWithNonce(terminal: NonceTerminal, render: () => string): string {
  const key = randomBytes(32);
  const nonceFor = (displayHash: string) =>
    createHmac("sha256", key).update(displayHash).digest("hex").slice(0, 8);

  const shown = terminalSafe(render());
  const shownNonce = nonceFor(sha256(shown));
  terminal.write(`${shown}\n\nTo confirm, type this nonce: ${shownNonce}\n> `);

  const typed = terminal.readLine()?.trim();
  if (typed === undefined) throw new HumanChannelRefusal("no nonce was typed");

  // Rendered again before any verdict, so a request that's gone refuses with its own reason.
  const currentHash = sha256(terminalSafe(render()));
  if (typed === nonceFor(currentHash)) return currentHash;
  if (typed === shownNonce) {
    throw new HumanChannelRefusal("what you confirmed changed after it was shown");
  }
  throw new HumanChannelRefusal("wrong nonce");
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/**
 * Recorded values can come from a Worker's work, and a control sequence or a bidirectional
 * override in one could redraw the display, so the human would confirm something else.
 */
function terminalSafe(text: string): string {
  return text.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, "?");
}
