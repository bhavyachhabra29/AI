namespace TripConcierge.Shared.Models;

public sealed record DailyForecast(DateOnly Date, double TempHighC, double TempLowC, string Condition);

public sealed record WeatherSummary(string Destination, IReadOnlyList<DailyForecast> Days);
