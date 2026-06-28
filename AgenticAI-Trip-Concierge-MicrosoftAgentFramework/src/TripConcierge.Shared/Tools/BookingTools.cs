using System.ComponentModel;
using TripConcierge.Shared.Models;

namespace TripConcierge.Shared.Tools;

/// <summary>
/// Simulated booking actions - no real payment or reservation is made. These are wrapped in
/// ApprovalRequiredAIFunction at agent-creation time so a human must approve before they execute.
/// </summary>
public static class BookingTools
{
    [Description("Books a flight for the traveler. Simulated booking only - no real payment or reservation is made.")]
    public static BookingResult BookFlight(
        [Description("Description of the flight to book, e.g. airline and route.")] string flightDescription,
        [Description("Name of the traveler.")] string travelerName) =>
        Confirm("FLT", $"Flight booked for {travelerName}: {flightDescription}.");

    [Description("Books a hotel for the traveler. Simulated booking only - no real payment or reservation is made.")]
    public static BookingResult BookHotel(
        [Description("Name of the hotel to book.")] string hotelName,
        [Description("Name of the traveler.")] string travelerName,
        [Description("Check-in date (yyyy-MM-dd).")] string checkInDate,
        [Description("Check-out date (yyyy-MM-dd).")] string checkOutDate) =>
        Confirm("HTL", $"Hotel '{hotelName}' booked for {travelerName} from {checkInDate} to {checkOutDate}.");

    [Description("Books an activity or tour for the traveler. Simulated booking only - no real payment or reservation is made.")]
    public static BookingResult BookActivity(
        [Description("Name of the activity to book.")] string activityName,
        [Description("Name of the traveler.")] string travelerName,
        [Description("Date of the activity (yyyy-MM-dd).")] string date) =>
        Confirm("ACT", $"Activity '{activityName}' booked for {travelerName} on {date}.");

    private static BookingResult Confirm(string prefix, string message) =>
        new(Success: true, ConfirmationCode: $"{prefix}-{Guid.NewGuid().ToString()[..8].ToUpperInvariant()}", Message: message);
}
