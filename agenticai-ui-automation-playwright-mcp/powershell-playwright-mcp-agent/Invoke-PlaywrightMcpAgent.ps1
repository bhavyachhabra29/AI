<#
.SYNOPSIS
    Playwright MCP agent driven by a JSON instruction file and an LLM.

.DESCRIPTION
    Reads test steps from a JSON file or from all JSON files in an instructions folder,
    starts the Playwright MCP server as a subprocess (stdio transport), then runs an
    agentic loop: it calls OpenAI chat/completions with the Playwright tools exposed
    by the MCP server and forwards every tool call back to the MCP server until the
    LLM signals it is done.

.PARAMETER InstructionsPath
    Optional path to a single JSON file that contains automation steps.

.PARAMETER InstructionsFolder
    Optional path to a folder containing one or more JSON files.
    If neither InstructionsPath nor InstructionsFolder is provided, the script
    auto-detects "instruction files" or "InstructionFiles" next to this script.

.PARAMETER ConfigPath
    Path to agent-config.psd1.  Defaults to the file next to this script.

.EXAMPLE
    .\Invoke-PlaywrightMcpAgent.ps1 -InstructionsPath instructions_wikipedia.csv
#>
param(
    [string]$InstructionsPath,

    [string]$InstructionsFolder,

    [string]$ConfigPath = (Join-Path $PSScriptRoot "agent-config.psd1")
)

$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# Load config from PSD1
# ---------------------------------------------------------------------------
$cfgFull = [System.IO.Path]::GetFullPath($ConfigPath)
if (-not (Test-Path $cfgFull)) {
    throw "Config file not found: $cfgFull`nCopy agent-config.psd1 and fill in your settings."
}
$cfg = Import-PowerShellDataFile -Path $cfgFull

function Cfg {
    param([string]$Key, $Default = $null)
    if ($cfg.ContainsKey($Key) -and $null -ne $cfg[$Key] -and $cfg[$Key] -ne "") {
        return $cfg[$Key]
    }
    return $Default
}

$provider     = (Cfg "Provider" "openai").ToLower().Trim()
$isAzure      = ($provider -eq "azure")

$apiKey = if (-not [string]::IsNullOrWhiteSpace((Cfg "ApiKey"))) {
    Cfg "ApiKey"
} elseif ($isAzure) {
    $env:AZURE_OPENAI_API_KEY
} else {
    $env:OPENAI_API_KEY
}

$baseUrl      = Cfg "BaseUrl" "https://api.openai.com/v1"
$apiVersion   = Cfg "ApiVersion" "2024-10-21"
$model        = Cfg "Model"   "gpt-4o"
$maxTurns     = [int](Cfg "MaxTurns" 25)
$mcpHeaded    = [bool](Cfg "McpHeaded" $true)
$mcpBrowser   = Cfg "McpBrowser" "chromium"
$maxToolContentChars = [int](Cfg "MaxToolContentChars" 12000)

# ---------------------------------------------------------------------------
# Report directory (HTML report + screenshots per run)
# ---------------------------------------------------------------------------
$runTimestamp = (Get-Date).ToString("yyyyMMdd-HHmmss")
$reportRoot   = Join-Path $PSScriptRoot "Reports"
$reportDir    = Join-Path $reportRoot   "run-$runTimestamp"
$screenshotDir = Join-Path $reportDir   "screenshots"
$null = New-Item -ItemType Directory -Path $screenshotDir -Force
$reportFile   = Join-Path $reportDir   "report.html"
Write-Host "[INFO] Report directory: $reportDir" -ForegroundColor Cyan

# System prompt is intentionally defined here (not in agent-config.psd1) because
# multi-line strings with embedded quotes do not parse reliably in .psd1 files.
$systemPrompt = @"
You are a precise UI automation agent. You will be given a list of test steps. Execute every step in order using the Playwright browser tools available to you.

CRITICAL RULES for Playwright MCP tools:
1. NEVER use a 'selector' parameter. Use ONLY the exact parameters defined in each tool's schema.
2. The 'browser_snapshot' tool is NOT available. Do NOT attempt to call it.
3. For interaction tools (browser_click, browser_type, browser_hover, etc.), the element is identified via a single 'target' string parameter using Playwright locator syntax.
4. When the user instruction mentions an element by class, id, attribute, role, or text, translate it into a Playwright locator string for 'target'. Examples:
   - Instruction: "Click on link with the class: 'link-box' and title: 'English - Wikipedia - The Free Encyclopedia'"
     Call: {"target":"role=link[name*='English']"}
   - "Click the Sign in button" -> {"target":"role=button[name*='Sign in']"}
   - "Type into the Search box" -> {"target":"role=textbox[name*='Search']"}
   - "Click the English link" -> {"target":"role=link[name*='English']"}
5. ALWAYS use the substring/contains form `name*='...'` (with the asterisk) in role-based locators, NEVER the exact-match form `name='...'`. Pick the shortest distinctive substring of the visible/accessible name (e.g. just "English" rather than the full title). This is the only form that reliably matches.
6. Prefer role-based locators (role=link, role=button, role=textbox, role=heading, etc.) using a distinctive substring of the element's accessible name. Use CSS selectors only as a last resort.
7. For 'browser_wait_for', ALWAYS pass BOTH a 'target' (Playwright locator string for the element to wait on) AND a 'text' (the visible/expected text on the page). Example: {"target":"role=heading[name*='From today']","text":"From today's featured article"}. Never call browser_wait_for with only one of these.
8. For 'browser_evaluate', when there is any text extraction/summarization step, ALWAYS pass the arguments like this example: {"function":"Array.from(document.querySelectorAll('#mp-tfa > p')).map(el => el.textContent)"}
9. Inspect each tool's parameter schema carefully and pass only valid parameters.

After each step briefly confirm what you did and what you observed before moving to the next step. Never skip a step.
"@

Write-Host "[INFO] Provider: $provider" -ForegroundColor Cyan

if ([string]::IsNullOrWhiteSpace($apiKey)) {
    throw "No API key found.`nSet ApiKey in agent-config.psd1 or define the OPENAI_API_KEY environment variable."
}

# ---------------------------------------------------------------------------
# Resolve input files and normalise instructions per file
# ---------------------------------------------------------------------------
function Get-StepsTextFromInstructionFile {
    param([Parameter(Mandatory = $true)][string]$FilePath)

    function Decode-EncodedText {
        param([Parameter(Mandatory = $true)][string]$Text)

        $decoded = [System.Net.WebUtility]::HtmlDecode($Text)
        $decoded = [regex]::Replace($decoded, '\\u([0-9a-fA-F]{4})', {
            param($match)
            [char][convert]::ToInt32($match.Groups[1].Value, 16)
        })

        return $decoded
    }

    $rows = Import-Csv -Path $FilePath
    if ($null -eq $rows -or $rows.Count -eq 0) {
        throw "No rows found in CSV instruction file: $FilePath"
    }

    $stepsText = ""
    $currentUseCaseId = $null

    foreach ($row in $rows) {
        $useCaseId = Decode-EncodedText ([string]$row.'Use Case ID')
        $useCaseName = Decode-EncodedText ([string]$row.'Use Case Name')
        $useCaseDescription = Decode-EncodedText ([string]$row.'Use Case Description')
        $stepId = Decode-EncodedText ([string]$row.'Step ID')
        $stepDescription = Decode-EncodedText ([string]$row.'Step Description')

        if ($useCaseId -ne $currentUseCaseId) {
            if ($stepsText.Length -gt 0) {
                $stepsText += "`n"
            }

            $stepsText += "=== $useCaseName ===`n"
            if (-not [string]::IsNullOrWhiteSpace($useCaseDescription)) {
                $stepsText += "$useCaseDescription`n"
            }

            $currentUseCaseId = $useCaseId
        }

        $stepsText += "Step $($stepId): $stepDescription`n"
    }

    return $stepsText.TrimEnd()
}

function Resolve-DefaultInstructionsFolder {
    $candidateNames = @("instruction files", "InstructionFiles")
    foreach ($name in $candidateNames) {
        $candidate = Join-Path $PSScriptRoot $name
        if (Test-Path $candidate -PathType Container) {
            return [System.IO.Path]::GetFullPath($candidate)
        }
    }
    return $null
}

$instructionFiles = @()
if (-not [string]::IsNullOrWhiteSpace($InstructionsPath)) {
    $iPath = [System.IO.Path]::GetFullPath($InstructionsPath)
    if (-not (Test-Path $iPath -PathType Leaf)) {
        throw "Instructions file not found: $iPath"
    }
    $instructionFiles = @($iPath)
} else {
    $folderPath = if (-not [string]::IsNullOrWhiteSpace($InstructionsFolder)) {
        [System.IO.Path]::GetFullPath($InstructionsFolder)
    } else {
        Resolve-DefaultInstructionsFolder
    }

    if ([string]::IsNullOrWhiteSpace($folderPath) -or -not (Test-Path $folderPath -PathType Container)) {
        throw "Instructions folder not found. Provide -InstructionsFolder or create 'instruction files' / 'InstructionFiles' next to the script."
    }

    $instructionFiles = @(Get-ChildItem -Path $folderPath -Filter *.csv -File | Sort-Object Name | ForEach-Object { $_.FullName })
    if ($instructionFiles.Count -eq 0) {
        throw "No CSV instruction files found in folder: $folderPath"
    }
}

Write-Host "[INFO] Found $($instructionFiles.Count) instruction file(s)." -ForegroundColor Cyan

# ---------------------------------------------------------------------------
# Ensure Node.js and npx are available (non-admin per-user install fallback)
# ---------------------------------------------------------------------------
function Test-CommandAvailable {
    param([Parameter(Mandatory = $true)][string]$Name)
    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Add-NodePathsToCurrentSession {
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA "Programs\nodejs"),
        (Join-Path $env:ProgramFiles "nodejs")
    )

    foreach ($p in $candidates) {
        if (Test-Path $p) {
            $pathParts = $env:Path -split ";"
            if ($pathParts -notcontains $p) {
                $env:Path = "$p;$env:Path"
            }
        }
    }
}

function Get-NodeMsiUrl {
    $archToken = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }
    $fileToken = "win-$archToken-msi"
    $index = Invoke-RestMethod -Uri "https://nodejs.org/dist/index.json" -Method Get -TimeoutSec 30

    $candidate = $index |
        Where-Object { $_.lts -and ($_.files -contains $fileToken) } |
        Select-Object -First 1

    if ($null -eq $candidate) {
        throw "Could not find a suitable Node.js LTS MSI in Node distribution index."
    }

    return "https://nodejs.org/dist/$($candidate.version)/node-$($candidate.version)-$fileToken.msi"
}

function Ensure-NodeInstalled {
    Add-NodePathsToCurrentSession
    if ((Test-CommandAvailable -Name "node") -and (Test-CommandAvailable -Name "npx")) {
        return
    }

    Write-Host "[INFO] Node.js not found. Installing Node.js (per-user, silent)..." -ForegroundColor Yellow

    $msiUrl = Get-NodeMsiUrl
    $tmpMsi = Join-Path $env:TEMP ("node-lts-{0}.msi" -f [Guid]::NewGuid().ToString("N"))

    Write-Host "[INFO] Downloading: $msiUrl" -ForegroundColor Cyan
    Invoke-WebRequest -Uri $msiUrl -OutFile $tmpMsi -UseBasicParsing -TimeoutSec 300

    try {
        $msiArgs = @(
            "/i", "`"$tmpMsi`"",
            "/qn",
            "/norestart",
            "ALLUSERS=2",
            "MSIINSTALLPERUSER=1"
        )

        $proc = Start-Process -FilePath "msiexec.exe" -ArgumentList $msiArgs -Wait -PassThru
        if ($proc.ExitCode -ne 0) {
            throw "Node.js MSI installation failed with exit code $($proc.ExitCode)."
        }
    } finally {
        if (Test-Path $tmpMsi) {
            Remove-Item -Path $tmpMsi -Force -ErrorAction SilentlyContinue
        }
    }

    Add-NodePathsToCurrentSession
    if (-not (Test-CommandAvailable -Name "node")) {
        throw "Node.js installation completed but node.exe is still unavailable in this session."
    }
    if (-not (Test-CommandAvailable -Name "npx")) {
        throw "Node.js installation completed but npx is still unavailable in this session."
    }

    Write-Host "[INFO] Node.js ready: $(node --version)" -ForegroundColor Green
}

Ensure-NodeInstalled

# ---------------------------------------------------------------------------
# Ensure Playwright browsers are installed
# ---------------------------------------------------------------------------
function Ensure-PlaywrightBrowserInstalled {
    param([Parameter(Mandatory = $true)][string]$BrowserName)

    # Run npm install scoped to THIS script's folder, NOT the caller's current
    # directory. Otherwise running run-agent.bat from the repo root would add
    # @playwright/test to the root web app's package.json / package-lock.json.
    $installPkgCmd = "npm install @playwright/test"
    $installBrowsersCmd = "npx playwright install"

    Write-Host "[INFO] Ensuring Playwright browser support for: $BrowserName" -ForegroundColor Cyan
    Write-Host "[INFO] Install directory: $PSScriptRoot" -ForegroundColor DarkCyan

    Push-Location $PSScriptRoot
    try {
        # Make sure a local package.json exists so npm install creates its
        # node_modules / package-lock.json inside this folder rather than
        # walking up and modifying a parent project's package.json.
        $localPkgJson = Join-Path $PSScriptRoot "package.json"
        if (-not (Test-Path $localPkgJson)) {
            Write-Host "[INFO] Creating local package.json in $PSScriptRoot" -ForegroundColor DarkCyan
            $initOutput = Invoke-Expression -Command "npm init -y" 2>&1 | Out-String
            if ($LASTEXITCODE -ne 0) {
                throw "npm init failed with exit code $LASTEXITCODE.`nOutput: $initOutput"
            }
        }

        Write-Host "[INFO] Running: $installPkgCmd" -ForegroundColor DarkCyan
        $pkgOutput = Invoke-Expression -Command $installPkgCmd 2>&1 | Out-String
        if ($LASTEXITCODE -ne 0) {
            throw "Playwright package install failed with exit code $LASTEXITCODE.`nOutput: $pkgOutput"
        }

        Write-Host "[INFO] Running: $installBrowsersCmd" -ForegroundColor DarkCyan
        $browserOutput = Invoke-Expression -Command $installBrowsersCmd 2>&1 | Out-String
        if ($LASTEXITCODE -ne 0) {
            throw "Playwright browser install failed with exit code $LASTEXITCODE.`nOutput: $browserOutput"
        }

        Write-Host "[INFO] Playwright browsers are installed." -ForegroundColor Green
    } catch {
        throw "Failed to install Playwright browsers for '$BrowserName': $($_.Exception.Message)"
    } finally {
        Pop-Location
    }
}

Ensure-PlaywrightBrowserInstalled -BrowserName $mcpBrowser

# ---------------------------------------------------------------------------
# Start Playwright MCP server (stdio transport)
# ---------------------------------------------------------------------------
$mcpCmd = "npx --yes @playwright/mcp@latest --browser $mcpBrowser"
if (-not $mcpHeaded) { $mcpCmd += " --headless" }

Write-Host "[INFO] Starting MCP server: $mcpCmd" -ForegroundColor Cyan
Write-Host "[INFO] This may take 30-60 seconds on first run..." -ForegroundColor Yellow

$psi                        = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName               = "cmd.exe"
$psi.Arguments              = "/c $mcpCmd"
$psi.UseShellExecute        = $false
$psi.RedirectStandardInput  = $true
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError  = $true
$psi.CreateNoWindow         = $true

$mcpProc = [System.Diagnostics.Process]::Start($psi)

# Drain stderr asynchronously so its buffer never blocks stdout reads
$stderrSb = [System.Text.StringBuilder]::new()
$stderrEvent = Register-ObjectEvent -InputObject $mcpProc -EventName "ErrorDataReceived" -Action {
    if (-not [string]::IsNullOrEmpty($EventArgs.Data)) {
        [void]$Event.MessageData.AppendLine($EventArgs.Data)
    }
} -MessageData $stderrSb
$mcpProc.BeginErrorReadLine()

Start-Sleep -Milliseconds 500
if ($mcpProc.HasExited) {
    $stderrText = $stderrSb.ToString().Trim()
    if ([string]::IsNullOrWhiteSpace($stderrText)) {
        $stderrText = "[no stderr output captured]"
    }
    throw "MCP server failed to start (exit code $($mcpProc.ExitCode)).`nCommand: $mcpCmd`nStderr:`n$stderrText"
}

# ---------------------------------------------------------------------------
# MCP JSON-RPC helpers
# ---------------------------------------------------------------------------
$mcpId = 1

function Send-McpLine([string]$Json) {
    $mcpProc.StandardInput.WriteLine($Json)
    $mcpProc.StandardInput.Flush()
}

function Normalize-StringValues {
    param($InputObject)

    if ($null -eq $InputObject) {
        return $null
    }

    if ($InputObject -is [string]) {
        $value = [System.Net.WebUtility]::HtmlDecode($InputObject)
        $value = [regex]::Replace($value, '\\u([0-9a-fA-F]{4})', {
            param($match)
            [char][convert]::ToInt32($match.Groups[1].Value, 16)
        })
        return $value
    }

    if ($InputObject -is [System.Collections.IDictionary]) {
        $copy = [ordered]@{}
        foreach ($key in $InputObject.Keys) {
            $copy[$key] = Normalize-StringValues -InputObject $InputObject[$key]
        }
        return $copy
    }

    if ($InputObject -is [System.Collections.IEnumerable] -and -not ($InputObject -is [string])) {
        $items = @()
        foreach ($item in $InputObject) {
            $items += Normalize-StringValues -InputObject $item
        }
        return $items
    }

    $properties = $InputObject.PSObject.Properties
    if ($null -ne $properties -and $properties.Count -gt 0) {
        $copy = [ordered]@{}
        foreach ($prop in $properties) {
            $copy[$prop.Name] = Normalize-StringValues -InputObject $prop.Value
        }
        return [PSCustomObject]$copy
    }

    return $InputObject
}

function Get-McpProcessFailureDetails {
    $stderrText = $stderrSb.ToString().Trim()
    if ([string]::IsNullOrWhiteSpace($stderrText)) {
        $stderrText = "[no stderr output captured]"
    }

    $exitText = if ($mcpProc.HasExited) { "$($mcpProc.ExitCode)" } else { "running" }
    return "MCP process state: exit=$exitText`nCommand: $mcpCmd`nStderr:`n$stderrText"
}

function Read-McpResponse([int]$ForId, [int]$TimeoutMs = 90000) {
    $deadline = (Get-Date).AddMilliseconds($TimeoutMs)
    $pendingReadTask = $null

    while ($true) {
        $remaining = [int](($deadline - (Get-Date)).TotalMilliseconds)
        if ($remaining -le 0) { throw "Timeout waiting for MCP response (id=$ForId)" }
        if ($mcpProc.HasExited) {
            throw "MCP server exited unexpectedly while waiting for response (id=$ForId).`n$(Get-McpProcessFailureDetails)"
        }

        if ($null -eq $pendingReadTask) {
            $pendingReadTask = $mcpProc.StandardOutput.ReadLineAsync()
        }

        $finished = $pendingReadTask.Wait([Math]::Min($remaining, 5000))
        if (-not $finished) { continue }

        $line = $pendingReadTask.Result
        $pendingReadTask = $null

        if ($null -eq $line) {
            throw "MCP stdout stream closed while waiting for response (id=$ForId).`n$(Get-McpProcessFailureDetails)"
        }
        if ([string]::IsNullOrWhiteSpace($line)) { continue }

        # Skip non-JSON lines that some versions emit on startup
        try { $msg = $line | ConvertFrom-Json } catch { continue }

        # Match response by id; skip notifications (no id field)
        $idProp = $msg.PSObject.Properties["id"]
        if ($null -ne $idProp -and $msg.id -eq $ForId) {
            $errProp = $msg.PSObject.Properties["error"]
            if ($null -ne $errProp) {
                throw "MCP error (id=$ForId): $($msg.error | ConvertTo-Json -Depth 5 -Compress)"
            }
            return $msg.result
        }
        # Notification or unrelated response – discard and keep reading
    }
}

function Invoke-McpRequest([string]$Method, $Params = $null, [int]$TimeoutMs = 90000) {
    $id = $script:mcpId++
    $req = [ordered]@{ jsonrpc = "2.0"; id = $id; method = $Method }
    if ($null -ne $Params) { $req.params = $Params }
    Send-McpLine -Json ($req | ConvertTo-Json -Depth 20 -Compress)
    return Read-McpResponse -ForId $id -TimeoutMs $TimeoutMs
}

function Send-McpNotification([string]$Method) {
    $n = [ordered]@{ jsonrpc = "2.0"; method = $Method; params = [ordered]@{} }
    Send-McpLine -Json ($n | ConvertTo-Json -Depth 5 -Compress)
}

# ---------------------------------------------------------------------------
# MCP handshake
# ---------------------------------------------------------------------------
Write-Host "[INFO] Initialising MCP connection..." -ForegroundColor Cyan

$initResult = Invoke-McpRequest -Method "initialize" -Params ([ordered]@{
    protocolVersion = "2024-11-05"
    capabilities    = [ordered]@{
        roots   = [ordered]@{ listChanged = $false }
        sampling = [ordered]@{}
    }
    clientInfo = [ordered]@{ name = "ps-playwright-agent"; version = "1.0.0" }
})

$srvName = $initResult.serverInfo.name
$srvVer  = $initResult.serverInfo.version
Write-Host "[INFO] Connected: $srvName v$srvVer" -ForegroundColor Green

Send-McpNotification -Method "notifications/initialized"

# ---------------------------------------------------------------------------
# Discover tools and convert to OpenAI function format
# ---------------------------------------------------------------------------
$toolsResult = Invoke-McpRequest -Method "tools/list" -Params ([ordered]@{})
$mcpTools    = $toolsResult.tools

Write-Host "[DEBUG] Tool definitions being sent to OpenAI:" -ForegroundColor DarkGray
$openAiTools | ForEach-Object {
    $toolName = $_.function.name
    $toolParams = $_.function.parameters | ConvertTo-Json -Compress
    Write-Host "  $toolName : $toolParams" -ForegroundColor DarkGray
}
Write-Host "[INFO] $($mcpTools.Count) Playwright tools available" -ForegroundColor Green

function Convert-ToOpenAiJsonSchema {
    param($Schema)

    if ($null -eq $Schema) {
        return [ordered]@{ type = "object"; properties = [ordered]@{}; additionalProperties = $true }
    }

    $isDict = $Schema -is [System.Collections.IDictionary]
    $props = if ($isDict) { $null } else { $Schema.PSObject.Properties }
    if (-not $isDict -and ($null -eq $props -or $props.Count -eq 0)) {
        return [ordered]@{ type = "object"; properties = [ordered]@{}; additionalProperties = $true }
    }

    $out = [ordered]@{}

    # Copy only JSON Schema fields the OpenAI validator accepts reliably.
    $copyFields = @("type", "description", "enum", "const", "default", "format", "minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems", "additionalProperties")
    foreach ($field in $copyFields) {
        $value = if ($isDict) { $Schema[$field] } else { $Schema.PSObject.Properties[$field].Value }
        if ($null -ne $value) {
            $out[$field] = $value
        }
    }

    $propertiesValue = if ($isDict) { $Schema["properties"] } else { $Schema.PSObject.Properties["properties"].Value }
    if ($null -ne $propertiesValue -and $propertiesValue -is [System.Collections.IDictionary]) {
        $safeProps = [ordered]@{}
        foreach ($k in $propertiesValue.Keys) {
            $safeProps[[string]$k] = Convert-ToOpenAiJsonSchema -Schema $propertiesValue[$k]
        }
        $out["properties"] = $safeProps
    }

    $requiredValue = if ($isDict) { $Schema["required"] } else { $Schema.PSObject.Properties["required"].Value }
    if ($null -ne $requiredValue) {
        if ($requiredValue -is [System.Collections.IEnumerable] -and -not ($requiredValue -is [string])) {
            $required = @()
            foreach ($r in $requiredValue) {
                $required += [string]$r
            }
            $out["required"] = $required
        } elseif ($requiredValue -is [System.Collections.IDictionary]) {
            # Some MCP schemas emit required as an object map; convert to key array.
            $required = @()
            foreach ($k in $requiredValue.Keys) {
                $required += [string]$k
            }
            $out["required"] = $required
        }
    }

    $itemsValue = if ($isDict) { $Schema["items"] } else { $Schema.PSObject.Properties["items"].Value }
    if ($null -ne $itemsValue) {
        $out["items"] = Convert-ToOpenAiJsonSchema -Schema $itemsValue
    }

    foreach ($combiner in @("anyOf", "oneOf", "allOf")) {
        $combinerValue = if ($isDict) { $Schema[$combiner] } else { $Schema.PSObject.Properties[$combiner].Value }
        if ($null -ne $combinerValue -and $combinerValue -is [System.Collections.IEnumerable] -and -not ($combinerValue -is [string])) {
            $safe = @()
            foreach ($entry in $combinerValue) {
                $safe += Convert-ToOpenAiJsonSchema -Schema $entry
            }
            $out[$combiner] = $safe
        }
    }

    if (-not $out.Contains("type") -and $out.Contains("properties")) {
        $out["type"] = "object"
    }

    if ($out.Contains("type") -and $out["type"] -eq "object" -and -not $out.Contains("properties")) {
        $out["properties"] = [ordered]@{}
    }

    if (-not $out.Contains("type") -and -not $out.Contains("properties")) {
        $out["type"] = "object"
        $out["properties"] = [ordered]@{}
        $out["additionalProperties"] = $true
    }

    return $out
}

# Exclude browser_snapshot — its large YAML output breaks subsequent request bodies.
$excludedTools = @("browser_snapshot")
$openAiTools = @(foreach ($t in $mcpTools) {
    if ($excludedTools -contains $t.name) { continue }
    [ordered]@{
        type     = "function"
        function = [ordered]@{
            name        = $t.name
            description = $t.description
            parameters  = Convert-ToOpenAiJsonSchema -Schema $t.inputSchema
        }
    }
})

# ---------------------------------------------------------------------------
# chat/completions caller
# ---------------------------------------------------------------------------
function Get-ObjectValue {
    param(
        [Parameter(Mandatory = $true)]$InputObject,
        [Parameter(Mandatory = $true)][string]$Name
    )

    if ($InputObject -is [System.Collections.IDictionary]) {
        return $InputObject[$Name]
    }

    $prop = $InputObject.PSObject.Properties[$Name]
    if ($null -ne $prop) {
        return $prop.Value
    }

    return $null
}

function Convert-ToolCallsForRequest {
    param([Parameter(Mandatory = $true)]$ToolCalls)

    $normalizedToolCalls = @()
    foreach ($toolCall in @($ToolCalls)) {
        $functionDef = Get-ObjectValue -InputObject $toolCall -Name "function"
        $normalizedToolCalls += [ordered]@{
            id       = [string](Get-ObjectValue -InputObject $toolCall -Name "id")
            type     = [string](Get-ObjectValue -InputObject $toolCall -Name "type")
            function = [ordered]@{
                name      = [string](Get-ObjectValue -InputObject $functionDef -Name "name")
                arguments = [string](Get-ObjectValue -InputObject $functionDef -Name "arguments")
            }
        }
    }

    return $normalizedToolCalls
}

function Ensure-ToolCallsArray {
    param($ToolCalls)

    if ($null -eq $ToolCalls) {
        return @()
    }

    if ($ToolCalls -is [string]) {
        return @($ToolCalls)
    }

    if ($ToolCalls -is [System.Collections.IDictionary]) {
        return @($ToolCalls)
    }

    if ($ToolCalls -is [System.Collections.IEnumerable]) {
        return @($ToolCalls)
    }

    return @($ToolCalls)
}

function Convert-MessagesForChatCompletion {
    param([Parameter(Mandatory = $true)]$SourceMessages)

    $normalizedMessages = @()
    foreach ($message in @($SourceMessages)) {
        $role = [string](Get-ObjectValue -InputObject $message -Name "role")
        $content = Get-ObjectValue -InputObject $message -Name "content"

        switch ($role) {
            "assistant" {
                $toolCalls = Get-ObjectValue -InputObject $message -Name "tool_calls"
                $entry = [ordered]@{ role = "assistant" }
                $entry.content = if ($null -eq $content) { "" } else { [string]$content }
                if ($null -ne $toolCalls) {
                    $normalizedToolCalls = Convert-ToolCallsForRequest -ToolCalls $toolCalls
                    $entry.tool_calls = Ensure-ToolCallsArray -ToolCalls $normalizedToolCalls
                }
                $normalizedMessages += $entry
            }
            "tool" {
                $normalizedMessages += [ordered]@{
                    role         = "tool"
                    tool_call_id = [string](Get-ObjectValue -InputObject $message -Name "tool_call_id")
                    content      = if ($null -eq $content) { "" } else { [string]$content }
                }
            }
            default {
                $normalizedMessages += [ordered]@{
                    role    = $role
                    content = if ($null -eq $content) { "" } else { [string]$content }
                }
            }
        }
    }

    return $normalizedMessages
}



function Get-HttpErrorBody {
    param(
        [Parameter(Mandatory = $true)]$ErrorRecord,
        $Exception = $null
    )

    if ($null -ne $ErrorRecord.ErrorDetails -and -not [string]::IsNullOrWhiteSpace($ErrorRecord.ErrorDetails.Message)) {
        return $ErrorRecord.ErrorDetails.Message
    }

    if ($null -eq $Exception) {
        $Exception = $ErrorRecord.Exception
    }
    if ($null -eq $Exception) {
        return $null
    }

    $response = $Exception.Response
    if ($null -eq $response -and $null -ne $Exception.InnerException) {
        $response = $Exception.InnerException.Response
    }
    if ($null -eq $response) {
        return $null
    }

    try {
        $stream = $response.GetResponseStream()
        if ($null -eq $stream) {
            return $null
        }

        if ($stream.CanSeek) {
            $stream.Seek(0, [System.IO.SeekOrigin]::Begin) | Out-Null
        }

        $reader = New-Object System.IO.StreamReader($stream)
        try {
            return $reader.ReadToEnd()
        } finally {
            $reader.Dispose()
        }
    } catch {
        return $null
    }
}

function Get-HttpStatusSummary {
    param([Parameter(Mandatory = $true)]$Exception)

    $response = $Exception.Response
    if ($null -eq $response -and $null -ne $Exception.InnerException) {
        $response = $Exception.InnerException.Response
    }
    if ($null -eq $response) {
        return $null
    }

    try {
        $statusCode = [int]$response.StatusCode
        $statusText = [string]$response.StatusDescription
        return "HTTP $statusCode $statusText".Trim()
    } catch {
        return $null
    }
}

function Ensure-ToolCallsArrays {
    param([Parameter(Mandatory = $true)]$Messages)

    foreach ($msg in $Messages) {
        if ($msg.role -eq "assistant" -and $null -ne $msg.tool_calls) {
            # Force tool_calls to be @() array to prevent ConvertTo-Json from collapsing single-element arrays
            if ($msg.tool_calls -isnot [object[]]) {
                $msg.tool_calls = @($msg.tool_calls)
            } else {
                # Even if already an array, rebuild to ensure it survives JSON serialization
                $msg.tool_calls = @($msg.tool_calls)
            }
        }
    }
    return $Messages
}

function Invoke-ChatCompletion {
    param([Parameter(Mandatory = $true)]$ChatMessages)

    $normalizedMessages = @(Convert-MessagesForChatCompletion -SourceMessages $ChatMessages)
    $normalizedMessages = Ensure-ToolCallsArrays -Messages $normalizedMessages

    $payload = [ordered]@{
        model       = $model
        messages    = $normalizedMessages
        tools       = $openAiTools
        tool_choice = "auto"
    }
    $body = $payload | ConvertTo-Json -Depth 30 -Compress

    if ($isAzure) {
        # Azure OpenAI / Azure-compatible proxy:
        # - Header: api-key
        # - Endpoint: <BaseUrl>/chat/completions?api-version=<ApiVersion>
        $headers = @{
            "api-key"      = $apiKey
            "Content-Type" = "application/json"
        }
        $endpoint = $baseUrl.TrimEnd("/") + "/chat/completions?api-version=$apiVersion"
    } else {
        # Standard OpenAI or OpenAI-compatible proxy:
        # - Header: Authorization: Bearer <key>
        $headers = @{
            "Authorization" = "Bearer $apiKey"
            "Content-Type"  = "application/json"
        }
        $endpoint = $baseUrl.TrimEnd("/") + "/chat/completions"
    }

    try {
        return Invoke-RestMethod -Method Post -Uri $endpoint -Headers $headers -Body $body -TimeoutSec 180
    } catch {
        $errorBody = Get-HttpErrorBody -ErrorRecord $_ -Exception $_.Exception
        $statusSummary = Get-HttpStatusSummary -Exception $_.Exception
        $payloadPreview = if ($body.Length -gt 1200) { $body.Substring(0, 1200) + "..." } else { $body }
        if (-not [string]::IsNullOrWhiteSpace($errorBody)) {
            throw "Chat completion request failed: $($_.Exception.Message)`nStatus: $statusSummary`nEndpoint: $endpoint`nResponse body: $errorBody"
        }
        throw "Chat completion request failed: $($_.Exception.Message)`nStatus: $statusSummary`nEndpoint: $endpoint`nPayload preview: $payloadPreview"
    }
}

# ---------------------------------------------------------------------------
# Screenshot capture + HTML report
# ---------------------------------------------------------------------------
function Invoke-StepScreenshot {
    param(
        [Parameter(Mandatory = $true)][string]$FileNamePrefix
    )
    # Returns the relative path of the saved screenshot (relative to $reportDir),
    # or $null if capture failed. Uses MCP browser_take_screenshot and decodes
    # the returned base64 image content into a PNG file under $screenshotDir.
    try {
        $shotResult = Invoke-McpRequest -Method "tools/call" -Params ([ordered]@{
            name      = "browser_take_screenshot"
            arguments = [PSCustomObject]@{}
        }) -TimeoutMs 60000
    } catch {
        Write-Host "    [WARN] Screenshot failed: $($_.Exception.Message)" -ForegroundColor DarkYellow
        return $null
    }

    $contentProp = $shotResult.PSObject.Properties["content"]
    if ($null -eq $contentProp -or $null -eq $contentProp.Value) { return $null }

    foreach ($item in $contentProp.Value) {
        $typeProp = $item.PSObject.Properties["type"]
        if ($null -eq $typeProp) { continue }
        if ($typeProp.Value -ne "image") { continue }

        $dataProp = $item.PSObject.Properties["data"]
        $mimeProp = $item.PSObject.Properties["mimeType"]
        if ($null -eq $dataProp -or [string]::IsNullOrWhiteSpace($dataProp.Value)) { continue }

        $ext = "png"
        if ($null -ne $mimeProp -and $mimeProp.Value -match "jpeg|jpg") { $ext = "jpg" }

        $safe = ($FileNamePrefix -replace '[^A-Za-z0-9_\-]', '_')
        $fileName = "$safe.$ext"
        $absPath  = Join-Path $screenshotDir $fileName
        try {
            [IO.File]::WriteAllBytes($absPath, [Convert]::FromBase64String($dataProp.Value))
            return "screenshots/$fileName"
        } catch {
            Write-Host "    [WARN] Failed to write screenshot: $($_.Exception.Message)" -ForegroundColor DarkYellow
            return $null
        }
    }
    return $null
}

function Encode-HtmlText {
    param([string]$Text)
    if ($null -eq $Text) { return "" }
    return [System.Net.WebUtility]::HtmlEncode($Text)
}

function Write-HtmlReport {
    param(
        [Parameter(Mandatory = $true)][string]$OutFile,
        [Parameter(Mandatory = $true)]$RunData
    )

    $sb = New-Object System.Text.StringBuilder
    [void]$sb.AppendLine('<!DOCTYPE html>')
    [void]$sb.AppendLine('<html lang="en"><head><meta charset="utf-8">')
    [void]$sb.AppendLine('<title>Playwright MCP Agent Report</title>')
    [void]$sb.AppendLine(@'
<style>
 body{font-family:Segoe UI,Arial,sans-serif;margin:0;padding:24px;background:#f5f6f8;color:#222}
 h1{margin:0 0 4px 0}
 .meta{color:#666;margin-bottom:24px}
 .file-block{background:#fff;border:1px solid #e2e4e8;border-radius:6px;padding:16px 20px;margin-bottom:24px;box-shadow:0 1px 2px rgba(0,0,0,0.04)}
 .file-block h2{margin-top:0;border-bottom:1px solid #eee;padding-bottom:8px}
 .status-ok{color:#0a7d2c;font-weight:600}
 .status-fail{color:#b00020;font-weight:600}
 .step{border-left:3px solid #2a73d4;background:#fafbfd;padding:10px 14px;margin:10px 0;border-radius:4px}
 .step.assistant{border-left-color:#7a4ed4;background:#faf8fd}
 .step .head{font-size:13px;color:#555;margin-bottom:6px}
 .step .tool{font-weight:600;color:#2a73d4}
 .step .args, .step .result{font-family:Consolas,Menlo,monospace;font-size:12px;background:#0f172a;color:#e2e8f0;padding:8px 10px;border-radius:4px;overflow-x:auto;white-space:pre-wrap;word-break:break-word;max-height:280px;overflow-y:auto}
 .step .args{background:#1e293b}
 .step img{margin-top:10px;max-width:100%;border:1px solid #ccc;border-radius:4px;display:block}
 .assistant .body{white-space:pre-wrap;font-size:14px;line-height:1.45}
 .label{display:inline-block;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#888;margin:8px 0 2px}
 details summary{cursor:pointer;color:#2a73d4;font-size:12px;margin-top:6px}
</style>
'@)
    [void]$sb.AppendLine('</head><body>')
    [void]$sb.AppendLine("<h1>Playwright MCP Agent Report</h1>")
    [void]$sb.AppendLine("<div class='meta'>Run: $runTimestamp &middot; Model: $(Encode-HtmlText $model) &middot; Provider: $(Encode-HtmlText $provider)</div>")

    foreach ($file in $RunData.Keys) {
        $entry = $RunData[$file]
        $statusClass = if ($entry.Success) { "status-ok" } else { "status-fail" }
        $statusText  = if ($entry.Success) { "SUCCESS" } else { "FAILED" }
        [void]$sb.AppendLine("<div class='file-block'>")
        [void]$sb.AppendLine("<h2>$(Encode-HtmlText ([IO.Path]::GetFileName($file))) &mdash; <span class='$statusClass'>$statusText</span></h2>")
        [void]$sb.AppendLine("<div class='meta'>$(Encode-HtmlText $file)</div>")

        if ($entry.Steps.Count -eq 0) {
            [void]$sb.AppendLine("<p><em>No steps recorded.</em></p>")
        }

        foreach ($step in $entry.Steps) {
            if ($step.Kind -eq "tool") {
                [void]$sb.AppendLine("<div class='step'>")
                [void]$sb.AppendLine("<div class='head'>Step $($step.Index) &middot; <span class='tool'>$(Encode-HtmlText $step.ToolName)</span></div>")
                [void]$sb.AppendLine("<div class='label'>Arguments</div>")
                [void]$sb.AppendLine("<div class='args'>$(Encode-HtmlText $step.Args)</div>")
                [void]$sb.AppendLine("<details><summary>Tool result</summary><div class='result'>$(Encode-HtmlText $step.Result)</div></details>")
                if (-not [string]::IsNullOrWhiteSpace($step.Screenshot)) {
                    [void]$sb.AppendLine("<img src='$(Encode-HtmlText $step.Screenshot)' alt='Screenshot for step $($step.Index)'>")
                }
                [void]$sb.AppendLine("</div>")
            }
            elseif ($step.Kind -eq "assistant") {
                if ([string]::IsNullOrWhiteSpace($step.Text)) { continue }
                [void]$sb.AppendLine("<div class='step assistant'>")
                [void]$sb.AppendLine("<div class='head'>Assistant message (turn $($step.Turn))</div>")
                [void]$sb.AppendLine("<div class='body'>$(Encode-HtmlText $step.Text)</div>")
                [void]$sb.AppendLine("</div>")
            }
        }
        [void]$sb.AppendLine("</div>")
    }

    [void]$sb.AppendLine('</body></html>')
    [IO.File]::WriteAllText($OutFile, $sb.ToString(), [System.Text.UTF8Encoding]::new($false))
}

# ---------------------------------------------------------------------------
# Agentic loop (per file)
# ---------------------------------------------------------------------------
function Invoke-AgentRunForFile {
    param(
        [Parameter(Mandatory = $true)][string]$InstructionFile,
        [Parameter(Mandatory = $true)][string]$StepsText
    )

    Write-Host "`n[INFO] Running instructions from: $([System.IO.Path]::GetFileName($InstructionFile))" -ForegroundColor Cyan
    Write-Host "[INFO] Agent starting (max $maxTurns turns)..." -ForegroundColor Cyan
    Write-Host ("=" * 60) -ForegroundColor DarkGray

    # Step log for HTML report
    $script:stepLog = New-Object System.Collections.ArrayList
    $script:stepCounter = 0
    $fileSlug = [IO.Path]::GetFileNameWithoutExtension($InstructionFile) -replace '[^A-Za-z0-9_\-]', '_'

    # Detect extraction / summarization intent in the instructions. When set, large
    # tool outputs are NOT appended to the chat history (only a short placeholder is),
    # because echoing big extracted/summarized text back to the LLM has been observed
    # to break the JSON body of the next request. The full text is still recorded in
    # the HTML report via the step log.
    $script:extractMode = ($StepsText -match '(?i)\b(extract|summari[sz]e|summary|capture|read\s+the\s+text|get\s+the\s+text)\b')
    if ($script:extractMode) {
        Write-Host "[INFO] Extract/summarize mode detected: tool outputs over 500 chars will be replaced with a placeholder in chat history (full text kept in report)." -ForegroundColor Cyan
    }

    $messages = New-Object System.Collections.ArrayList
    [void]$messages.Add([ordered]@{ role = "system"; content = $systemPrompt })
    [void]$messages.Add([ordered]@{
        role    = "user"
        content = "Execute these automation steps using the Playwright browser tools. Work through each step in the exact order listed.`n`n$StepsText"
    })

    $turn = 0
    $done = $false

    while (-not $done -and $turn -lt $maxTurns) {
        $turn++
        Write-Host "`n[Turn $turn / $maxTurns]" -ForegroundColor Yellow

        $resp   = Invoke-ChatCompletion -ChatMessages $messages
        $choice = $resp.choices[0]
        $aMsg   = $choice.message
        $reason = $choice.finish_reason

        # ---- Build assistant entry ----
        $assistantEntry = [ordered]@{ role = "assistant" }

        $contentProp   = $aMsg.PSObject.Properties["content"]
        $toolCallsProp = $aMsg.PSObject.Properties["tool_calls"]

        $assistantEntry.content = if ($null -ne $contentProp -and $null -ne $contentProp.Value) { [string]$contentProp.Value } else { "" }
        if ($null -ne $toolCallsProp -and $null -ne $toolCallsProp.Value) {
            $assistantEntry.tool_calls = Ensure-ToolCallsArray -ToolCalls (Convert-ToolCallsForRequest -ToolCalls $toolCallsProp.Value)
        }
        [void]$messages.Add($assistantEntry)

        # ---- Handle finish reason ----
        switch ($reason) {
            "stop" {
                Write-Host "`n[DONE] Agent finished." -ForegroundColor Green
                Write-Host ("=" * 60) -ForegroundColor DarkGray
                if ($null -ne $contentProp -and -not [string]::IsNullOrWhiteSpace($contentProp.Value)) {
                    Write-Host $contentProp.Value
                    [void]$script:stepLog.Add([ordered]@{
                        Kind = "assistant"
                        Turn = $turn
                        Text = [string]$contentProp.Value
                    })
                }
                $done = $true
            }

            "tool_calls" {
                # If the assistant emitted a narrative message alongside tool calls, record it.
                if ($null -ne $contentProp -and -not [string]::IsNullOrWhiteSpace($contentProp.Value)) {
                    [void]$script:stepLog.Add([ordered]@{
                        Kind = "assistant"
                        Turn = $turn
                        Text = [string]$contentProp.Value
                    })
                }
                foreach ($tc in $assistantEntry.tool_calls) {
                    $fnName    = $tc.function.name
                    $fnArgsRaw = $tc.function.arguments

                    Write-Host "  [Tool] $fnName" -ForegroundColor DarkYellow
                    Write-Host "    [DEBUG] Raw args from LLM: $fnArgsRaw" -ForegroundColor DarkGray

                    # Use raw arguments JSON string directly to avoid unicode escape issues from ConvertTo-Json
                    $toolContent = ""
                    try {
                        $callResult = Invoke-McpRequest -Method "tools/call" -Params ([ordered]@{
                            name      = $fnName
                            arguments = if ([string]::IsNullOrWhiteSpace($fnArgsRaw)) { [PSCustomObject]@{} } else { $fnArgsRaw | ConvertFrom-Json }
                        }) -TimeoutMs 300000

                        # Collect text content from MCP result
                        $contentArr = $callResult.PSObject.Properties["content"]
                        if ($null -ne $contentArr) {
                            $textParts = @($contentArr.Value |
                                Where-Object { $_.PSObject.Properties["type"] -ne $null -and $_.type -eq "text" } |
                                ForEach-Object { $_.text })
                            $toolContent = $textParts -join "`n"
                        }

                        if ([string]::IsNullOrWhiteSpace($toolContent)) {
                            $isErr = $callResult.PSObject.Properties["isError"]
                            $toolContent = if ($null -ne $isErr -and $isErr.Value) {
                                "[Tool returned error with no message]"
                            } else {
                                "[Tool completed successfully with no text output]"
                            }
                        }
                    } catch {
                        $toolContent = "Tool execution error: $($_.Exception.Message)"
                        Write-Host "    [ERROR] $toolContent" -ForegroundColor Red
                    }

                    # Show a preview
                    $preview = if ($toolContent.Length -gt 200) { $toolContent.Substring(0, 200) + "..." } else { $toolContent }
                    Write-Host "    $preview" -ForegroundColor DarkGray

                    if ($toolContent.Length -gt $maxToolContentChars) {
                        $toolContent = $toolContent.Substring(0, $maxToolContentChars) + "`n[TRUNCATED: tool output exceeded $maxToolContentChars characters]"
                    }

                    # Strip ASCII control chars (except \t \n \r) and any lone UTF-16 surrogates
                    # that would otherwise produce an invalid JSON body for the next request.
                    $toolContent = [regex]::Replace($toolContent, "[\x00-\x08\x0B\x0C\x0E-\x1F]", "")
                    $toolContent = [regex]::Replace($toolContent, "[\uD800-\uDBFF](?![\uDC00-\uDFFF])", "")
                    $toolContent = [regex]::Replace($toolContent, "(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]", "")

                    # Preserve full output for the HTML report, but if we are in
                    # extract/summarize mode and the output is sizeable, send only
                    # a short placeholder to the chat history.
                    $fullToolContent = $toolContent
                    $historyContent  = $toolContent
                    if ($script:extractMode -and $toolContent.Length -gt 500) {
                        $historyContent = "[Extraction/summarization output captured in HTML report ($($toolContent.Length) chars). Not echoed into chat history. Proceed to the next step.]"
                        Write-Host "    [INFO] Suppressed $($toolContent.Length)-char tool output from chat history (extract mode)." -ForegroundColor DarkCyan
                    }

                    [void]$messages.Add([ordered]@{
                        role         = "tool"
                        tool_call_id = $tc.id
                        content      = $historyContent
                    })

                    # ---- Capture screenshot after browser tools (skip the screenshot tool itself) ----
                    $script:stepCounter++
                    $screenshotRel = $null
                    if ($fnName -like "browser_*" -and $fnName -ne "browser_take_screenshot") {
                        $prefix = "{0}-step{1:D3}-{2}" -f $fileSlug, $script:stepCounter, $fnName
                        $screenshotRel = Invoke-StepScreenshot -FileNamePrefix $prefix
                    }

                    [void]$script:stepLog.Add([ordered]@{
                        Kind       = "tool"
                        Index      = $script:stepCounter
                        Turn       = $turn
                        ToolName   = $fnName
                        Args       = $fnArgsRaw
                        Result     = $fullToolContent
                        Screenshot = $screenshotRel
                    })
                }
            }

            default {
                Write-Host "[WARN] Unexpected finish_reason: $reason" -ForegroundColor Red
                if ($null -ne $contentProp -and -not [string]::IsNullOrWhiteSpace($contentProp.Value)) {
                    Write-Host $contentProp.Value
                }
                $done = $true
            }
        }
    }

    if (-not $done) {
        Write-Host "`n[WARN] Reached max turns ($maxTurns) without a stop signal." -ForegroundColor Red
        return @{ Success = $false; Steps = $script:stepLog }
    }

    return @{ Success = $true; Steps = $script:stepLog }
}

$failedFiles = New-Object System.Collections.ArrayList
$runData = [ordered]@{}
foreach ($file in $instructionFiles) {
    try {
        $stepsText = Get-StepsTextFromInstructionFile -FilePath $file
        $result    = Invoke-AgentRunForFile -InstructionFile $file -StepsText $stepsText
        $runData[$file] = @{ Success = [bool]$result.Success; Steps = $result.Steps }
        if (-not $result.Success) {
            [void]$failedFiles.Add($file)
        }
    } catch {
        Write-Host "[ERROR] Failed to process file '$file': $($_.Exception.Message)" -ForegroundColor Red
        [void]$failedFiles.Add($file)
        $stepsSoFar = if ($null -ne $script:stepLog) { $script:stepLog } else { New-Object System.Collections.ArrayList }
        $runData[$file] = @{ Success = $false; Steps = $stepsSoFar }
    }
}

# ---------------------------------------------------------------------------
# Emit HTML report
# ---------------------------------------------------------------------------
try {
    Write-HtmlReport -OutFile $reportFile -RunData $runData
    Write-Host "`n[INFO] HTML report written to: $reportFile" -ForegroundColor Green
} catch {
    Write-Host "[WARN] Failed to write HTML report: $($_.Exception.Message)" -ForegroundColor Red
}

if ($failedFiles.Count -gt 0) {
    Write-Host "`n[WARN] Completed with failures in $($failedFiles.Count) file(s):" -ForegroundColor Red
    foreach ($f in $failedFiles) {
        Write-Host " - $f" -ForegroundColor Red
    }
    $script:overallExitCode = 1
} else {
    Write-Host "`n[INFO] Completed all instruction files successfully." -ForegroundColor Green
    $script:overallExitCode = 0
}

# ---------------------------------------------------------------------------
# Shutdown MCP server
# ---------------------------------------------------------------------------
Write-Host "`n[INFO] Stopping MCP server..." -ForegroundColor Cyan
try {
    $mcpProc.StandardInput.Close()
    if (-not $mcpProc.WaitForExit(6000)) { $mcpProc.Kill() }
} catch { }

if ($null -ne $stderrEvent) {
    Unregister-Event -SubscriptionId $stderrEvent.Id -ErrorAction SilentlyContinue
    Remove-Job -Id $stderrEvent.Id -Force -ErrorAction SilentlyContinue
}

exit $script:overallExitCode


