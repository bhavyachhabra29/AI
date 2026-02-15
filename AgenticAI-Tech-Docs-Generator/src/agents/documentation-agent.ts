import { BaseAgent, AgentConfig, FileInfo, AIClient } from './base-agent';

export class DocumentationAgent extends BaseAgent {
  constructor(aiClient: AIClient) {
    const config: AgentConfig = {
      name: 'DocumentationAnalyzer',
      role: 'Functional Specification Analyst',
      systemPrompt: `You are a functional specification expert who analyzes code to understand business logic and user workflows. Your job is to:

1. Analyze code files to understand the application logic and data flow
2. Identify user interactions, API endpoints, and business processes
3. Extract functional requirements and business rules from code analysis
4. Document user workflows and system behaviors
5. Identify integration points and data transformations

When analyzing code, focus on:
- User-facing features and functionality (UI components, forms, APIs)
- Business logic and data processing workflows
- Integration points and external system interactions
- User journeys from input to output
- Error handling and edge cases
- Authentication and authorization flows
- Data flow and processing steps

Provide detailed analysis of:
- Business overview and main use cases
- User interaction patterns and workflows
- Functional requirements and acceptance criteria
- Business rules and validation logic
- Integration requirements and data flow
- Step-by-step user journey descriptions

Your analysis will be used by the specification generator to create the final functional specification with visual diagrams.`,
      maxTokens: 6000
    };
    super(config, aiClient);
  }

  protected formatInput(files: FileInfo[]): string {
    // Focus on code files that contain business logic and user interactions
    const relevantFiles = files.filter(file => {
      const path = file.path.toLowerCase();
      const isCodeFile = ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cs', 'php', 'rb', 'go'].some(ext => 
        path.endsWith(`.${ext}`)
      );
      const isConfigOrTest = path.includes('test') || path.includes('spec') || 
        path.includes('config') || path.includes('node_modules') || path.includes('.min.');
      
      return isCodeFile && !isConfigOrTest;
    });

    // Also include documentation files for context
    const docFiles = files.filter(file => 
      file.path.toLowerCase().includes('readme') ||
      file.path.toLowerCase().includes('doc') ||
      file.path.toLowerCase().includes('.md') ||
      file.language === 'markdown'
    );

    let input = `Analyze the following codebase to understand the functional logic and user workflows:\n\n`;
    
    // Add documentation context first
    if (docFiles.length > 0) {
      input += `=== DOCUMENTATION CONTEXT ===\n`;
      docFiles.forEach(file => {
        input += `--- ${file.path} ---\n`;
        input += file.content.substring(0, 2000); // Limit to avoid token overflow
        input += '\n\n';
      });
    }

    // Add code files for detailed analysis
    input += `=== CODE ANALYSIS ===\n`;
    relevantFiles.slice(0, 15).forEach(file => { // Limit files to avoid token limits
      input += `--- ${file.path} ---\n`;
      input += `Language: ${file.language}\n`;
      input += file.content;
      input += '\n\n';
    });

    input += `\nBased on this code analysis, provide a comprehensive functional analysis that includes:
1. Business overview and main use cases
2. Detailed user workflows and journeys (step-by-step descriptions)
3. Functional requirements with acceptance criteria
4. Business rules and validation logic
5. Integration points and data flow
6. User interaction patterns and system behaviors

Focus on providing detailed descriptions of:
- How users interact with the system (buttons, forms, API calls)
- What happens during each step of processing
- Decision points and conditional logic
- External system interactions and data exchanges
- Error handling and edge cases
- Final outputs and results delivered to users

Provide clear, detailed analysis that will enable the specification generator to create comprehensive documentation with visual flow diagrams.`;

    return input;
  }
}
