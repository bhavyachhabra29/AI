using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Azure.Core;
using Azure.Identity;

namespace TripConcierge.Web.Services;

/// <summary>
/// Calls the deployed Foundry Hosted Agent's /responses endpoint directly over HTTP, so the
/// Handoff page's "Live Azure AI Foundry agent" toggle can prove the cloud deployment works
/// through the same chat UI used for the in-process run.
/// </summary>
public sealed class FoundryHostedAgentClient
{
    private static readonly HttpClient HttpClient = new();
    private readonly DefaultAzureCredential _credential = new();

    public string? Endpoint { get; } = Environment.GetEnvironmentVariable("HOSTED_CONCIERGE_ENDPOINT");

    public bool IsConfigured => !string.IsNullOrWhiteSpace(Endpoint);

    public async Task<string> SendAsync(string input, CancellationToken cancellationToken = default)
    {
        if (!IsConfigured)
        {
            throw new InvalidOperationException(
                "HOSTED_CONCIERGE_ENDPOINT is not set - deploy the hosted agent first (see README Azure Deployment section).");
        }

        var token = await _credential.GetTokenAsync(new TokenRequestContext(["https://ai.azure.com/.default"]), cancellationToken);

        // The endpoint azd prints after deploy is already the full, ready-to-POST URL
        // (.../agents/trip-concierge/endpoint/protocols/openai/responses?api-version=v1) -
        // no path needs appending here, unlike a plain Foundry project Responses endpoint.
        using var request = new HttpRequestMessage(HttpMethod.Post, Endpoint!)
        {
            Content = JsonContent.Create(new { input })
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token.Token);

        using var response = await HttpClient.SendAsync(request, cancellationToken);
        response.EnsureSuccessStatusCode();

        var json = await response.Content.ReadAsStringAsync(cancellationToken);
        return ExtractFinalText(json);
    }

    // The hosted Handoff workflow's response shape is an "output" array mixing workflow_action
    // trace entries (HandoffStart/InvokeExecutor/HandoffEnd) with "message" entries - the actual
    // assistant reply lives in the last message entry's content[].text (type "output_text").
    internal static string ExtractFinalText(string json)
    {
        using var doc = JsonDocument.Parse(json);

        if (!doc.RootElement.TryGetProperty("output", out var output) || output.ValueKind != JsonValueKind.Array)
        {
            return json;
        }

        string? lastText = null;
        foreach (var item in output.EnumerateArray())
        {
            if (item.TryGetProperty("type", out var type) && type.GetString() == "message" &&
                item.TryGetProperty("content", out var content) && content.ValueKind == JsonValueKind.Array)
            {
                foreach (var part in content.EnumerateArray())
                {
                    if (part.TryGetProperty("text", out var text))
                    {
                        lastText = text.GetString();
                    }
                }
            }
        }

        return lastText ?? json;
    }
}
