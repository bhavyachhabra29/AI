namespace TripConcierge.Shared.Models;

/// <summary>
/// A real hotel or attraction sourced from OpenStreetMap. Name/address/coordinates are real;
/// price and rating are simulated since OpenStreetMap doesn't track live pricing or reviews.
/// </summary>
public sealed record PointOfInterest(
    string Name,
    string Category,
    string? Address,
    double Latitude,
    double Longitude,
    decimal? EstimatedPricePerNight,
    double EstimatedRating);
