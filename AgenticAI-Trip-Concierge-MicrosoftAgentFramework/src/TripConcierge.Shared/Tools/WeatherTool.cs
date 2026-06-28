using System.ComponentModel;
using System.Text.Json;
using TripConcierge.Shared.Models;

namespace TripConcierge.Shared.Tools;

public static class WeatherTool
{
    private static readonly HttpClient HttpClient = new();

    [Description("Gets a live multi-day weather forecast for a destination city using Open-Meteo (no API key required).")]
    public static async Task<WeatherSummary> GetWeatherForecastAsync(
        [Description("The destination city name, e.g. 'Tokyo' or 'Paris'.")] string destination,
        [Description("Number of forecast days, 1-7.")] int days = 5,
        CancellationToken cancellationToken = default)
    {
        days = Math.Clamp(days, 1, 7);

        var geo = await GeoLookup.ResolveAsync(destination, cancellationToken);
        if (geo is null)
        {
            return new WeatherSummary(destination, []);
        }

        var (lat, lon) = geo.Value;
        var url = $"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}" +
                   $"&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=auto&forecast_days={days}";

        var response = await HttpClient.GetStringAsync(url, cancellationToken);
        var forecasts = ParseForecast(response);

        return new WeatherSummary(destination, forecasts);
    }

    internal static IReadOnlyList<DailyForecast> ParseForecast(string openMeteoJson)
    {
        using var doc = JsonDocument.Parse(openMeteoJson);
        var daily = doc.RootElement.GetProperty("daily");

        var dates = daily.GetProperty("time").EnumerateArray().Select(e => DateOnly.Parse(e.GetString()!)).ToArray();
        var highs = daily.GetProperty("temperature_2m_max").EnumerateArray().Select(e => e.GetDouble()).ToArray();
        var lows = daily.GetProperty("temperature_2m_min").EnumerateArray().Select(e => e.GetDouble()).ToArray();
        var codes = daily.GetProperty("weathercode").EnumerateArray().Select(e => e.GetInt32()).ToArray();

        return dates.Select((date, i) => new DailyForecast(date, highs[i], lows[i], DescribeWeatherCode(codes[i]))).ToList();
    }

    internal static string DescribeWeatherCode(int code) => code switch
    {
        0 => "Clear sky",
        1 or 2 or 3 => "Partly cloudy",
        45 or 48 => "Fog",
        51 or 53 or 55 => "Drizzle",
        61 or 63 or 65 => "Rain",
        71 or 73 or 75 => "Snow",
        80 or 81 or 82 => "Rain showers",
        95 or 96 or 99 => "Thunderstorm",
        _ => "Unknown"
    };
}
