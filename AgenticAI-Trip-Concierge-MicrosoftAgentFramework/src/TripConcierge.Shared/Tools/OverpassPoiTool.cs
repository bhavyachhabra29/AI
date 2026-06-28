using System.ComponentModel;
using System.Text.Json;
using TripConcierge.Shared.Models;

namespace TripConcierge.Shared.Tools;

/// <summary>
/// Finds real hotels and attractions via the OpenStreetMap Overpass API (no API key required).
/// Price and rating are simulated - deterministically derived from the venue's real name - since
/// OpenStreetMap doesn't track live pricing or reviews.
/// </summary>
public static class OverpassPoiTool
{
    private const string OverpassEndpoint = "https://overpass-api.de/api/interpreter";
    private static readonly HttpClient HttpClient = CreateHttpClient();

    private static HttpClient CreateHttpClient()
    {
        var client = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
        // Overpass rejects requests with no/default User-Agent (406 Not Acceptable) - it requires
        // a descriptive identifier for the calling application, per its usage policy.
        client.DefaultRequestHeaders.UserAgent.ParseAdd("AgenticAI-Trip-Concierge-MicrosoftAgentFramework/1.0 (+https://github.com/bhavyachhabra29/AI)");
        return client;
    }

    [Description("Searches for real hotels near a destination using OpenStreetMap data (no API key required). Names/locations are real; price and rating are simulated.")]
    public static Task<IReadOnlyList<PointOfInterest>> SearchHotelsAsync(
        [Description("The destination city name, e.g. 'Tokyo' or 'Paris'.")] string destination,
        [Description("Maximum number of hotels to return, 1-10.")] int maxResults = 5,
        CancellationToken cancellationToken = default) =>
        SearchAsync(destination, category: "hotel", osmKey: "tourism", osmValueRegex: "hotel", maxResults, simulatePricePerNight: true, cancellationToken);

    [Description("Searches for real tourist attractions near a destination using OpenStreetMap data (no API key required). Names/locations are real; rating is simulated.")]
    public static Task<IReadOnlyList<PointOfInterest>> SearchActivitiesAsync(
        [Description("The destination city name, e.g. 'Tokyo' or 'Paris'.")] string destination,
        [Description("Maximum number of activities to return, 1-10.")] int maxResults = 5,
        CancellationToken cancellationToken = default) =>
        SearchAsync(destination, category: "attraction", osmKey: "tourism", osmValueRegex: "attraction|museum|viewpoint|gallery", maxResults, simulatePricePerNight: false, cancellationToken);

    private static async Task<IReadOnlyList<PointOfInterest>> SearchAsync(
        string destination, string category, string osmKey, string osmValueRegex, int maxResults, bool simulatePricePerNight, CancellationToken cancellationToken)
    {
        maxResults = Math.Clamp(maxResults, 1, 10);

        var geo = await GeoLookup.ResolveAsync(destination, cancellationToken);
        if (geo is null)
        {
            return [];
        }

        var (lat, lon) = geo.Value;
        var query = $"[out:json][timeout:25];nwr[{osmKey}~\"^({osmValueRegex})$\"](around:6000,{lat},{lon});out center {maxResults * 3};";

        using var content = new FormUrlEncodedContent([new KeyValuePair<string, string>("data", query)]);
        using var response = await HttpClient.PostAsync(OverpassEndpoint, content, cancellationToken);
        response.EnsureSuccessStatusCode();

        var json = await response.Content.ReadAsStringAsync(cancellationToken);
        return ParseElements(json, category, simulatePricePerNight, maxResults);
    }

    internal static IReadOnlyList<PointOfInterest> ParseElements(string overpassJson, string category, bool simulatePricePerNight, int maxResults)
    {
        using var doc = JsonDocument.Parse(overpassJson);

        var results = new List<PointOfInterest>();
        foreach (var element in doc.RootElement.GetProperty("elements").EnumerateArray())
        {
            if (!element.TryGetProperty("tags", out var tags) || !tags.TryGetProperty("name", out var nameProp))
            {
                continue;
            }

            var name = nameProp.GetString()!;
            var (elemLat, elemLon) = GetCoordinates(element);

            results.Add(new PointOfInterest(
                Name: name,
                Category: category,
                Address: BuildAddress(tags),
                Latitude: elemLat,
                Longitude: elemLon,
                EstimatedPricePerNight: simulatePricePerNight ? SimulatePrice(name) : null,
                EstimatedRating: SimulateRating(name)));

            if (results.Count >= maxResults)
            {
                break;
            }
        }

        return results;
    }

    private static string? BuildAddress(JsonElement tags)
    {
        var parts = new List<string>();
        if (tags.TryGetProperty("addr:housenumber", out var hn)) parts.Add(hn.GetString()!);
        if (tags.TryGetProperty("addr:street", out var street)) parts.Add(street.GetString()!);
        if (tags.TryGetProperty("addr:city", out var city)) parts.Add(city.GetString()!);
        return parts.Count > 0 ? string.Join(" ", parts) : null;
    }

    private static (double Lat, double Lon) GetCoordinates(JsonElement element)
    {
        if (element.TryGetProperty("lat", out var lat) && element.TryGetProperty("lon", out var lon))
        {
            return (lat.GetDouble(), lon.GetDouble());
        }

        if (element.TryGetProperty("center", out var center))
        {
            return (center.GetProperty("lat").GetDouble(), center.GetProperty("lon").GetDouble());
        }

        return (0, 0);
    }

    private static decimal SimulatePrice(string seedName) =>
        80 + Math.Abs(seedName.GetHashCode()) % 220;

    private static double SimulateRating(string seedName) =>
        Math.Round(3.5 + Math.Abs(seedName.GetHashCode()) % 15 / 10.0, 1);
}
