import { generateText, tool, stepCountIs } from "ai";
import { z } from "zod";
import { model } from "../model";
import { maskSensitive } from "../mask";
import { BrowserManager } from "../browser-manager";
import { ActionProgress } from "../types";

export async function runActionAgent(
  browser: BrowserManager,
  instruction: string,
  onProgress: (progress: ActionProgress) => void
): Promise<{ success: boolean; details: string }> {
  const startTime = Date.now();

  onProgress({
    step: 0,
    status: "running",
    description: `Action: ${maskSensitive(instruction)}`,
    agent: "action",
    timestamp: new Date().toISOString(),
  });

  const result = await generateText({
    model,
    system: `You are a UI interaction agent. Your job is to perform actions on web pages like clicking buttons, filling forms, selecting options, and scrolling.
Based on the instruction, use the appropriate tool.
For clicking, identify the button text or selector.
For filling, identify the field and the value to enter.
For selecting, identify the dropdown and the option.
You may need to chain multiple actions to complete a task.`,
    prompt: instruction,
    tools: {
      click: tool({
        description:
          "Click on an element by its text content, CSS selector, or button name",
        inputSchema: z.object({
          selector: z
            .string()
            .describe("The text, CSS selector, or name of the element to click"),
        }),
        execute: async ({ selector }) => {
          return await browser.click(selector);
        },
      }),
      fill: tool({
        description: "Fill a text input, textarea, or form field",
        inputSchema: z.object({
          selector: z
            .string()
            .describe(
              "The label, placeholder, name, or CSS selector of the input field"
            ),
          value: z.string().describe("The value to type into the field"),
        }),
        execute: async ({ selector, value }) => {
          const result = await browser.fill(selector, value);
          return maskSensitive(result);
        },
      }),
      select: tool({
        description: "Select an option from a dropdown/select element",
        inputSchema: z.object({
          selector: z.string().describe("CSS selector of the select element"),
          value: z.string().describe("The option value to select"),
        }),
        execute: async ({ selector, value }) => {
          return await browser.select(selector, value);
        },
      }),
      scroll: tool({
        description: "Scroll the page up or down",
        inputSchema: z.object({
          direction: z.enum(["up", "down"]).describe("Scroll direction"),
          amount: z
            .number()
            .optional()
            .describe("Pixels to scroll (default 500)"),
        }),
        execute: async ({ direction, amount }) => {
          return await browser.scroll(direction, amount);
        },
      }),
      waitForElement: tool({
        description: "Wait for a specific element to appear on the page",
        inputSchema: z.object({
          selector: z.string().describe("CSS selector to wait for"),
        }),
        execute: async ({ selector }) => {
          return await browser.waitForSelector(selector);
        },
      }),
    },
    stopWhen: stepCountIs(5),
  });

  const duration = Date.now() - startTime;
  const details = maskSensitive(result.text || "Action completed");

  onProgress({
    step: 0,
    status: "completed",
    description: `Action: ${maskSensitive(instruction)}`,
    agent: "action",
    timestamp: new Date().toISOString(),
    details: `${details} (${duration}ms)`,
  });

  return { success: true, details };
}
