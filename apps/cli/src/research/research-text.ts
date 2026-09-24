import { safeText } from "../dataset.ts";

const email = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi;

export function safeResearchText(value: string): string {
  return safeText(value.replace(email, "[email address]"));
}
