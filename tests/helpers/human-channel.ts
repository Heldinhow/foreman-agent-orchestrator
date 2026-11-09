import {
  confirmWithNonce,
  HumanChannelRefusal,
  type HumanChannel,
} from "../../src/approvals/human-channel.ts";

export interface TestHumanChannelOptions {
  /** Refuse as the real channel does under the Worker marker. */
  worker?: boolean;
  /** Refuse as the real channel does with no controlling terminal. */
  noTerminal?: boolean;
  /** What the human types, given the nonce shown. Defaults to the right nonce. */
  type?: (nonce: string) => string | undefined;
  /** Runs after the display and before the typed answer. */
  beforeTyping?: () => void;
}

export type TestHumanChannel = HumanChannel & {
  /** Everything written to the fake terminal. */
  readonly screen: string[];
};

/**
 * Stands in for the operator's terminal and the process checks, and nothing else: the nonce
 * and its binding are the real code. Only the test suite can reach this file.
 */
export function createTestHumanChannel(options: TestHumanChannelOptions = {}): TestHumanChannel {
  const screen: string[] = [];

  function refuseWorker() {
    if (options.worker) throw new HumanChannelRefusal("test channel: under the Worker marker");
  }

  return {
    name: "test",
    screen,
    refuseWorker,
    confirm(render) {
      refuseWorker();
      if (options.noTerminal) throw new HumanChannelRefusal("test channel: no terminal");
      const displayHash = confirmWithNonce(
        {
          write: (text) => void screen.push(text),
          readLine: () => {
            options.beforeTyping?.();
            const nonce = /nonce: (\S+)/.exec(screen.at(-1) ?? "")?.[1] ?? "";
            return options.type ? options.type(nonce) : nonce;
          },
        },
        render,
      );
      return { channel: "test", displayHash };
    },
  };
}
