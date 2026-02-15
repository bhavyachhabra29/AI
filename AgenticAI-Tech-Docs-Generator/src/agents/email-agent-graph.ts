import { BaseAgent, AgentConfig, AIClient } from './base-agent';
import { config } from '../config';
import { Client } from '@microsoft/microsoft-graph-client';
import { ConfidentialClientApplication } from '@azure/msal-node';

// Microsoft Graph Authentication Provider
class GraphAuthProvider {
  private msalInstance: ConfidentialClientApplication;

  constructor() {
    this.msalInstance = new ConfidentialClientApplication({
      auth: {
        clientId: config.email.microsoftClientId,
        clientSecret: config.email.microsoftClientSecret,
        authority: `https://login.microsoftonline.com/${config.email.microsoftTenantId}`
      }
    });
  }

  async getAccessToken(): Promise<string> {
    const clientCredentialRequest = {
      scopes: ['https://graph.microsoft.com/.default'],
    };

    const response = await this.msalInstance.acquireTokenByClientCredential(clientCredentialRequest);
    return response?.accessToken || '';
  }
}

interface EmailOptions {
  to: string;
  subject: string;
  htmlContent: string;
  textContent: string;
  attachments: EmailAttachment[];
}

interface EmailAttachment {
  filename: string;
  content: string;
  contentType: string;
}

export type { EmailOptions, EmailAttachment };

export class EmailAgent extends BaseAgent {
  private graphClient: Client | null = null;
  private authProvider: GraphAuthProvider;

  constructor(aiClient: AIClient) {
    const agentConfig: AgentConfig = {
      name: 'Email Agent',
      role: 'Professional Email Composer and Sender',
      systemPrompt: `You are a professional email composer for technical documentation delivery.

Your role is to create clear, professional emails that accompany technical documentation deliveries.

When generating emails for technical documentation, include:
- Clear explanation of what documents are attached
- Brief summary of the project analyzed
- Professional greeting and closing
- Instructions on how to use the documents

Keep the tone professional but friendly. Make the content accessible to both technical and non-technical stakeholders.`,
      maxTokens: 1000
    };

    super(agentConfig, aiClient);
    this.authProvider = new GraphAuthProvider();
    this.setupGraphClient();
  }

  private setupGraphClient(): void {
    this.graphClient = Client.initWithMiddleware({
      authProvider: {
        getAccessToken: async () => {
          return await this.authProvider.getAccessToken();
        }
      }
    });
  }

  async sendDocumentation(
    recipientEmail: string,
    projectName: string,
    technicalSpec: string,
    functionalSpec: string,
    metadata?: any
  ): Promise<boolean> {
    try {
      // Generate professional email content
      const emailContent = await this.generateEmailContent({
        projectName,
        recipientEmail,
        metadata
      });

      // Create attachments
      const attachments = await this.createAttachments(projectName, technicalSpec, functionalSpec);

      // Send email using Microsoft Graph
      const emailOptions: EmailOptions = {
        to: recipientEmail,
        subject: emailContent.subject,
        htmlContent: emailContent.html,
        textContent: emailContent.text,
        attachments
      };

      await this.sendEmailViaGraph(emailOptions);
      console.log(`✅ Email sent successfully to ${recipientEmail}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to send email:', error);
      return false;
    }
  }

  private async sendEmailViaGraph(options: EmailOptions): Promise<void> {
    if (!this.graphClient) {
      throw new Error('Graph client not initialized');
    }

    // Prepare attachments for Graph API
    const graphAttachments = options.attachments.map(attachment => ({
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: attachment.filename,
      contentType: attachment.contentType,
      contentBytes: Buffer.from(attachment.content).toString('base64')
    }));

    // Prepare the message
    const message = {
      subject: options.subject,
      body: {
        contentType: 'HTML',
        content: options.htmlContent
      },
      toRecipients: [
        {
          emailAddress: {
            address: options.to
          }
        }
      ],
      attachments: graphAttachments
    };

    // Send the email using Microsoft Graph
    await this.graphClient
      .api(`/users/${config.email.fromEmail}/sendMail`)
      .post({
        message: message,
        saveToSentItems: true
      });
  }

  async testConnection(): Promise<boolean> {
    try {
      const token = await this.authProvider.getAccessToken();
      if (!token) {
        throw new Error('Failed to get access token');
      }

      if (!this.graphClient) {
        throw new Error('Graph client not initialized');
      }

      // Test by getting user profile
      await this.graphClient.api(`/users/${config.email.fromEmail}`).get();
      console.log('✅ Microsoft Graph connection successful');
      return true;
    } catch (error) {
      console.error('❌ Microsoft Graph connection failed:', error);
      return false;
    }
  }

  private async generateEmailContent(context: {
    projectName: string;
    recipientEmail: string;
    metadata?: any;
  }): Promise<{ subject: string; html: string; text: string }> {
    const prompt = `Generate a professional email for delivering technical documentation for a project called "${context.projectName}".

Include:
- Professional greeting
- Brief explanation of the attached documents (technical specification and functional specification)
- Summary of what was analyzed
- Instructions for reviewing the documents
- Professional closing

Context: ${context.metadata ? JSON.stringify(context.metadata, null, 2) : 'No additional metadata provided'}

Format the response as JSON with fields: subject, htmlContent, textContent`;

    try {
      const response = await this.analyze(prompt);
      
      // Try to parse as JSON first
      try {
        const parsed = JSON.parse(response);
        return {
          subject: parsed.subject,
          html: parsed.htmlContent,
          text: parsed.textContent
        };
      } catch (parseError) {
        // If JSON parsing fails, create structured response
        return this.createFallbackEmailContent(context.projectName);
      }
    } catch (error) {
      console.error('Error generating email content:', error);
      return this.createFallbackEmailContent(context.projectName);
    }
  }

  private createFallbackEmailContent(projectName: string): { subject: string; html: string; text: string } {
    const subject = `Technical Documentation - ${projectName}`;
    
    const html = `
      <h2>Technical Documentation Delivery</h2>
      <p>Dear Team,</p>
      
      <p>I hope this email finds you well. Please find attached the comprehensive technical documentation for <strong>${projectName}</strong>.</p>
      
      <h3>Attached Documents:</h3>
      <ul>
        <li><strong>Technical Specification (MD)</strong> - Detailed technical architecture and implementation details</li>
        <li><strong>Functional Specification (HTML)</strong> - Business requirements and functional overview</li>
      </ul>
      
      <p>These documents provide a complete analysis of the codebase and include:</p>
      <ul>
        <li>System architecture overview</li>
        <li>Technology stack analysis</li>
        <li>Component structure</li>
        <li>Implementation recommendations</li>
      </ul>
      
      <p>Please review the documents and feel free to reach out if you have any questions or need clarification on any aspect of the documentation.</p>
      
      <p>Best regards,<br>TechDocs Generator</p>
    `;

    const text = `Technical Documentation Delivery

Dear Team,

Please find attached the comprehensive technical documentation for ${projectName}.

Attached Documents:
- Technical Specification (MD) - Detailed technical architecture and implementation details
- Functional Specification (HTML) - Business requirements and functional overview

These documents provide a complete analysis of the codebase and include system architecture overview, technology stack analysis, component structure, and implementation recommendations.

Please review the documents and feel free to reach out if you have any questions.

Best regards,
TechDocs Generator`;

    return { subject, html, text };
  }

  private async createAttachments(
    projectName: string,
    technicalSpec: string,
    functionalSpec: string
  ): Promise<EmailAttachment[]> {
    const attachments: EmailAttachment[] = [];

    // Technical specification as MD file
    attachments.push({
      filename: `${projectName.replace(/[^a-zA-Z0-9]/g, '_')}_technical_spec.md`,
      content: technicalSpec,
      contentType: 'text/markdown'
    });

    // Functional specification as HTML file
    attachments.push({
      filename: `${projectName.replace(/[^a-zA-Z0-9]/g, '_')}_functional_spec.html`,
      content: functionalSpec,
      contentType: 'text/html'
    });

    return attachments;
  }

  protected formatInput(input: any): string {
    if (typeof input === 'string') {
      return input;
    }
    return JSON.stringify(input, null, 2);
  }
}
