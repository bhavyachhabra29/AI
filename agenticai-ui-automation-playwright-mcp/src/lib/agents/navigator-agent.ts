import { generateText, tool, stepCountIs } from "ai";
import { z } from "zod";
import { model } from "../model";
import { BrowserManager } from "../browser-manager";
import { ActionProgress } from "../types";

export async function runNavigatorAgent(
  browser: BrowserManager,
  instruction: string,
  onProgress: (progress: ActionProgress) => void
): Promise<{ success: boolean; details: string }> {
  const startTime = Date.now();

  onProgress({
    step: 0,
    status: "running",
    description: `Navigator: ${instruction}`,
    agent: "navigator",
    timestamp: new Date().toISOString(),
  });

  const result = await generateText({
    model,
    system: `You are a navigation agent. Your job is to navigate web browsers to URLs.
Given an instruction, use the navigate tool to go to the specified URL.
If the instruction mentions a URL, navigate to it directly.
If the instruction mentions a site name, construct the most likely URL.
Always call the navigate tool exactly once.`,
    prompt: instruction,
    tools: {
      navigate: tool({
        description: "Navigate the browser to a URL",
        inputSchema: z.object({
          url: z.string().describe("The URL to navigate to"),
        }),
        execute: async ({ url }) => {
          const fullUrl = url.startsWith("http") ? url : `https://${url}`;
          const result = await browser.navigate(fullUrl);
          return result;
        },
      }),
    },
    stopWhen: stepCountIs(3),
  });

  const duration = Date.now() - startTime;
  const details = result.text || "Navigation completed";

  onProgress({
    step: 0,
    status: "completed",
    description: `Navigator: ${instruction}`,
    agent: "navigator",
    timestamp: new Date().toISOString(),
    details: `${details} (${duration}ms)`,
  });

  return { success: true, details };
}
