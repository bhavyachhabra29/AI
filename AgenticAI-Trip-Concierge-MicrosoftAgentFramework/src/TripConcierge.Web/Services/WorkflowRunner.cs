using Microsoft.Agents.AI.Workflows;
using Microsoft.Extensions.AI;

namespace TripConcierge.Web.Services;

/// <summary>Shared run-to-completion loop for the single-shot patterns (Sequential/Concurrent/GroupChat).</summary>
public static class WorkflowRunner
{
    /// <summary>
    /// AgentResponseUpdateEvent apparently satisfies "is WorkflowOutputEvent" too (a shared base type
    /// or similar relationship in the SDK) - a plain `evt is WorkflowOutputEvent` check matches on the
    /// very first streaming text update, ending workflows after a single token. Checking
    /// AgentResponseUpdateEvent first (switch = first-match-wins) avoids that trap, matching the same
    /// safe pattern already used in ActivityFeedBuilder.Process.
    /// </summary>
    public static bool TryGetTerminalOutput(WorkflowEvent evt, out WorkflowOutputEvent? output)
    {
        switch (evt)
        {
            case AgentResponseUpdateEvent:
                output = null;
                return false;
            case WorkflowOutputEvent terminal:
                output = terminal;
                return true;
            default:
                output = null;
                return false;
        }
    }

    public static async Task RunToCompletionAsync(
        Workflow workflow,
        List<ChatMessage> initialMessages,
        ActivityFeedBuilder feed,
        Action onChange,
        CancellationToken cancellationToken = default)
    {
        await using StreamingRun run = await InProcessExecution.RunStreamingAsync(workflow, initialMessages);

        var sent = await run.TrySendMessageAsync(new TurnToken(emitEvents: true));
        if (!sent)
        {
            throw new InvalidOperationException("TrySendMessageAsync returned false - the workflow did not accept the turn token.");
        }

        var eventCount = 0;
        var reachedOutput = false;

        await foreach (WorkflowEvent evt in run.WatchStreamAsync(cancellationToken))
        {
            eventCount++;
            feed.Process(evt);
            onChange();

            if (TryGetTerminalOutput(evt, out _))
            {
                reachedOutput = true;
                break;
            }
        }

        if (eventCount == 0)
        {
            throw new InvalidOperationException(
                "The workflow produced no events at all. This usually means authentication to the Foundry project " +
                "failed silently (e.g. an expired `az login`/`azd auth login` session) - run `az account show` to check.");
        }

        if (!reachedOutput)
        {
            throw new InvalidOperationException(
                $"The workflow's event stream ended after {eventCount} event(s) without ever producing a WorkflowOutputEvent.");
        }
    }
}
