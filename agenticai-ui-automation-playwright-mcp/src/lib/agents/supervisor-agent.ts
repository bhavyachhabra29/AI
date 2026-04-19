import { generateText } from "ai";
import { model } from "../model";
import { maskSensitive } from "../mask";
import { BrowserManager } from "../browser-manager";
import {
  Instruction,
  ActionProgress,
  ExtractedData,
  ActionSummaryRow,
  ExecutionResult,
  ScreenshotMessage,
} from "../types";
import { runNavigatorAgent } from "./navigator-agent";
import { runExtractorAgent } from "./extractor-agent";
import { runActionAgent } from "./action-agent";

export async function runSupervisorAgent(
  instructions: Instruction[],
  onProgress: (progress: ActionProgress) => void,
  onExtraction: (data: ExtractedData) => void,
  onSummary: (summary: ActionSummaryRow[]) => void,
  onScreenshot?: (screenshot: ScreenshotMessage) => void
): Promise<ExecutionResult> {
  const browser = new BrowserManager();
  const startedAt = new Date().toISOString();
  const allProgress: ActionProgress[] = [];
  const allExtractions: ExtractedData[] = [];
  const summaryRows: ActionSummaryRow[] = [];

  const trackProgress = (p: ActionProgress) => {
    const masked: ActionProgress = {
      ...p,
      description: maskSensitive(p.description),
      details: p.details ? maskSensitive(p.details) : p.details,
      error: p.error ? maskSensitive(p.error) : p.error,
    };
    allProgress.push(masked);
    onProgress(masked);
  };

  const trackExtraction = (d: ExtractedData) => {
    allExtractions.push(d);
    onExtraction(d);
  };

  const captureScreenshot = async (step: number) => {
    if (!onScreenshot) return;
    try {
      const buf = await browser.screenshot();
      onScreenshot({
        step,
        imageBase64: buf.toString("base64"),
        timestamp: new Date().toISOString(),
      });
    } catch {
      // Ignore screenshot errors
    }
  };

  try {
    await browser.launch();
    trackProgress({
      step: 0,
      status: "completed",
      description: "Browser launched successfully",
      agent: "supervisor",
      timestamp: new Date().toISOString(),
    });
    await captureScreenshot(0);

    for (let i = 0; i < instructions.length; i++) {
      const instruction = instructions[i];
      const stepStart = Date.now();

      trackProgress({
        step: instruction.step,
        status: "running",
        description: maskSensitive(`Step ${instruction.step}: ${instruction.description}`),
        agent: "supervisor",
        timestamp: new Date().toISOString(),
      });

      try {
        const delegation = await generateText({
          model,
          system: `You are a supervisor agent managing UI automation tasks.
You must delegate each instruction to the right specialist agent.
Choose exactly ONE agent for this instruction:
- "navigator" for going to URLs, opening pages
- "extractor" for reading/extracting content, field values, data from pages
- "action" for clicking, typing, filling forms, selecting, scrolling, interacting with UI elements
Respond with just the agent name.`,
          prompt: `Instruction: "${instruction.description}" (action type: ${instruction.action})
Which agent should handle this?`,
        });

        const agentChoice = delegation.text.toLowerCase().trim();
        let result: { success: boolean; details: string };

        if (
          agentChoice.includes("navigator") ||
          instruction.action === "navigate"
        ) {
          result = await runNavigatorAgent(browser, instruction.description, (p) =>
            trackProgress({ ...p, step: instruction.step })
          );
        } else if (
          agentChoice.includes("extractor") ||
          instruction.action === "extract"
        ) {
          const extractResult = await runExtractorAgent(
            browser,
            instruction.description,
            (p) => trackProgress({ ...p, step: instruction.step }),
            trackExtraction
          );
          result = {
            success: extractResult.success,
            details: extractResult.details,
          };
        } else {
          result = await runActionAgent(browser, instruction.description, (p) =>
            trackProgress({ ...p, step: instruction.step })
          );
        }

        const duration = Date.now() - stepStart;

        // Capture screenshot after each step
        await captureScreenshot(instruction.step);

        summaryRows.push({
          step: instruction.step,
          action: instruction.action,
          target: instruction.target ?? instruction.description,
          status: result.success ? "success" : "failed",
          agent: agentChoice.includes("navigator")
            ? "navigator"
            : agentChoice.includes("extractor")
            ? "extractor"
            : "action",
          duration: `${duration}ms`,
          details: maskSensitive(result.details),
        });

        trackProgress({
          step: instruction.step,
          status: "completed",
          description: `Step ${instruction.step} completed`,
          agent: "supervisor",
          timestamp: new Date().toISOString(),
          details: maskSensitive(result.details),
        });
      } catch (error) {
        const duration = Date.now() - stepStart;
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`[Supervisor] Step ${instruction.step} failed:`, error);

        summaryRows.push({
          step: instruction.step,
          action: instruction.action,
          target: instruction.target ?? instruction.description,
          status: "failed",
          agent: "supervisor",
          duration: `${duration}ms`,
          details: maskSensitive(errMsg),
        });

        trackProgress({
          step: instruction.step,
          status: "failed",
          description: `Step ${instruction.step} failed`,
          agent: "supervisor",
          timestamp: new Date().toISOString(),
          error: maskSensitive(errMsg),
        });
      }
    }

    // Supervisor review
    trackProgress({
      step: instructions.length + 1,
      status: "running",
      description: "Supervisor reviewing results...",
      agent: "supervisor",
      timestamp: new Date().toISOString(),
    });

    const review = await generateText({
      model,
      system:
        "You are a supervisor reviewing the results of UI automation tasks. Provide a brief summary.",
      prompt: `Review these results:\n${JSON.stringify(summaryRows, null, 2)}\n\nProvide a 1-2 sentence summary.`,
    });

    trackProgress({
      step: instructions.length + 1,
      status: "completed",
      description: `Review: ${review.text}`,
      agent: "supervisor",
      timestamp: new Date().toISOString(),
    });

    onSummary(summaryRows);

    const hasFailures = summaryRows.some((r) => r.status === "failed");

    return {
      sessionId: crypto.randomUUID(),
      status: hasFailures ? "partial" : "completed",
      progress: allProgress,
      extractedData: allExtractions,
      summary: summaryRows,
      startedAt,
      completedAt: new Date().toISOString(),
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("[Supervisor] Fatal error:", error);
    trackProgress({
      step: 0,
      status: "failed",
      description: "Fatal error",
      agent: "supervisor",
      timestamp: new Date().toISOString(),
      error: errMsg,
    });

    return {
      sessionId: crypto.randomUUID(),
      status: "failed",
      progress: allProgress,
      extractedData: allExtractions,
      summary: summaryRows,
      startedAt,
      completedAt: new Date().toISOString(),
    };
  } finally {
    await browser.close();
  }
}
