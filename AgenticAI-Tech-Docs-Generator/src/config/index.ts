import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export interface AppConfig {
  // LLM Configuration for o1 model
  openai: {
    apiKey: string;
    baseURL: string;
    model: string;
    maxCompletionTokens: number;
    apiVersion: string;
    // Note: o1 model does not support temperature
  };

  // Email Configuration (Microsoft Graph)
  email: {
    microsoftClientId: string;
    microsoftClientSecret: string;
    microsoftTenantId: string;
    fromEmail: string;
  };

  // Application Configuration
  app: {
    name: string;
    version: string;
    nodeEnv: string;
    logLevel: string;
  };

  // Optional GitHub Configuration
  github?: {
    token: string;
  };
}

class ConfigManager {
  private config: AppConfig;

  constructor() {
    this.config = this.loadConfig();
    this.validateConfig();
  }

  private loadConfig(): AppConfig {
    return {
      openai: {
        apiKey: process.env.OPENAI_API_KEY || '',
        baseURL: process.env.OPENAI_BASE_URL || '',
        model: process.env.LLM_MODEL || 'o1-2024-12-17',
        maxCompletionTokens: parseInt(process.env.LLM_MAX_COMPLETION_TOKENS || '4000', 10),
        apiVersion: process.env.OPENAI_API_VERSION || '2025-04-01-preview'
      },
      email: {
        microsoftClientId: process.env.MICROSOFT_CLIENT_ID || '',
        microsoftClientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
        microsoftTenantId: process.env.MICROSOFT_TENANT_ID || '',
        fromEmail: process.env.EMAIL_FROM || ''
      },
      app: {
        name: process.env.APP_NAME || 'TechDocs Generator',
        version: process.env.APP_VERSION || '1.0.0',
        nodeEnv: process.env.NODE_ENV || 'development',
        logLevel: process.env.LOG_LEVEL || 'info'
      },
      github: process.env.GITHUB_TOKEN ? {
        token: process.env.GITHUB_TOKEN
      } : undefined
    };
  }

  private validateConfig(): void {
    const requiredFields = [
      { path: 'openai.apiKey', value: this.config.openai.apiKey },
      { path: 'email.microsoftClientId', value: this.config.email.microsoftClientId },
      { path: 'email.microsoftClientSecret', value: this.config.email.microsoftClientSecret },
      { path: 'email.microsoftTenantId', value: this.config.email.microsoftTenantId },
      { path: 'email.fromEmail', value: this.config.email.fromEmail }
    ];

    const missingFields = requiredFields
      .filter(field => !field.value)
      .map(field => field.path);

    if (missingFields.length > 0) {
      throw new Error(`Missing required environment variables: ${missingFields.join(', ')}`);
    }
  }

  getConfig(): AppConfig {
    return this.config;
  }

  get openai() {
    return this.config.openai;
  }

  get email() {
    return this.config.email;
  }

  get app() {
    return this.config.app;
  }

  get github() {
    return this.config.github;
  }
}

// Export singleton instance
export const config = new ConfigManager();
