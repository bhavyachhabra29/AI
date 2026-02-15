import { BaseAgent, AgentConfig, FileInfo, AIClient } from './base-agent';

export class CodeAnalyzerAgent extends BaseAgent {
  constructor(aiClient: AIClient) {
    const config: AgentConfig = {
      name: 'CodeAnalyzer',
      role: 'Code Analysis Specialist',
      systemPrompt: `You are a senior software architect specializing in code analysis. Your job is to:

1. Analyze code structure, patterns, and architecture
2. Identify programming languages, frameworks, and libraries used
3. Understand the overall system design and data flow
4. Identify key components, modules, and their relationships
5. Extract technical details about APIs, databases, and integrations

Provide a comprehensive technical analysis that includes:
- Architecture overview
- Technology stack
- Key components and their purposes
- Data models and relationships
- API endpoints and integrations
- Security considerations
- Performance characteristics

Be thorough but concise. Focus on technical accuracy.`,
      maxTokens: 4000
    };
    super(config, aiClient);
  }

  protected formatInput(files: FileInfo[]): string {
    let input = `Analyze the following codebase:\n\n`;
    
    files.forEach(file => {
      input += `--- ${file.path} (${file.language}) ---\n`;
      input += file.content.substring(0, 2000); // Limit content length
      input += '\n\n';
    });

    input += `\nProvide a comprehensive technical analysis of this codebase.`;
    return input;
  }
}
