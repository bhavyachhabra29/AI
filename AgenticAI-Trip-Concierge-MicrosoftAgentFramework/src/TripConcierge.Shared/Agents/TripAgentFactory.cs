using Azure.AI.Projects;
using Microsoft.Agents.AI;
using Microsoft.Extensions.AI;
using TripConcierge.Shared.Prompts;
using TripConcierge.Shared.Tools;

namespace TripConcierge.Shared.Agents;

/// <summary>
/// One factory method per agent persona. Most agents wrap a plain IChatClient with local
/// AIFunction tools; FlightsAgent is the exception - built from AIProjectClient directly so it can
/// use Foundry's built-in HostedWebSearchTool, since no free no-key flight pricing API exists.
/// </summary>
public static class TripAgentFactory
{
    public static AIAgent CreateFlightsAgent(AIProjectClient projectClient, string deploymentName) =>
        projectClient.AsAIAgent(
            deploymentName,
            instructions: AgentPrompts.Flights,
            name: "FlightsAgent",
            tools: [new HostedWebSearchTool()]);

    public static ChatClientAgent CreatePreferenceIntakeAgent(IChatClient chatClient) =>
        new(chatClient, AgentPrompts.PreferenceIntake, name: "PreferenceIntakeAgent",
            description: "Turns a free-text trip request into structured requirements.");

    public static ChatClientAgent CreateHotelsAgent(IChatClient chatClient) =>
        new(chatClient, AgentPrompts.Hotels, name: "HotelsAgent",
            description: "Finds real hotels near the destination.",
            tools: [AIFunctionFactory.Create(OverpassPoiTool.SearchHotelsAsync)]);

    public static ChatClientAgent CreateActivitiesAgent(IChatClient chatClient) =>
        new(chatClient, AgentPrompts.Activities, name: "ActivitiesAgent",
            description: "Finds real attractions near the destination.",
            tools: [AIFunctionFactory.Create(OverpassPoiTool.SearchActivitiesAsync)]);

    public static ChatClientAgent CreateWeatherAgent(IChatClient chatClient) =>
        new(chatClient, AgentPrompts.Weather, name: "WeatherAgent",
            description: "Reports the weather outlook for the destination.",
            tools: [AIFunctionFactory.Create(WeatherTool.GetWeatherForecastAsync)]);

    public static ChatClientAgent CreateItineraryWriterAgent(IChatClient chatClient) =>
        new(chatClient, AgentPrompts.ItineraryWriter, name: "ItineraryWriterAgent",
            description: "Synthesizes research into a final itinerary.");

    public static ChatClientAgent CreateBudgetAdvocateAgent(IChatClient chatClient) =>
        new(chatClient, AgentPrompts.BudgetAdvocate, name: "BudgetAdvocate",
            description: "Argues for the most cost-effective version of the trip.");

    public static ChatClientAgent CreateExperienceAdvocateAgent(IChatClient chatClient) =>
        new(chatClient, AgentPrompts.ExperienceAdvocate, name: "ExperienceAdvocate",
            description: "Argues for the most memorable, premium version of the trip.");

    public static ChatClientAgent CreateConciergeAgent(IChatClient chatClient) =>
        new(chatClient, AgentPrompts.Concierge, name: "ConciergeAgent",
            description: "Triages traveler requests and hands off to booking specialists.");

    public static ChatClientAgent CreateFlightBookingAgent(IChatClient chatClient) =>
        new(chatClient, AgentPrompts.FlightBooking, name: "FlightBookingAgent",
            description: "Handles flight booking requests.",
            tools: [new ApprovalRequiredAIFunction(AIFunctionFactory.Create(BookingTools.BookFlight))]);

    public static ChatClientAgent CreateHotelBookingAgent(IChatClient chatClient) =>
        new(chatClient, AgentPrompts.HotelBooking, name: "HotelBookingAgent",
            description: "Handles hotel booking requests.",
            tools: [new ApprovalRequiredAIFunction(AIFunctionFactory.Create(BookingTools.BookHotel))]);

    public static ChatClientAgent CreateActivityBookingAgent(IChatClient chatClient) =>
        new(chatClient, AgentPrompts.ActivityBooking, name: "ActivityBookingAgent",
            description: "Handles activity booking requests.",
            tools: [new ApprovalRequiredAIFunction(AIFunctionFactory.Create(BookingTools.BookActivity))]);
}
