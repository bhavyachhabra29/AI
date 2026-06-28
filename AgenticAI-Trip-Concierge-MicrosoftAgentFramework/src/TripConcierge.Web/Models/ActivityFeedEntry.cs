namespace TripConcierge.Web.Models;

public enum ActivityEventType
{
    AgentMessage,
    ToolCall,
    ToolResult,
    Handoff,
    ApprovalRequired,
    FinalResult
}

public sealed class ActivityFeedEntry
{
    public required ActivityEventType Type { get; init; }
    public required string AgentName { get; init; }
    public string Text { get; set; } = string.Empty;
    public DateTimeOffset Timestamp { get; init; } = DateTimeOffset.Now;
    public string? ToolName { get; init; }
    public string? ToolArguments { get; init; }

    // Populated only for Type == ApprovalRequired.
    public string? ApprovalRequestId { get; init; }
    public bool ApprovalResolved { get; set; }
    public bool ApprovalApproved { get; set; }
    public Func<bool, Task>? OnApprovalDecision { get; init; }
}
