using Azure.AI.Projects;
using Azure.Identity;
using Microsoft.Extensions.AI;
using TripConcierge.Shared.Configuration;

namespace TripConcierge.Shared.ChatClients;

public static class FoundryChatClientFactory
{
    public static AIProjectClient CreateProjectClient(AgentFrameworkSettings settings) =>
        new(new Uri(settings.FoundryProjectEndpoint), new DefaultAzureCredential());

    public static IChatClient CreateChatClient(AIProjectClient projectClient, AgentFrameworkSettings settings) =>
        projectClient.GetProjectOpenAIClient()
            .GetProjectResponsesClient()
            .AsIChatClient(settings.ModelDeploymentName);
}
