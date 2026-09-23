import { expect, test } from "vitest";
import { parseCodexEvents } from "./codex-adapter.ts";

test("parses constrained Codex choice and usage", () => {
  expect(
    parseCodexEvents(
      [
        JSON.stringify({ type: "thread.started" }),
        JSON.stringify({
          type: "item.completed",
          item: { type: "agent_message", text: '{"choice":"c1"}' },
        }),
        JSON.stringify({
          type: "turn.completed",
          usage: { input_tokens: 120, output_tokens: 8 },
        }),
      ].join("\n"),
    ),
  ).toEqual({ choice: "c1", usage: { input_tokens: 120, output_tokens: 8 } });
});

test("rejects missing choice", () => {
  expect(() => parseCodexEvents('{"type":"turn.completed"}')).toThrow(
    "Invalid Codex choice",
  );
});
