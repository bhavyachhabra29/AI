<#
.SYNOPSIS
    Builds, pushes, and deploys the TripConcierge.HostedConcierge agent to Azure AI Foundry,
    auto-incrementing the image version on every run.

.DESCRIPTION
    `azd deploy` alone does not work reliably for this project on this setup:
      - Remote ACR Tasks builds are blocked on this subscription (TasksOperationsNotAllowed).
      - azd's own local-Docker fallback build has a bug (fails with "failed retrieving package
        result details") even when a plain `docker build` of the same Dockerfile succeeds.
    This script works around both: it builds and pushes the image itself, then calls
    `azd deploy --from-package <image>` to deploy that already-built image directly, skipping
    azd's broken build path entirely.

    Versioning: tags are read from the Container Registry (not a local file), so the next
    version number is always correct even if this script is run from a different machine.
    Each run produces vN (incrementing) and moves the `latest` tag; the deploy itself targets
    the specific vN tag, so what's running is always traceable to an exact image.

    Foundry separately versions the *agent* itself on every deploy with the same agent name
    (visible as `agent_reference.version` in API responses / `azd ai agent show`) - that
    happens automatically server-side and isn't something this script needs to manage.

.NOTES
    Run from the repo root: .\Deploy-HostedAgent.ps1
    Prerequisites: az login, azd provision already run once, Docker Desktop running.
#>

[CmdletBinding()]
param(
    [string]$ServiceName = "trip-concierge",
    [string]$DockerfilePath = "src/TripConcierge.HostedConcierge/Dockerfile",
    [int]$MaxRetries = 3
)

$repoRoot = $PSScriptRoot

function Invoke-WithRetry {
    param([scriptblock]$Action, [string]$Description)

    for ($attempt = 1; $attempt -le $MaxRetries; $attempt++) {
        & $Action
        if ($LASTEXITCODE -eq 0) { return }

        if ($attempt -eq $MaxRetries) {
            throw "$Description failed after $MaxRetries attempt(s) (exit code $LASTEXITCODE)."
        }
        Write-Host "  $Description failed (attempt $attempt/$MaxRetries, exit code $LASTEXITCODE)." -ForegroundColor Yellow
        Write-Host "  Retrying - Docker Desktop's network/DNS has been intermittently flaky in this environment." -ForegroundColor Yellow
        Start-Sleep -Seconds 3
    }
}

function Get-AzdEnvValue {
    param([string]$Key)
    $line = (azd env get-values 2>$null) | Where-Object { $_ -match "^$Key=" } | Select-Object -First 1
    if (-not $line) { return $null }
    return ($line -replace "^$Key=", '').Trim('"')
}

Write-Host "== Checking az login ==" -ForegroundColor Cyan
$account = az account show 2>$null
if (-not $account) {
    az login
    if ($LASTEXITCODE -ne 0) { throw "az login failed." }
}

Push-Location $repoRoot
try {
    Write-Host "== Reading azd environment ==" -ForegroundColor Cyan
    $acrLoginServer = Get-AzdEnvValue "AZURE_CONTAINER_REGISTRY_ENDPOINT"
    if (-not $acrLoginServer) {
        throw "AZURE_CONTAINER_REGISTRY_ENDPOINT not found in the azd environment. Run 'azd provision' first."
    }
    $acrName = $acrLoginServer.Split('.')[0]
    Write-Host "  Container Registry: $acrLoginServer"

    Write-Host "== Logging Docker in to ACR ==" -ForegroundColor Cyan
    Invoke-WithRetry -Description "az acr login" -Action { az acr login --name $acrName }

    Write-Host "== Determining next image version ==" -ForegroundColor Cyan
    $existingTags = az acr repository show-tags --name $acrName --repository $ServiceName --output tsv 2>$null
    $versionNumbers = @($existingTags | Where-Object { $_ -match '^v(\d+)$' } | ForEach-Object { [int]($_ -replace '^v', '') })
    $nextVersion = if ($versionNumbers.Count -gt 0) { ($versionNumbers | Measure-Object -Maximum).Maximum + 1 } else { 1 }
    $versionTag = "v$nextVersion"
    Write-Host "  Next version: $versionTag"

    $imageBase = "$acrLoginServer/$ServiceName"
    $versionedImage = "${imageBase}:$versionTag"
    $latestImage = "${imageBase}:latest"

    Write-Host "== Building $versionedImage ==" -ForegroundColor Cyan
    Invoke-WithRetry -Description "docker build" -Action {
        docker build -f $DockerfilePath -t $versionedImage -t $latestImage .
    }

    Write-Host "== Pushing image to ACR ==" -ForegroundColor Cyan
    Invoke-WithRetry -Description "docker push" -Action {
        docker push $imageBase --all-tags
    }

    Write-Host "== Deploying $versionTag to Azure AI Foundry ==" -ForegroundColor Cyan
    azd deploy $ServiceName --from-package $versionedImage --no-prompt
    if ($LASTEXITCODE -ne 0) { throw "azd deploy failed." }

    Write-Host ""
    Write-Host "== Current agent status ==" -ForegroundColor Cyan
    azd ai agent show $ServiceName

    Write-Host ""
    Write-Host "Done. Deployed image: $versionedImage" -ForegroundColor Green
}
finally {
    Pop-Location
}
