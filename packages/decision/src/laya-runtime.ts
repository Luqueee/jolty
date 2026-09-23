import { readFile } from "node:fs/promises";
import path from "node:path";
import { Tokenizer } from "@huggingface/tokenizers";
import { ensureBundle, type LayaConfig } from "@receptron/laya";
import * as ort from "onnxruntime-node";
import type { ModelQuestion } from "./decision.ts";

// The sequence and temperature rules follow @receptron/laya 0.1.2 (MIT).
const REVISION = "68f27dfe5a27a54fb2b1fefc432f43f972e90868";
const round4 = (value: number): number => Math.round(value * 10_000) / 10_000;

interface SpecialIds {
  cls: number;
  sep: number;
  mask: number;
  pad: number;
}

export interface LayaAnswer {
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
  input_tokens: number;
  tokenization_ms: number;
  inference_ms: number;
}

export class LayaRuntime {
  private readonly session: ort.InferenceSession;
  private readonly tokenizer: Tokenizer;
  private readonly config: LayaConfig;
  private readonly special: SpecialIds;

  private constructor(
    session: ort.InferenceSession,
    tokenizer: Tokenizer,
    config: LayaConfig,
    special: SpecialIds,
  ) {
    this.session = session;
    this.tokenizer = tokenizer;
    this.config = config;
    this.special = special;
  }

  static async load(): Promise<LayaRuntime> {
    const modelDir = await ensureBundle({ revision: REVISION });
    const readJson = async (file: string) =>
      JSON.parse(await readFile(path.join(modelDir, file), "utf8"));
    const config = (await readJson("laya_config.json")) as LayaConfig;
    const tokenizer = new Tokenizer(
      await readJson("tokenizer/tokenizer.json"),
      await readJson("tokenizer/tokenizer_config.json"),
    );
    const id = (token: string): number => {
      const value = tokenizer.token_to_id(token);
      if (value === undefined)
        throw new Error(`Laya tokenizer is missing ${token}`);
      return value;
    };
    const special = {
      cls: id("[CLS]"),
      sep: id("[SEP]"),
      mask: id("[MASK]"),
      pad: id("[PAD]"),
    };
    const session = await ort.InferenceSession.create(
      path.join(modelDir, "laya.onnx"),
      { executionProviders: ["cpu"], graphOptimizationLevel: "all" },
    );
    return new LayaRuntime(session, tokenizer, config, special);
  }

  private encode(value: string): number[] {
    return this.tokenizer.encode(value.replaceAll("[MASK]", " "), {
      add_special_tokens: false,
    }).ids;
  }

  async choose(question: ModelQuestion): Promise<LayaAnswer> {
    const tokenizeStart = performance.now();
    const { instructions, criteria } = question.questions.next_action;
    const keys = Object.keys(criteria);
    if (keys.length < 2)
      throw new Error("Laya choice needs at least two options");
    const { cls, sep, mask } = this.special;
    let header = this.encode(`choice question: ${instructions}`);
    let options = keys.map((key) => [
      mask,
      ...this.encode(` ${key}: ${criteria[key]}`).slice(0, 48),
    ]);
    const optionTokens = () =>
      options.reduce((sum, ids) => sum + ids.length, 0);
    let headerBudget = this.config.head_max_len - optionTokens();
    if (headerBudget < 16) {
      const perOption = Math.max(
        4,
        Math.floor((this.config.head_max_len - 16) / options.length),
      );
      options = options.map((ids) => ids.slice(0, perOption));
      headerBudget = this.config.head_max_len - optionTokens();
    }
    header = header.slice(0, Math.max(8, headerBudget));
    const sequence = [cls, ...header, sep];
    const markers: number[] = [];
    for (const option of options) {
      markers.push(sequence.length);
      sequence.push(...option);
    }
    sequence.push(sep);
    const room = Math.max(0, this.config.max_len - sequence.length - 1);
    const state = `{${Object.entries(question.state)
      .map(([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`)
      .join(", ")}}`;
    sequence.push(...this.encode(state).slice(0, room), sep);
    if (
      sequence.length > this.config.max_len ||
      markers.some((pos) => pos >= this.config.max_len)
    )
      throw new Error("Laya options exceed the checkpoint context limit");
    const inputIds = BigInt64Array.from(sequence, BigInt);
    const attention = new BigInt64Array(sequence.length).fill(1n);
    const markerPos = BigInt64Array.from(markers, BigInt);
    const markerMask = new Uint8Array(markers.length).fill(1);
    const tokenization_ms = performance.now() - tokenizeStart;

    const inferenceStart = performance.now();
    const output = await this.session.run({
      input_ids: new ort.Tensor("int64", inputIds, [1, sequence.length]),
      attention_mask: new ort.Tensor("int64", attention, [1, sequence.length]),
      marker_pos: new ort.Tensor("int64", markerPos, [1, markers.length]),
      marker_mask: new ort.Tensor("bool", markerMask, [1, markers.length]),
      qtype: new ort.Tensor("int64", BigInt64Array.of(0n), [1]),
    });
    const inference_ms = performance.now() - inferenceStart;
    const logits = output.logits?.data;
    if (!(logits instanceof Float32Array) || logits.length < keys.length)
      throw new Error("Laya returned invalid logits");
    const bucket =
      keys.length <= 2
        ? "2"
        : keys.length <= 5
          ? "3-5"
          : keys.length <= 10
            ? "6-10"
            : "11+";
    const temperature =
      this.config.temperature_by_options[`choice:${bucket}`] ??
      this.config.temperature[0] ??
      1;
    if (!Number.isFinite(temperature) || temperature <= 0)
      throw new Error("Laya returned an invalid temperature");
    const scaled = Array.from(
      logits.slice(0, keys.length),
      (value) => value / temperature,
    );
    const maximum = Math.max(...scaled);
    const weights = scaled.map((value) => Math.exp(value - maximum));
    const sum = weights.reduce((total, value) => total + value, 0);
    const probabilities = weights.map((weight) => weight / sum);
    const bestIndex = probabilities.indexOf(Math.max(...probabilities));
    const entropy = probabilities.reduce(
      (total, value) => total - value * Math.log(Math.max(value, 1e-12)),
      0,
    );
    return {
      choice: keys[bestIndex],
      probabilities: Object.fromEntries(
        keys.map((key, index) => [key, round4(probabilities[index])]),
      ),
      confidence: round4(1 - entropy / Math.log(keys.length)),
      input_tokens: sequence.length,
      tokenization_ms,
      inference_ms,
    };
  }

  async close(): Promise<void> {
    await this.session.release();
  }
}

export const LAYA_REVISION = REVISION;
