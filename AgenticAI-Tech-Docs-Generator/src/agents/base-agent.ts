import { createOpenAI, OpenAIProvider } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { config } from '../config';

export interface AgentConfig {
  name: string;
  role: string;
  systemPrompt: string;
  maxTokens?: number; // For o1 model, this represents max_completion_tokens
  // Note: temperature removed as o1 model doesn't support it
}

export interface AnalysisResult {
  technicalSpec: string;
  functionalSpec: string;
  metadata: {
    filesAnalyzed: number;
    codeLanguages: string[];
    frameworks: string[];
    architecture: string;
  };
}

export interface FileInfo {
  path: string;
  content: string;
  language: string;
  size: number;
}

export class AIClient {
  private openaiClientRoot: OpenAIProvider;

  constructor() {
    // creating instance o1-2024-12-17
    this.openaiClientRoot = createOpenAI({
      apiKey: config.openai.apiKey,
      baseURL: config.openai.baseURL,
      headers: {
        "api-key": config.openai.apiKey,
        "api-version": config.openai.apiVersion,
      },
    });
  }

  async generateText(
    systemPrompt: string, 
    userPrompt: string, 
    temperature?: number, // o1 model doesn't support temperature
    maxCompletionTokens = config.openai.maxCompletionTokens
  ): Promise<string> {
    try {
      const model = this.openaiClientRoot.chat(config.openai.model);
      
      const result = await generateText({
        model,
        system: systemPrompt,
        prompt: userPrompt,
        // For o1 models, don't specify maxTokens as it will be converted incorrectly
        ...(config.openai.model.includes('o1') ? {} : { maxTokens: maxCompletionTokens })
      });

      return result.text;
    } catch (error) {
      console.error('Error generating text:', error);
      throw error;
    }
  }
}

export abstract class BaseAgent {
  protected name: string;
  protected role: string;
  protected systemPrompt: string;
  protected aiClient: AIClient;
  protected maxCompletionTokens: number;
  // Note: temperature removed as o1 model doesn't support it

  constructor(agentConfig: AgentConfig, aiClient: AIClient) {
    this.name = agentConfig.name;
    this.role = agentConfig.role;
    this.systemPrompt = agentConfig.systemPrompt;
    this.aiClient = aiClient;
    this.maxCompletionTokens = agentConfig.maxTokens || config.openai.maxCompletionTokens;
  }

  async analyze(input: any): Promise<string> {
    const userPrompt = this.formatInput(input);
    return await this.aiClient.generateText(
      this.systemPrompt,
      userPrompt,
      undefined, // o1 doesn't support temperature
      this.maxCompletionTokens
    );
  }

  protected abstract formatInput(input: any): string;
}
