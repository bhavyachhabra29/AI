using TripConcierge.Shared.Tools;

namespace TripConcierge.Shared.Tests.Tools;

public class OverpassPoiToolTests
{
    private const string SampleOverpassResponse = """
        {
          "elements": [
            {
              "type": "node",
              "lat": 35.6595,
              "lon": 139.7005,
              "tags": { "name": "Shibuya Grand Hotel", "tourism": "hotel", "addr:housenumber": "1", "addr:street": "Shibuya St", "addr:city": "Tokyo" }
            },
            {
              "type": "way",
              "center": { "lat": 35.66, "lon": 139.70 },
              "tags": { "name": "Tokyo Tower", "tourism": "attraction" }
            },
            {
              "type": "node",
              "lat": 1.0,
              "lon": 1.0,
              "tags": { "tourism": "hotel" }
            }
          ]
        }
        """;

    [Fact]
    public void ParseElements_SkipsElementsWithoutAName()
    {
        var results = OverpassPoiTool.ParseElements(SampleOverpassResponse, "hotel", simulatePricePerNight: true, maxResults: 5);

        Assert.Equal(2, results.Count);
    }

    [Fact]
    public void ParseElements_UsesDirectCoordinatesAndBuildsAddress()
    {
        var results = OverpassPoiTool.ParseElements(SampleOverpassResponse, "hotel", simulatePricePerNight: true, maxResults: 5);
        var hotel = results[0];

        Assert.Equal("Shibuya Grand Hotel", hotel.Name);
        Assert.Equal(35.6595, hotel.Latitude);
        Assert.Equal(139.7005, hotel.Longitude);
        Assert.Equal("1 Shibuya St Tokyo", hotel.Address);
        Assert.NotNull(hotel.EstimatedPricePerNight);
        Assert.InRange(hotel.EstimatedRating, 3.5, 5.0);
    }

    [Fact]
    public void ParseElements_FallsBackToCenterCoordinatesAndNullAddressWhenNoTags()
    {
        var results = OverpassPoiTool.ParseElements(SampleOverpassResponse, "attraction", simulatePricePerNight: false, maxResults: 5);
        var attraction = results[1];

        Assert.Equal("Tokyo Tower", attraction.Name);
        Assert.Equal(35.66, attraction.Latitude);
        Assert.Equal(139.70, attraction.Longitude);
        Assert.Null(attraction.Address);
        Assert.Null(attraction.EstimatedPricePerNight);
    }

    [Fact]
    public void ParseElements_RespectsMaxResults()
    {
        var results = OverpassPoiTool.ParseElements(SampleOverpassResponse, "hotel", simulatePricePerNight: true, maxResults: 1);

        Assert.Single(results);
    }

    [Fact]
    public void ParseElements_SimulatedValuesAreDeterministicForTheSameVenue()
    {
        var first = OverpassPoiTool.ParseElements(SampleOverpassResponse, "hotel", simulatePricePerNight: true, maxResults: 5)[0];
        var second = OverpassPoiTool.ParseElements(SampleOverpassResponse, "hotel", simulatePricePerNight: true, maxResults: 5)[0];

        Assert.Equal(first.EstimatedPricePerNight, second.EstimatedPricePerNight);
        Assert.Equal(first.EstimatedRating, second.EstimatedRating);
    }
}
