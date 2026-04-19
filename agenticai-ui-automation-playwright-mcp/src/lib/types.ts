export interface Instruction {
  step: number;
  action: string;
  target?: string;
  value?: string;
  description: string;
}

export interface UseCase {
  id: string;
  name?: string;
  steps: Instruction[];
}

export interface InstructionSet {
  instructions: Instruction[];
}

export interface ActionProgress {
  step: number;
  status: "pending" | "running" | "completed" | "failed";
  description: string;
  agent: string;
  timestamp: string;
  details?: string;
  error?: string;
}

export interface ExtractedData {
  url: string;
  pageTitle: string;
  fields: Record<string, unknown>;
  content?: string;
  timestamp: string;
}

export interface ExecutionResult {
  sessionId: string;
  status: "completed" | "failed" | "partial";
  progress: ActionProgress[];
  extractedData: ExtractedData[];
  summary: ActionSummaryRow[];
  startedAt: string;
  completedAt: string;
}

export interface ActionSummaryRow {
  step: number;
  action: string;
  target: string;
  status: "success" | "failed" | "skipped";
  agent: string;
  duration: string;
  details: string;
}

export type AgentType = "navigator" | "extractor" | "action" | "supervisor";

export interface ScreenshotMessage {
  step: number;
  imageBase64: string;
  timestamp: string;
}

export interface StreamMessage {
  type: "progress" | "extraction" | "summary" | "complete" | "error" | "screenshot";
  data: ActionProgress | ExtractedData | ActionSummaryRow[] | ExecutionResult | ScreenshotMessage | { message: string };
}
