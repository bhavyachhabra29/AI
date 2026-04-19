import { Instruction, UseCase } from "./types";

/**
 * Parse free-text instructions into structured Instruction objects.
 * Supports numbered lists, bullet points, or plain lines.
 */
export function parseTextInstructions(text: string): Instruction[] {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const instructions: Instruction[] = [];
  let step = 1;

  for (const line of lines) {
    // Remove leading numbering like "1.", "1)", "- ", "* "
    const cleaned = line.replace(/^(\d+[\.\)]\s*|[-*]\s*)/, "").trim();
    if (!cleaned) continue;

    const instruction = classifyInstruction(cleaned, step);
    instructions.push(instruction);
    step++;
  }

  return instructions;
}

/**
 * Parse a JSON file's instructions array.
 */
export function parseJsonInstructions(json: unknown): UseCase[] {
  const obj = json as Record<string, unknown>;

  // New format: { use_cases: [{ id, name?, steps: [...] }] }
  if (
    typeof obj === "object" &&
    obj !== null &&
    "use_cases" in obj &&
    Array.isArray(obj.use_cases)
  ) {
    return obj.use_cases.map((uc: Record<string, unknown>, i: number) => ({
      id: (uc.id as string) ?? `use-case-${i + 1}`,
      name: uc.name as string | undefined,
      steps: Array.isArray(uc.steps)
        ? uc.steps.map((item: unknown, j: number) => normalizeInstruction(item, j + 1))
        : [],
    }));
  }

  // Legacy format: { instructions: [...] } or plain array
  let instructions: Instruction[];
  if (Array.isArray(json)) {
    instructions = json.map((item, i) => normalizeInstruction(item, i + 1));
  } else if (
    typeof obj === "object" &&
    obj !== null &&
    "instructions" in obj &&
    Array.isArray(obj.instructions)
  ) {
    instructions = obj.instructions.map((item: unknown, i: number) =>
      normalizeInstruction(item, i + 1)
    );
  } else {
    throw new Error(
      "Invalid JSON format. Expected { use_cases: [...] }, { instructions: [...] }, or an array."
    );
  }

  // Wrap legacy format into a single use case
  return [{ id: "default", name: "Default", steps: instructions }];
}

function normalizeInstruction(item: unknown, step: number): Instruction {
  if (typeof item === "string") {
    return classifyInstruction(item, step);
  }
  if (typeof item === "object" && item !== null) {
    const obj = item as Record<string, unknown>;
    return {
      step: (obj.step as number) ?? step,
      action: (obj.action as string) ?? "unknown",
      target: obj.target as string | undefined,
      value: obj.value as string | undefined,
      description: (obj.description as string) ?? JSON.stringify(obj),
    };
  }
  return { step, action: "unknown", description: String(item) };
}

function classifyInstruction(text: string, step: number): Instruction {
  const lower = text.toLowerCase();

  if (lower.startsWith("go to") || lower.startsWith("navigate to") || lower.startsWith("open ")) {
    const urlMatch = text.match(/https?:\/\/[^\s]+/);
    return {
      step,
      action: "navigate",
      target: urlMatch?.[0] ?? text.replace(/^(go to|navigate to|open)\s+/i, "").trim(),
      description: text,
    };
  }

  if (lower.includes("extract") || lower.includes("get the") || lower.includes("read the") || lower.includes("scrape")) {
    return {
      step,
      action: "extract",
      target: text,
      description: text,
    };
  }

  if (lower.includes("click") || lower.includes("press") || lower.includes("tap")) {
    const btnMatch = text.match(/['"]([^'"]+)['"]/);
    return {
      step,
      action: "click",
      target: btnMatch?.[1] ?? text,
      description: text,
    };
  }

  if (lower.includes("type") || lower.includes("enter") || lower.includes("fill") || lower.includes("input")) {
    const valueMatch = text.match(/['"]([^'"]+)['"]/);
    return {
      step,
      action: "input",
      value: valueMatch?.[1],
      target: text,
      description: text,
    };
  }

  if (lower.includes("wait")) {
    return { step, action: "wait", description: text };
  }

  if (lower.includes("screenshot") || lower.includes("capture")) {
    return { step, action: "screenshot", description: text };
  }

  if (lower.includes("select") || lower.includes("choose") || lower.includes("dropdown")) {
    return { step, action: "select", target: text, description: text };
  }

  if (lower.includes("scroll")) {
    return { step, action: "scroll", description: text };
  }

  // Default: let the supervisor agent figure it out
  return { step, action: "general", description: text };
}
