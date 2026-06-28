using Microsoft.Agents.AI;
using Microsoft.Agents.AI.Workflows;
using Microsoft.Extensions.AI;

namespace TripConcierge.Shared.Agents;

/// <summary>
/// Round-robin group chat manager that additionally terminates early once a participant signals
/// consensus (the "We approve this itinerary" phrase both Budget/Experience advocate prompts use),
/// rather than always running to MaximumIterationCount.
/// </summary>
public sealed class ConsensusGroupChatManager(IReadOnlyList<AIAgent> agents) : RoundRobinGroupChatManager(agents)
{
    private const string ConsensusPhrase = "we approve this itinerary";

    protected override ValueTask<bool> ShouldTerminateAsync(
        IReadOnlyList<ChatMessage> history,
        CancellationToken cancellationToken = default)
    {
        return HasReachedConsensus(history)
            ? ValueTask.FromResult(true)
            : base.ShouldTerminateAsync(history, cancellationToken);
    }

    internal static bool HasReachedConsensus(IReadOnlyList<ChatMessage> history) =>
        history.LastOrDefault()?.Text?.Contains(ConsensusPhrase, StringComparison.OrdinalIgnoreCase) == true;
}
