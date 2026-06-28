using TripConcierge.Shared.Configuration;
using TripConcierge.Web.Components;
using TripConcierge.Web.Services;

EnvironmentLoader.Load();

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddRazorComponents()
    .AddInteractiveServerComponents();

builder.Services.AddSingleton(AgentFrameworkSettings.FromEnvironment());
builder.Services.AddTransient<SequentialRunner>();
builder.Services.AddTransient<ConcurrentRunner>();
builder.Services.AddTransient<GroupChatRunner>();
builder.Services.AddScoped<HandoffRunner>();
builder.Services.AddScoped<FoundryHostedAgentClient>();

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error", createScopeForErrors: true);
    app.UseHsts();
}

app.UseStatusCodePagesWithReExecute("/not-found", createScopeForStatusCodePages: true);
app.UseHttpsRedirection();
app.UseAntiforgery();

app.MapStaticAssets();
app.MapRazorComponents<App>()
    .AddInteractiveServerRenderMode();

app.Run();
