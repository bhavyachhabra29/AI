namespace TripConcierge.Shared.Models;

public sealed record BookingResult(bool Success, string ConfirmationCode, string Message);
