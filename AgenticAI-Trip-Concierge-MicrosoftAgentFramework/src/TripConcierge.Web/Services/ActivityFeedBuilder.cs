using Microsoft.Agents.AI;
using Microsoft.Agents.AI.Workflows;
using Microsoft.Extensions.AI;
using TripConcierge.Web.Models;

namespace TripConcierge.Web.Services;

/// <summary>
/// Translates raw Agent Framework WorkflowEvents into ActivityFeedEntry rows for the UI: which
/// agent is talking, which tool it's calling, handoff transitions, approval prompts, and the
/// final result. One instance per workflow run (it accumulates per-executor streaming state).
/// </summary>
public sealed class ActivityFeedBuilder
{
    public List<ActivityFeedEntry> Entries { get; } = [];

    private readonly Dictionary<string, ActivityFeedEntry> _activeMessageByExecutor = [];
    private string? _lastExecutorId;

    public List<ChatMessage>? FinalResult { get; private set; }

    /// <summary>
    /// Call at the start of each new conversation turn in a multi-turn session (Handoff) so a new
    /// agent message starts a fresh bubble instead of appending to a bubble from a previous turn.
    /// </summary>
    public void ResetTurnState()
    {
        _activeMessageByExecutor.Clear();
        _lastExecutorId = null;
    }

    public void Process(WorkflowEvent evt)
    {
        switch (evt)
        {
            case AgentResponseUpdateEvent update:
                ProcessUpdate(update);
                break;

            case WorkflowOutputEvent output:
                FinalResult = output.As<List<ChatMessage>>();
                Entries.Add(new ActivityFeedEntry
                {
                    Type = ActivityEventType.FinalResult,
                    AgentName = "Result",
                    Text = string.Join("\n\n", FinalResult?.Select(m => m.Text) ?? [])
                });
                break;
        }
    }

    private void ProcessUpdate(AgentResponseUpdateEvent update)
    {
        var executorId = update.ExecutorId;

        if (_lastExecutorId is not null && _lastExecutorId != executorId)
        {
            Entries.Add(new ActivityFeedEntry
            {
                Type = ActivityEventType.Handoff,
                AgentName = executorId,
                Text = $"→ Routed to {executorId}"
            });
        }

        _lastExecutorId = executorId;

        foreach (var content in update.Update.Contents)
        {
            switch (content)
            {
                case FunctionCallContent call:
                    Entries.Add(new ActivityFeedEntry
                    {
                        Type = ActivityEventType.ToolCall,
                        AgentName = executorId,
                        ToolName = call.Name,
                        Text = $"Calling {call.Name}({FormatArguments(call.Arguments)})"
                    });
                    _activeMessageByExecutor.Remove(executorId);
                    break;

                case FunctionResultContent result:
                    Entries.Add(new ActivityFeedEntry
                    {
                        Type = ActivityEventType.ToolResult,
                        AgentName = executorId,
                        ToolName = result.CallId,
                        Text = result.Result?.ToString() ?? string.Empty
                    });
                    _activeMessageByExecutor.Remove(executorId);
                    break;

                case TextContent text when !string.IsNullOrEmpty(text.Text):
                    AppendAgentText(executorId, text.Text);
                    break;
            }
        }
    }

    private void AppendAgentText(string executorId, string delta)
    {
        if (!_activeMessageByExecutor.TryGetValue(executorId, out var entry))
        {
            entry = new ActivityFeedEntry { Type = ActivityEventType.AgentMessage, AgentName = executorId };
            _activeMessageByExecutor[executorId] = entry;
            Entries.Add(entry);
        }

        entry.Text += delta;
    }

    private static string FormatArguments(IDictionary<string, object?>? arguments)
    {
        if (arguments is null || arguments.Count == 0)
        {
            return string.Empty;
        }

        return string.Join(", ", arguments.Select(kv => $"{kv.Key}: {kv.Value}"));
    }
}
