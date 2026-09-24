import type { ControlledTask } from "@jolty/core";
import type { Page } from "playwright";

export interface ResearchMultistepFlow {
  id: string;
  site: string;
  url: string;
  labels: readonly {
    goal: string;
    action: "click" | "type" | "select";
    target: string;
  }[];
  prepare?(page: Page): Promise<void>;
  buildTask(page: Page): Promise<ControlledTask>;
  postcondition(page: Page): Promise<boolean>;
}
