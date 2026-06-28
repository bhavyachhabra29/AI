using Microsoft.Agents.AI;
using Microsoft.Agents.AI.Workflows;
using Microsoft.Extensions.AI;
using TripConcierge.Shared.Agents;
using TripConcierge.Shared.ChatClients;
using TripConcierge.Shared.Configuration;
using TripConcierge.Web.Models;

namespace TripConcierge.Web.Services;

/// <summary>
/// Stateful per-circuit session for the Handoff demo: keeps the multi-turn conversation alive
/// across calls and pauses for human approval before approval-required booking tools execute.
/// </summary>
public sealed class HandoffRunner
{
    private readonly Workflow _workflow;
    private readonly List<ChatMessage> _messages = [];

    public HandoffRunner(AgentFrameworkSettings settings)
    {
        var projectClient = FoundryChatClientFactory.CreateProjectClient(settings);
        var chatClient = FoundryChatClientFactory.CreateChatClient(projectClient, settings);

        var concierge = TripAgentFactory.CreateConciergeAgent(chatClient);
        var flightBooking = TripAgentFactory.CreateFlightBookingAgent(chatClient);
        var hotelBooking = TripAgentFactory.CreateHotelBookingAgent(chatClient);
        var activityBooking = TripAgentFactory.CreateActivityBookingAgent(chatClient);

        _workflow = AgentWorkflowBuilder.CreateHandoffBuilderWith(concierge)
            .WithHandoffs(concierge, [flightBooking, hotelBooking, activityBooking])
            .WithHandoffs([flightBooking, hotelBooking, activityBooking], concierge)
            .Build();
    }

    public async Task SendUserMessageAsync(string userText, ActivityFeedBuilder feed, Action onChange, CancellationToken cancellationToken = default)
    {
        feed.ResetTurnState();
        _messages.Add(new ChatMessage(ChatRole.User, userText));

        await using StreamingRun run = await InProcessExecution.RunStreamingAsync(_workflow, _messages);
        await run.TrySendMessageAsync(new TurnToken(emitEvents: true));

        var newMessages = await DrainAsync(run, feed, onChange, cancellationToken);
        _messages.AddRange(newMessages.Skip(_messages.Count));
    }

    private async Task<List<ChatMessage>> DrainAsync(StreamingRun run, ActivityFeedBuilder feed, Action onChange, CancellationToken cancellationToken)
    {
        await foreach (WorkflowEvent evt in run.WatchStreamAsync(cancellationToken))
        {
            if (evt is RequestInfoEvent requestEvt && requestEvt.Request.TryGetDataAs(out ToolApprovalRequestContent? approvalRequest))
            {
                var decision = new TaskCompletionSource<bool>();

                feed.Entries.Add(new ActivityFeedEntry
                {
                    Type = ActivityEventType.ApprovalRequired,
                    AgentName = "Approval needed",
                    Text = DescribeApproval(approvalRequest),
                    OnApprovalDecision = approved =>
                    {
                        decision.TrySetResult(approved);
                        return Task.CompletedTask;
                    }
                });
                onChange();

                var approved = await decision.Task;
                var approvalResponse = approvalRequest!.CreateResponse(approved);
                await run.SendResponseAsync(requestEvt.Request.CreateResponse(approvalResponse));
                continue;
            }

            feed.Process(evt);
            onChange();

            if (WorkflowRunner.TryGetTerminalOutput(evt, out var output))
            {
                return output!.As<List<ChatMessage>>() ?? [];
            }
        }

        return [];
    }

    private static string DescribeApproval(ToolApprovalRequestContent? request) =>
        "A booking action requires your approval before it proceeds" +
        (request is null ? "." : $" (call id: {request.ToolCall.CallId}).");
}
