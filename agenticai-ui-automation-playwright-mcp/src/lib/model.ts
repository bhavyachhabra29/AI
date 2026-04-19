import { createAzure } from "@ai-sdk/azure";
import { createOpenAI } from "@ai-sdk/openai";

/**
 * Shared AI model instance used by all agents.
 *
 * Set OPENAI_PROVIDER=azure to use Azure OpenAI, otherwise defaults to OpenAI.
 *
 * Azure env vars:
 *   AZURE_RESOURCE_URL  – e.g. https://models.assistant.legogroup.io/openai
 *   AZURE_API_KEY       – your api-key
 *   AZURE_DEPLOYMENT    – deployment name, e.g. gpt-4o-2024-08-06
 *   AZURE_API_VERSION   – optional, defaults to 2024-10-21
 *
 * OpenAI env vars:
 *   OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL
 */

function buildModel() {
  if (process.env.OPENAI_PROVIDER === "azure") {
    // For Azure / custom Azure gateways, use createOpenAI with the full
    // deployment URL so the SDK doesn't inject an extra "/v1" segment.
    const baseURL = `${process.env.AZURE_RESOURCE_URL}/deployments/${process.env.AZURE_DEPLOYMENT ?? "gpt-4o-2024-08-06"}`;
    const azure = createOpenAI({
      apiKey: process.env.AZURE_API_KEY ?? process.env.OPENAI_API_KEY!,
      baseURL,
      headers: {
        "api-key": process.env.AZURE_API_KEY ?? process.env.OPENAI_API_KEY!,
      },
    });
    // Model name is ignored by Azure; the deployment in the URL determines it
    return azure.chat(process.env.AZURE_DEPLOYMENT ?? "gpt-4o");
  }

  const openai = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    ...(process.env.OPENAI_BASE_URL && { baseURL: process.env.OPENAI_BASE_URL }),
  });
  return openai(process.env.OPENAI_MODEL ?? "gpt-4o");
}

export const model = buildModel();
