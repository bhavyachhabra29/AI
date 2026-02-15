import { CoordinatorAgent, DocumentationOptions } from './agents/coordinator-agent';
import { RepositoryAnalyzer } from './repository-analyzer';

class TechDocsGenerator {
  private coordinator: CoordinatorAgent;
  private analyzer: RepositoryAnalyzer;

  constructor() {
    this.coordinator = new CoordinatorAgent();
    this.analyzer = new RepositoryAnalyzer();
  }

  async generateFromGithub(
    repoUrl: string, 
    pat: string | undefined,
    projectName: string,
    description?: string,
    options: DocumentationOptions = {},
    onProgress?: (stage: string, progress: number) => void
  ) {
    try {
      onProgress?.('Cloning repository...', 5);
      const files = await this.analyzer.analyzeGithubRepo(repoUrl, pat);
      
      onProgress?.('Starting analysis...', 10);
      const result = await this.coordinator.generateDocumentation(
        files,
        { name: projectName, description },
        options,
        (stage, progress) => onProgress?.(stage, 10 + (progress * 0.9))
      );

      return result;
    } catch (error) {
      console.error('Error generating from GitHub:', error);
      throw error;
    }
  }

  async generateFromLocal(
    folderPath: string,
    projectName: string,
    description?: string,
    options: DocumentationOptions = {},
    onProgress?: (stage: string, progress: number) => void
  ) {
    try {
      onProgress?.('Analyzing local files...', 5);
      const files = await this.analyzer.analyzeLocalFolder(folderPath);
      
      onProgress?.('Starting analysis...', 10);
      const result = await this.coordinator.generateDocumentation(
        files,
        { name: projectName, description },
        options,
        (stage, progress) => onProgress?.(stage, 10 + (progress * 0.9))
      );

      return result;
    } catch (error) {
      console.error('Error generating from local folder:', error);
      throw error;
    }
  }

  async testEmailConnection(): Promise<boolean> {
    return await this.coordinator.testEmailConnection();
  }
}

// Web interface integration
class WebInterface {
  private generator: TechDocsGenerator;
  private progressCallback?: (stage: string, progress: number) => void;

  constructor() {
    this.generator = new TechDocsGenerator();
  }

  setProgressCallback(callback: (stage: string, progress: number) => void) {
    this.progressCallback = callback;
  }

  async handleFormSubmission(formData: {
    sourceType: 'github' | 'local';
    repoUrl?: string;
    pat?: string;
    localPath?: string;
    projectName: string;
    description?: string;
    sendEmail?: boolean;
    recipientEmail?: string;
  }) {
    try {
      let result;
      
      const options: DocumentationOptions = {
        sendEmail: formData.sendEmail || false,
        recipientEmail: formData.recipientEmail
      };
      
      if (formData.sourceType === 'github' && formData.repoUrl) {
        result = await this.generator.generateFromGithub(
          formData.repoUrl,
          formData.pat,
          formData.projectName,
          formData.description,
          options,
          this.progressCallback
        );
      } else if (formData.sourceType === 'local' && formData.localPath) {
        result = await this.generator.generateFromLocal(
          formData.localPath,
          formData.projectName,
          formData.description,
          options,
          this.progressCallback
        );
      } else {
        throw new Error('Invalid form data');
      }

      return result;
    } catch (error) {
      console.error('Error in form submission:', error);
      throw error;
    }
  }

  async testEmailConnection(): Promise<boolean> {
    return await this.generator.testEmailConnection();
  }
}

export { TechDocsGenerator, WebInterface };
