// Agent exports for easier importing
export { BaseAgent, AIClient } from './base-agent';
export { CodeAnalyzerAgent } from './code-analyzer-agent';
export { DocumentationAgent } from './documentation-agent';
export { SpecificationGeneratorAgent } from './specification-generator-agent';
export { EmailAgent } from './email-agent-graph';
export { CoordinatorAgent } from './coordinator-agent';

// Type exports
export type { AgentConfig, AnalysisResult, FileInfo } from './base-agent';
export type { DocumentationOptions } from './coordinator-agent';
export type { EmailAttachment, EmailOptions } from './email-agent-graph';
