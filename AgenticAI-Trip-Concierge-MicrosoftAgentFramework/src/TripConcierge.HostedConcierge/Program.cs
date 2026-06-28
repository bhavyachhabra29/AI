using Microsoft.Agents.AI;
using Microsoft.Agents.AI.Foundry.Hosting;
using Microsoft.Agents.AI.Workflows;
using TripConcierge.Shared.Agents;
using TripConcierge.Shared.ChatClients;
using TripConcierge.Shared.Configuration;

EnvironmentLoader.Load();
var settings = AgentFrameworkSettings.FromEnvironment();

var projectClient = FoundryChatClientFactory.CreateProjectClient(settings);
var chatClient = FoundryChatClientFactory.CreateChatClient(projectClient, settings);

var concierge = TripAgentFactory.CreateConciergeAgent(chatClient);
var flightBooking = TripAgentFactory.CreateFlightBookingAgent(chatClient);
var hotelBooking = TripAgentFactory.CreateHotelBookingAgent(chatClient);
var activityBooking = TripAgentFactory.CreateActivityBookingAgent(chatClient);

// Hosts the real multi-agent Handoff workflow (not a single-agent fallback) - Workflow.AsAIAgent
// lets a whole workflow be exposed through Foundry's Responses protocol like any other AIAgent.
var workflow = AgentWorkflowBuilder.CreateHandoffBuilderWith(concierge)
    .WithHandoffs(concierge, [flightBooking, hotelBooking, activityBooking])
    .WithHandoffs([flightBooking, hotelBooking, activityBooking], concierge)
    .Build();

AIAgent conciergeAgent = workflow.AsAIAgent("trip-concierge", "Trip Concierge");

var builder = AgentHost.CreateBuilder(args);
builder.Services.AddFoundryResponses(conciergeAgent);
builder.RegisterProtocol("responses", endpoints => endpoints.MapFoundryResponses());

var app = builder.Build();
app.Run();
