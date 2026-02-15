<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# TechDocs Generator - Copilot Instructions

This is a multi-agent TypeScript web application for generating technical documentation using AI agents and the Vercel AI SDK.

## Project Context

### Architecture
- **Multi-Agent System**: Uses specialized agents (Code Analyzer, Documentation Analyzer, Specification Generator, Email Agent) coordinated by a Coordinator Agent
- **AI Integration**: Vercel AI SDK with o1-2024-12-17 model (latest reasoning model)
- **Email Integration**: Microsoft Graph API with MSAL authentication
- **Repository Analysis**: Supports GitHub repositories via REST API and local folders
- **Visual Diagrams**: Self-contained HTML/CSS/SVG diagrams without external dependencies
- **HTTP Server**: Node.js server with API endpoints for web interface
- **No Git Dependency**: Uses GitHub REST API directly for repository access

### Key Technologies
- **Frontend**: TypeScript, HTML, CSS (vanilla - no framework dependencies)
- **AI/LLM**: Vercel AI SDK (`ai` package) with `@ai-sdk/openai` for o1-2024-12-17 model
- **Email**: Microsoft Graph API with `@azure/msal-node` and `@microsoft/microsoft-graph-client`
- **File Processing**: `fs-extra` for local file operations
- **Configuration**: `dotenv` for environment management
- **Server**: Node.js HTTP server with custom API endpoints
- **Diagrams**: Pure HTML/CSS/SVG without external libraries
- **Repository Access**: GitHub REST API (no Git installation required)

### Code Style Guidelines
- Use TypeScript with strict type checking
- Follow async/await patterns for all asynchronous operations
- Use proper error handling with try/catch blocks
- Implement proper TypeScript interfaces for all data structures
- Use environment variables for configuration (stored in `src/config/index.ts`)

### Agent Pattern
When working with agents:
- All agents extend `BaseAgent` class
- Each agent has a specific `systemPrompt` and `formatInput` method
- Use the Coordinator Agent to orchestrate multiple agents
- **o1 Model Specific**: No temperature support, use maxCompletionTokens instead of maxTokens
- Maximum completion token limits are configurable per agent (typically 4000-6000)
- AIClient handles o1 model API version and authentication headers

### Email Functionality
- Email agent generates professional templates using AI
- Uses Microsoft Graph API instead of SMTP for enhanced security
- Supports both HTML and plain text email formats
- Attachments include `.md` (technical specs) and `.html` (functional specs with diagrams) files
- OAuth2 authentication with Microsoft 365 tenant
- Requires Microsoft Graph app registration and permissions

### Environment Configuration
- All configuration managed through `src/config/index.ts`
- Environment variables loaded from `.env` file
- Validation for required configuration values
- Support for optional GitHub token for private repos
- o1 model specific configuration (API version, max completion tokens)
- Microsoft Graph authentication credentials

### File Analysis
- Repository analyzer supports 20+ programming languages
- Smart file filtering (excludes node_modules, build artifacts, etc.)
- Framework detection based on file content analysis
- Supports both GitHub repositories (via REST API with PAT) and local folders
- GitHub API integration eliminates need for local Git installation
- Rate limiting awareness for GitHub API calls

### GitHub API Integration
- Uses GitHub REST API v3 for repository access
- Fetches repository tree and file contents via API endpoints
- Supports both public and private repositories with PAT authentication
- No local Git installation required
- Handles base64 decoding of file contents from API responses
- Implements proper error handling for API rate limits and authentication

### Security Considerations
- Never hardcode API keys or credentials
- Use environment variables for all sensitive data
- Validate all user inputs
- Secure handling of GitHub PATs and email credentials
- Microsoft Graph OAuth2 token management
- o1 model API key protection
- GitHub API token security (more secure than Git cloning with embedded tokens)

## Development Guidelines

### Document Generation Features
- **Technical Specifications**: Include class diagrams in ASCII/text format showing inheritance and relationships
- **Functional Specifications**: Include test cases instead of user stories, written in business-friendly language
- **Visual Flow Diagrams**: Generate SVG diagrams showing user workflows from action to output
- **Self-Contained Diagrams**: Use inline HTML/CSS/SVG without external dependencies

### SVG Diagram Guidelines
- Use proper text positioning: `text-anchor="middle"` and `dominant-baseline="middle"`
- Keep text concise to fit within shapes (max 6 chars for diamonds, 8 for circles)
- Use specific colors: blue (#4A90E2) for user actions, gray (#9B9B9B) for processes
- Include arrows with proper markers for flow direction
- Position text at shape centers: rectangles (x+width/2, y+height/2), circles (cx, cy)

### Agent-Specific Guidelines
- **Documentation Agent**: Analyzes code to extract functional requirements and business logic
- **Specification Generator**: Creates both technical and functional specs with mandatory visual diagrams
- **Email Agent (Graph)**: Uses Microsoft Graph API with proper OAuth2 authentication

1. **Agent Development**: When creating new agents, follow the BaseAgent pattern and ensure proper error handling
2. **Configuration**: Add new configuration options to the config interface and environment template
3. **Email Templates**: Use AI generation for email content but provide fallback templates
4. **File Processing**: Always validate file paths and handle permission errors gracefully
5. **Progress Tracking**: Use the progress callback pattern for long-running operations
6. **Diagram Generation**: Always include visual flow diagrams in functional specifications
7. **o1 Model Usage**: Configure maxCompletionTokens, avoid temperature parameter

## Testing
- Test email configuration before sending emails
- Validate repository access for GitHub integration
- Ensure proper file system permissions for local folder analysis
- Test with various project types and sizes
- Verify SVG diagram generation and text positioning
- Test Microsoft Graph authentication flow
- Validate o1 model parameter handling (maxCompletionTokens)
- Test GitHub API rate limiting and error handling
- Verify PAT authentication for private repositories
