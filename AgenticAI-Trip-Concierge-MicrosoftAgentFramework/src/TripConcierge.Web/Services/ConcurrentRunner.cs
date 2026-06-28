using Microsoft.Agents.AI;
using Microsoft.Agents.AI.Workflows;
using Microsoft.Extensions.AI;
using TripConcierge.Shared.Agents;
using TripConcierge.Shared.ChatClients;
using TripConcierge.Shared.Configuration;
using TripConcierge.Web.Models;

namespace TripConcierge.Web.Services;

/// <summary>Multi-Perspective Destination Research: Flights/Hotels/Activities/Weather run in parallel,
/// then a plain follow-up call (not a workflow node) synthesizes the default per-agent aggregation.</summary>
public sealed class ConcurrentRunner(AgentFrameworkSettings settings)
{
    public async Task RunAsync(string tripBrief, ActivityFeedBuilder feed, Action onChange, CancellationToken cancellationToken = default)
    {
        var projectClient = FoundryChatClientFactory.CreateProjectClient(settings);
        var chatClient = FoundryChatClientFactory.CreateChatClient(projectClient, settings);

        var flights = TripAgentFactory.CreateFlightsAgent(projectClient, settings.ModelDeploymentName);
        var hotels = TripAgentFactory.CreateHotelsAgent(chatClient);
        var activities = TripAgentFactory.CreateActivitiesAgent(chatClient);
        var weather = TripAgentFactory.CreateWeatherAgent(chatClient);

        AIAgent[] participants = [flights, hotels, activities, weather];
        var workflow = AgentWorkflowBuilder.BuildConcurrent(participants);

        var messages = new List<ChatMessage> { new(ChatRole.User, tripBrief) };
        await WorkflowRunner.RunToCompletionAsync(workflow, messages, feed, onChange, cancellationToken);

        if (feed.FinalResult is { Count: > 0 } results)
        {
            var summaryPrompt = "Summarize these independent research findings into one concise, consolidated " +
                "trip-planning brief:\n\n" + string.Join("\n\n", results.Select(m => $"{m.AuthorName}: {m.Text}"));

            var summaryResponse = await chatClient.GetResponseAsync(summaryPrompt, cancellationToken: cancellationToken);

            feed.Entries.Add(new ActivityFeedEntry
            {
                Type = ActivityEventType.FinalResult,
                AgentName = "Consolidated Summary",
                Text = summaryResponse.Text
            });
            onChange();
        }
    }
}
