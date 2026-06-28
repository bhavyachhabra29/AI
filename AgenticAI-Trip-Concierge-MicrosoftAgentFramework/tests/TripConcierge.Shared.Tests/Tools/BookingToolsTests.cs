using TripConcierge.Shared.Tools;

namespace TripConcierge.Shared.Tests.Tools;

public class BookingToolsTests
{
    [Fact]
    public void BookFlight_ReturnsSuccessWithConfirmationCode()
    {
        var result = BookingTools.BookFlight("ANA 101 NRT-CDG", "Jane Doe");

        Assert.True(result.Success);
        Assert.StartsWith("FLT-", result.ConfirmationCode);
        Assert.Contains("Jane Doe", result.Message);
    }

    [Fact]
    public void BookHotel_ReturnsSuccessWithConfirmationCode()
    {
        var result = BookingTools.BookHotel("Shibuya Grand Hotel", "Jane Doe", "2026-07-01", "2026-07-04");

        Assert.True(result.Success);
        Assert.StartsWith("HTL-", result.ConfirmationCode);
        Assert.Contains("Shibuya Grand Hotel", result.Message);
    }

    [Fact]
    public void BookActivity_ReturnsSuccessWithConfirmationCode()
    {
        var result = BookingTools.BookActivity("Tsukiji Food Tour", "Jane Doe", "2026-07-02");

        Assert.True(result.Success);
        Assert.StartsWith("ACT-", result.ConfirmationCode);
    }
}
