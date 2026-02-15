import { AIClient, AnalysisResult, FileInfo } from './base-agent';
import { CodeAnalyzerAgent } from './code-analyzer-agent';
import { DocumentationAgent } from './documentation-agent';
import { SpecificationGeneratorAgent } from './specification-generator-agent';
import { EmailAgent } from './email-agent-graph';

export interface DocumentationOptions {
  sendEmail?: boolean;
  recipientEmail?: string;
}

export class CoordinatorAgent {
  private aiClient: AIClient;
  private codeAnalyzer: CodeAnalyzerAgent;
  private docAnalyzer: DocumentationAgent;
  private specGenerator: SpecificationGeneratorAgent;
  private emailAgent: EmailAgent;

  constructor() {
    this.aiClient = new AIClient();
    this.codeAnalyzer = new CodeAnalyzerAgent(this.aiClient);
    this.docAnalyzer = new DocumentationAgent(this.aiClient);
    this.specGenerator = new SpecificationGeneratorAgent(this.aiClient);
    this.emailAgent = new EmailAgent(this.aiClient);
  }

  async generateDocumentation(
    files: FileInfo[],
    projectInfo: { name: string; description?: string },
    options: DocumentationOptions = {},
    onProgress?: (stage: string, progress: number) => void
  ): Promise<AnalysisResult> {
    try {
      // Stage 1: Code Analysis
      onProgress?.('Analyzing code structure and architecture...', 15);
      const codeAnalysis = await this.codeAnalyzer.analyze(files);
      
      // Stage 2: Documentation Analysis
      onProgress?.('Analyzing existing documentation...', 30);
      const docAnalysis = await this.docAnalyzer.analyze(files);
      
      // Stage 3: Quality Review
      onProgress?.('Reviewing and synthesizing analysis...', 50);
      const reviewedAnalysis = await this.reviewAnalysis(codeAnalysis, docAnalysis);
      
      // Stage 4: Generate Specifications
      onProgress?.('Generating technical specifications...', 70);
      const specifications = await this.specGenerator.analyze({
        codeAnalysis: reviewedAnalysis.codeAnalysis,
        docAnalysis: reviewedAnalysis.docAnalysis,
        projectInfo
      });
      
      // Stage 5: Parse and format results
      onProgress?.('Finalizing documentation...', 85);
      const result = this.parseSpecifications(specifications, files);
      
      // Stage 6: Send email if requested
      if (options.sendEmail && options.recipientEmail) {
        onProgress?.('Sending documentation via email...', 95);
        await this.emailAgent.sendDocumentation(
          options.recipientEmail,
          projectInfo.name,
          result.technicalSpec,
          result.functionalSpec,
          result.metadata
        );
      }
      
      onProgress?.('Documentation generation complete!', 100);
      return result;
    } catch (error) {
      console.error('Error in coordinator:', error);
      throw error;
    }
  }

  async testEmailConnection(): Promise<boolean> {
    try {
      return await this.emailAgent.testConnection();
    } catch (error) {
      console.error('Email connection test failed:', error);
      return false;
    }
  }

  private async reviewAnalysis(codeAnalysis: string, docAnalysis: string): Promise<{
    codeAnalysis: string;
    docAnalysis: string;
  }> {
    // Review and enhance the analysis from specialized agents
    const reviewPrompt = `As a senior technical lead, review and enhance the following analysis:

CODE ANALYSIS:
${codeAnalysis}

DOCUMENTATION ANALYSIS:
${docAnalysis}

Please:
1. Identify any gaps or inconsistencies
2. Synthesize the information from both analyses
3. Provide additional insights that might have been missed
4. Ensure the analysis is comprehensive and accurate

Return the enhanced analysis maintaining the same structure but with improved insights.`;

    const systemPrompt = `You are a senior technical lead responsible for reviewing and enhancing technical analysis. 
    Your goal is to ensure comprehensive, accurate, and insightful analysis that bridges technical implementation with business requirements.`;

    const enhancedAnalysis = await this.aiClient.generateText(systemPrompt, reviewPrompt, 0.3, 4000);
    
    // Parse the enhanced analysis (simplified for demo)
    const parts = enhancedAnalysis.split('DOCUMENTATION ANALYSIS:');
    return {
      codeAnalysis: parts[0]?.replace('CODE ANALYSIS:', '').trim() || codeAnalysis,
      docAnalysis: parts[1]?.trim() || docAnalysis
    };
  }

  private parseSpecifications(specifications: string, files: FileInfo[]): AnalysisResult {
    // Parse the generated specifications using the marker
    const parts = specifications.split('<!-- FUNCTIONAL_SPEC_START -->');
    const technicalSpec = parts[0]?.trim() || specifications;
    const functionalSpec = parts[1]?.trim() || this.generateFallbackFunctionalSpec();

    // Extract metadata
    const languages = [...new Set(files.map(f => f.language).filter(l => l !== 'unknown'))];
    const frameworks = this.extractFrameworks(files);
    
    return {
      technicalSpec,
      functionalSpec,
      metadata: {
        filesAnalyzed: files.length,
        codeLanguages: languages,
        frameworks,
        architecture: 'Multi-tier' // This would be extracted from analysis
      }
    };
  }

  private extractFrameworks(files: FileInfo[]): string[] {
    const frameworks: string[] = [];
    const content = files.map(f => f.content).join(' ').toLowerCase();
    
    // Simple framework detection
    if (content.includes('react')) frameworks.push('React');
    if (content.includes('angular')) frameworks.push('Angular');
    if (content.includes('vue')) frameworks.push('Vue.js');
    if (content.includes('express')) frameworks.push('Express.js');
    if (content.includes('django')) frameworks.push('Django');
    if (content.includes('flask')) frameworks.push('Flask');
    if (content.includes('spring')) frameworks.push('Spring');
    if (content.includes('.net')) frameworks.push('.NET');
    if (content.includes('fastapi')) frameworks.push('FastAPI');
    if (content.includes('next')) frameworks.push('Next.js');
    if (content.includes('nuxt')) frameworks.push('Nuxt.js');
    
    return [...new Set(frameworks)];
  }

  private generateFallbackFunctionalSpec(): string {
    return `<!DOCTYPE html>
<html>
<head>
    <title>Functional Specification</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; margin: 20px; }
        h1 { color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px; }
        h2 { color: #34495e; margin-top: 30px; }
        .requirement { background: #ecf0f1; padding: 15px; border-left: 4px solid #3498db; margin: 10px 0; }
    </style>
</head>
<body>
    <h1>Functional Specification</h1>
    <h2>Overview</h2>
    <p>This document outlines the functional requirements and specifications for the analyzed system.</p>

    <div class="requirement">
        <h3>Core Functionality</h3>
        <p>The system provides core functionality based on the analyzed codebase.</p>
    </div>

    <h2>Requirements</h2>
    <p>Detailed functional requirements based on code analysis.</p>
</body>
</html>`;
  }
}
