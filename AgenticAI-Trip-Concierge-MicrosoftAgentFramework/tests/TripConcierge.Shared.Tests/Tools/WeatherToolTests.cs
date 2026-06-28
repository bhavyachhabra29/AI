using TripConcierge.Shared.Tools;

namespace TripConcierge.Shared.Tests.Tools;

public class WeatherToolTests
{
    private const string SampleOpenMeteoResponse = """
        {
          "daily": {
            "time": ["2026-07-01", "2026-07-02"],
            "temperature_2m_max": [28.5, 30.1],
            "temperature_2m_min": [20.1, 21.4],
            "weathercode": [0, 61]
          }
        }
        """;

    [Fact]
    public void ParseForecast_ReturnsOneDailyForecastPerDay()
    {
        var days = WeatherTool.ParseForecast(SampleOpenMeteoResponse);

        Assert.Equal(2, days.Count);
        Assert.Equal(new DateOnly(2026, 7, 1), days[0].Date);
        Assert.Equal(28.5, days[0].TempHighC);
        Assert.Equal(20.1, days[0].TempLowC);
        Assert.Equal("Clear sky", days[0].Condition);

        Assert.Equal("Rain", days[1].Condition);
    }

    [Theory]
    [InlineData(0, "Clear sky")]
    [InlineData(2, "Partly cloudy")]
    [InlineData(61, "Rain")]
    [InlineData(95, "Thunderstorm")]
    [InlineData(-1, "Unknown")]
    public void DescribeWeatherCode_MapsKnownCodes(int code, string expected)
    {
        Assert.Equal(expected, WeatherTool.DescribeWeatherCode(code));
    }
}
