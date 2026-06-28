namespace TripConcierge.Shared.Configuration;

public sealed class AgentFrameworkSettings
{
    public required string FoundryProjectEndpoint { get; init; }

    public required string ModelDeploymentName { get; init; }

    public string? ApplicationInsightsConnectionString { get; init; }

    public static AgentFrameworkSettings FromEnvironment()
    {
        var endpoint = Environment.GetEnvironmentVariable("FOUNDRY_PROJECT_ENDPOINT")
            ?? throw new InvalidOperationException(
                "FOUNDRY_PROJECT_ENDPOINT is not set. Copy .env.example to .env and fill in your Azure AI Foundry project endpoint, or run `az login` and set it in your shell.");

        var deployment = Environment.GetEnvironmentVariable("AZURE_AI_MODEL_DEPLOYMENT_NAME") ?? "gpt-5-mini";
        var appInsights = Environment.GetEnvironmentVariable("APPLICATIONINSIGHTS_CONNECTION_STRING");

        return new AgentFrameworkSettings
        {
            FoundryProjectEndpoint = endpoint,
            ModelDeploymentName = deployment,
            ApplicationInsightsConnectionString = appInsights
        };
    }
}
