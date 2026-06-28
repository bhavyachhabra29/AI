FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY . .

# A single integrated publish call (no separate restore step) - this package ships a Roslyn
# analyzer, and a separate `dotnet restore` followed by `publish --no-restore` was resolving a
# different (incomplete) package graph than one combined publish invocation does.
RUN dotnet publish "src/TripConcierge.HostedConcierge/TripConcierge.HostedConcierge.csproj" -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=build /app/publish .

ENTRYPOINT ["dotnet", "TripConcierge.HostedConcierge.dll"]
