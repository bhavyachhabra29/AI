using Microsoft.Extensions.AI;
using TripConcierge.Shared.Agents;

namespace TripConcierge.Shared.Tests.Agents;

public class ConsensusGroupChatManagerTests
{
    [Fact]
    public void HasReachedConsensus_TrueWhenLastMessageContainsConsensusPhrase()
    {
        List<ChatMessage> history =
        [
            new(ChatRole.User, "Here is a draft itinerary. Debate and refine it."),
            new(ChatRole.Assistant, "I'd downgrade the hotel to save money.") { AuthorName = "BudgetAdvocate" },
            new(ChatRole.Assistant, "Fine, let's keep the tour but downgrade the hotel. We approve this itinerary.") { AuthorName = "ExperienceAdvocate" }
        ];

        Assert.True(ConsensusGroupChatManager.HasReachedConsensus(history));
    }

    [Fact]
    public void HasReachedConsensus_IsCaseInsensitive()
    {
        List<ChatMessage> history = [new(ChatRole.Assistant, "WE APPROVE THIS ITINERARY.")];

        Assert.True(ConsensusGroupChatManager.HasReachedConsensus(history));
    }

    [Fact]
    public void HasReachedConsensus_FalseWhenNoConsensusPhrasePresent()
    {
        List<ChatMessage> history =
        [
            new(ChatRole.Assistant, "I still think the hotel is too expensive.") { AuthorName = "BudgetAdvocate" }
        ];

        Assert.False(ConsensusGroupChatManager.HasReachedConsensus(history));
    }

    [Fact]
    public void HasReachedConsensus_FalseWhenHistoryIsEmpty()
    {
        Assert.False(ConsensusGroupChatManager.HasReachedConsensus([]));
    }
}
