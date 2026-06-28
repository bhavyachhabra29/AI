using System.Text.Json;

namespace TripConcierge.Shared.Tools;

/// <summary>
/// Resolves a destination name to coordinates via Open-Meteo's free geocoding API (no key required).
/// Shared by WeatherTool and OverpassPoiTool so both can query against the same destination.
/// </summary>
internal static class GeoLookup
{
    private static readonly HttpClient HttpClient = new();

    public static async Task<(double Latitude, double Longitude)?> ResolveAsync(string destination, CancellationToken cancellationToken = default)
    {
        var url = $"https://geocoding-api.open-meteo.com/v1/search?name={Uri.EscapeDataString(destination)}&count=1";
        var response = await HttpClient.GetStringAsync(url, cancellationToken);
        using var doc = JsonDocument.Parse(response);

        if (!doc.RootElement.TryGetProperty("results", out var results) || results.GetArrayLength() == 0)
        {
            return null;
        }

        var place = results[0];
        return (place.GetProperty("latitude").GetDouble(), place.GetProperty("longitude").GetDouble());
    }
}
