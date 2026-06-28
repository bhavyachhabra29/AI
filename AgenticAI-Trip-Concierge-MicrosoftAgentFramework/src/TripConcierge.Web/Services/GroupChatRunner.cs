using Microsoft.Agents.AI.Workflows;
using Microsoft.Extensions.AI;
using TripConcierge.Shared.Agents;
using TripConcierge.Shared.ChatClients;
using TripConcierge.Shared.Configuration;

namespace TripConcierge.Web.Services;

/// <summary>Budget vs Experience Negotiation: a 2-agent debate over a draft itinerary, terminating
/// either on consensus ("We approve this itinerary") or after MaximumIterationCount rounds.</summary>
public sealed class GroupChatRunner(AgentFrameworkSettings settings)
{
    public async Task RunAsync(string draftItinerary, ActivityFeedBuilder feed, Action onChange, CancellationToken cancellationToken = default)
    {
        var projectClient = FoundryChatClientFactory.CreateProjectClient(settings);
        var chatClient = FoundryChatClientFactory.CreateChatClient(projectClient, settings);

        var budget = TripAgentFactory.CreateBudgetAdvocateAgent(chatClient);
        var experience = TripAgentFactory.CreateExperienceAdvocateAgent(chatClient);

        var workflow = AgentWorkflowBuilder
            .CreateGroupChatBuilderWith(agents => new ConsensusGroupChatManager(agents) { MaximumIterationCount = 6 })
            .AddParticipants(budget, experience)
            .Build();

        var messages = new List<ChatMessage>
        {
            new(ChatRole.User, $"Here is a draft itinerary. Debate and refine it:\n\n{draftItinerary}")
        };

        await WorkflowRunner.RunToCompletionAsync(workflow, messages, feed, onChange, cancellationToken);
    }
}
