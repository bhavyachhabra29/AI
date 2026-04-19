import { NextRequest, NextResponse } from "next/server";
import {
  parseTextInstructions,
  parseJsonInstructions,
} from "@/lib/instruction-parser";
import { runSupervisorAgent } from "@/lib/agents/supervisor-agent";
import { ActionProgress, ExtractedData, ActionSummaryRow, StreamMessage, ScreenshotMessage, UseCase } from "@/lib/types";

export const maxDuration = 300; // 5 minutes max for long automations

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, json: jsonInstructions } = body as {
      text?: string;
      json?: unknown;
    };

    // Parse instructions into use cases
    let useCases: UseCase[];
    if (jsonInstructions) {
      useCases = parseJsonInstructions(jsonInstructions);
    } else if (text) {
      const steps = parseTextInstructions(text);
      useCases = [{ id: "default", name: "Default", steps }];
    } else {
      return NextResponse.json(
        { error: "No instructions provided" },
        { status: 400 }
      );
    }

    const totalSteps = useCases.reduce((sum, uc) => sum + uc.steps.length, 0);
    if (totalSteps === 0) {
      return NextResponse.json(
        { error: "No valid instructions found" },
        { status: 400 }
      );
    }

    // Create a ReadableStream to stream progress to the client
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (message: StreamMessage) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(message)}\n\n`)
          );
        };

        try {
          for (const useCase of useCases) {
            // Notify client of use case start
            send({
              type: "progress",
              data: {
                step: 0,
                status: "running",
                description: `Starting use case: ${useCase.name || useCase.id}`,
                agent: "supervisor",
                timestamp: new Date().toISOString(),
              },
            });

            const result = await runSupervisorAgent(
              useCase.steps,
              (progress: ActionProgress) => {
                send({ type: "progress", data: progress });
              },
              (extraction: ExtractedData) => {
                send({ type: "extraction", data: extraction });
              },
              (summary: ActionSummaryRow[]) => {
                send({ type: "summary", data: summary });
              },
              (screenshot: ScreenshotMessage) => {
                send({ type: "screenshot", data: screenshot });
              }
            );

            send({ type: "complete", data: result });
          }
        } catch (error) {
          console.error("[API] Execution error:", error);
          const errMsg =
            error instanceof Error ? error.message : String(error);
          send({ type: "error", data: { message: errMsg } });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("[API] Route error:", error);
    const errMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
