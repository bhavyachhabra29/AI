@{
    # -----------------------------------------------------------------------
    # OpenAI / Azure OpenAI connection
    # -----------------------------------------------------------------------
    # Copy this file to `agent-config.psd1` and fill in your real values.
    # `agent-config.psd1` is git-ignored so secrets never get committed.
    # -----------------------------------------------------------------------

    # Provider: "openai" or "azure"
    # openai – standard OpenAI API (api.openai.com)
    # azure  – Azure OpenAI or an Azure-compatible proxy (uses api-key header + api-version)
    Provider = "openai"

    # Your API key.
    # openai: leave empty to fall back to the OPENAI_API_KEY environment variable.
    # azure:  leave empty to fall back to the AZURE_OPENAI_API_KEY environment variable.
    ApiKey  = "REPLACE_WITH_YOUR_API_KEY_OR_LEAVE_EMPTY_TO_USE_ENV_VAR"

    # Base URL (do NOT include /chat/completions at the end – the script adds it).
    #
    # openai examples:
    #   "https://api.openai.com/v1"
    #   "https://my-proxy.example.com/v1"   (any OpenAI-compatible proxy)
    #
    # azure examples:
    #   "https://YOUR-RESOURCE.openai.azure.com/openai/deployments/YOUR-DEPLOYMENT"
    #   "https://my-azure-proxy.example.com/openai/deployments/YOUR-DEPLOYMENT"
    BaseUrl = "https://api.openai.com/v1"

    # Azure API version (only used when Provider = "azure").
    # Standard value: "2024-10-21"  – update as needed.
    ApiVersion = "2024-10-21"

    # Model / deployment name.
    # openai: standard model name, e.g. "gpt-4o" or "gpt-4o-mini"
    # azure:  deployment name (the URL already targets the deployment, but this
    #         value is still sent in the request body as required by the API).
    Model   = "gpt-4o"

    # Maximum number of LLM round-trips before the agent gives up.
    MaxTurns = 50

    # -----------------------------------------------------------------------
    # Playwright MCP server
    # -----------------------------------------------------------------------

    # Show the browser window while automation runs.
    McpHeaded  = $true

    # Browser engine: chromium | firefox | webkit
    McpBrowser = "chromium"

    # -----------------------------------------------------------------------
    # Agent behaviour
    # -----------------------------------------------------------------------

    # Maximum tool output characters sent back to chat/completions.
    # Large extracted content is truncated to avoid malformed or oversized request bodies.
    MaxToolContentChars = 12000

    # NOTE: SystemPrompt is defined in code (Invoke-PlaywrightMcpAgent.ps1) and
    # cannot be overridden from this file. Multi-line strings with embedded
    # quotes do not parse reliably in .psd1 files.
}
