using Microsoft.Agents.AI;
using Microsoft.Agents.AI.Workflows;
using Microsoft.Extensions.AI;
using TripConcierge.Shared.Agents;
using TripConcierge.Shared.ChatClients;
using TripConcierge.Shared.Configuration;

namespace TripConcierge.Web.Services;

/// <summary>Trip Planning Pipeline: PreferenceIntake -> Flights -> Hotels -> Activities -> ItineraryWriter.</summary>
public sealed class SequentialRunner(AgentFrameworkSettings settings)
{
    public async Task RunAsync(string tripBrief, ActivityFeedBuilder feed, Action onChange, CancellationToken cancellationToken = default)
    {
        var projectClient = FoundryChatClientFactory.CreateProjectClient(settings);
        var chatClient = FoundryChatClientFactory.CreateChatClient(projectClient, settings);

        var preferenceIntake = TripAgentFactory.CreatePreferenceIntakeAgent(chatClient);
        var flights = TripAgentFactory.CreateFlightsAgent(projectClient, settings.ModelDeploymentName);
        var hotels = TripAgentFactory.CreateHotelsAgent(chatClient);
        var activities = TripAgentFactory.CreateActivitiesAgent(chatClient);
        var itineraryWriter = TripAgentFactory.CreateItineraryWriterAgent(chatClient);

        AIAgent[] pipeline = [preferenceIntake, flights, hotels, activities, itineraryWriter];
        var workflow = AgentWorkflowBuilder.BuildSequential(pipeline);

        var messages = new List<ChatMessage> { new(ChatRole.User, tripBrief) };
        await WorkflowRunner.RunToCompletionAsync(workflow, messages, feed, onChange, cancellationToken);
    }
}
