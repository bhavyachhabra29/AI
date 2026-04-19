<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# UI Automations Runner Agent

This is a Next.js TypeScript application that provides an agentic AI-powered UI automation webapp.

## Architecture
- **Multi-agent pattern** using Vercel AI SDK v6 (`ai` package)
- **Supervisor Agent**: Orchestrates execution, delegates to specialist agents, reviews completion
- **Navigator Agent**: Handles URL navigation using Playwright
- **Extractor Agent**: Extracts content and field values from pages
- **Action Agent**: Clicks buttons, fills forms, selects options, scrolls

## Key Technologies
- Next.js 16+ with App Router
- Vercel AI SDK v6 (uses `inputSchema` not `parameters`, `stopWhen: stepCountIs(N)` not `maxSteps`)
- Playwright for browser automation (headless Chromium)
- Tailwind CSS for styling
- Server-Sent Events (SSE) for streaming progress to the client

## Important Notes
- AI SDK v6 uses `tool()` with `inputSchema` (Zod schema) instead of `parameters`
- Use `stopWhen: stepCountIs(N)` instead of deprecated `maxSteps`
- `z.record()` requires two arguments: key schema and value schema
- Playwright runs server-side only in API routes
- Target deployment: Azure Web App
