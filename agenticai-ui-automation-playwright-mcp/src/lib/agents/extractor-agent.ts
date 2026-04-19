import { generateText, tool, stepCountIs } from "ai";
import { z } from "zod";
import { model } from "../model";
import { BrowserManager } from "../browser-manager";
import { ActionProgress, ExtractedData } from "../types";

export async function runExtractorAgent(
  browser: BrowserManager,
  instruction: string,
  onProgress: (progress: ActionProgress) => void,
  onExtraction: (data: ExtractedData) => void
): Promise<{ success: boolean; details: string; data?: ExtractedData }> {
  const startTime = Date.now();

  onProgress({
    step: 0,
    status: "running",
    description: `Extractor: ${instruction}`,
    agent: "extractor",
    timestamp: new Date().toISOString(),
  });

  let extractedData: ExtractedData | undefined;

  const result = await generateText({
    model,
    system: `You are a content extraction agent. Your job is to extract information from web pages.
You have tools to extract full page content, or specific field values.
Based on the instruction, decide which extraction method to use.
If asked to extract specific fields, parse the instruction to identify field names and use extractFields.
If asked to extract general content, use extractContent.
After extraction, use formatResult to provide a clean structured summary.`,
    prompt: instruction,
    tools: {
      extractContent: tool({
        description:
          "Extract all content from the current page including text, headings, links, and images",
        inputSchema: z.object({
          reason: z.string().optional().describe("Why extracting content"),
        }),
        execute: async () => {
          return await browser.extractContent();
        },
      }),
      extractFields: tool({
        description:
          "Extract specific field values from the page by their labels or descriptions",
        inputSchema: z.object({
          fields: z
            .array(z.string())
            .describe("List of field names/labels to extract values for"),
        }),
        execute: async ({ fields }) => {
          return await browser.extractFields(fields);
        },
      }),
      formatResult: tool({
        description: "Format and store the extracted data as a structured result",
        inputSchema: z.object({
          pageTitle: z.string().describe("Title of the page"),
          extractedFields: z
            .record(z.string(), z.string())
            .describe("Extracted field names and values as key-value pairs"),
          contentSummary: z.string().optional().describe("Summary of extracted content"),
        }),
        execute: async ({ pageTitle, extractedFields, contentSummary }) => {
          const url = await browser.getCurrentUrl();
          extractedData = {
            url,
            pageTitle,
            fields: extractedFields,
            content: contentSummary,
            timestamp: new Date().toISOString(),
          };
          onExtraction(extractedData);
          return { stored: true, fieldCount: Object.keys(extractedFields).length };
        },
      }),
    },
    stopWhen: stepCountIs(5),
  });

  const duration = Date.now() - startTime;

  if (!extractedData) {
    try {
      const content = await browser.extractContent();
      extractedData = {
        url: content.url,
        pageTitle: content.title,
        fields: {
          headings: JSON.stringify(content.headings),
          linkCount: String(content.links.length),
          textPreview: content.textContent.substring(0, 500),
        },
        content: content.textContent.substring(0, 2000),
        timestamp: new Date().toISOString(),
      };
      onExtraction(extractedData);
    } catch {
      // Extraction failed
    }
  }

  const details = result.text || "Extraction completed";

  onProgress({
    step: 0,
    status: "completed",
    description: `Extractor: ${instruction}`,
    agent: "extractor",
    timestamp: new Date().toISOString(),
    details: `${details} (${duration}ms)`,
  });

  return { success: true, details, data: extractedData };
}
