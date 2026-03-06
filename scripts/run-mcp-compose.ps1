[CmdletBinding()]
param(
    [Parameter()]
    [string]$SeqUrl,

    [Parameter()]
    [string]$SeqApiKey,

    [Parameter()]
    [string]$ComposeFile = "compose.mcp.yaml",

    [Parameter()]
    [string]$ContainerName = "",

    [Parameter()]
    [switch]$Build
)

$ErrorActionPreference = "Stop"

function Require-Command([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command not found: $Name"
    }
}

Require-Command "docker"

function Import-DotEnvIfPresent([string]$Path) {
    if (-not (Test-Path $Path)) {
        return
    }

    Get-Content $Path | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith("#")) {
            return
        }

        $parts = $line -split "=", 2
        if ($parts.Count -ne 2) {
            return
        }

        $key = $parts[0].Trim()
        $value = $parts[1].Trim()
        if (-not $key) {
            return
        }

        # Precedence: explicit args > existing env > .env
        if (-not [Environment]::GetEnvironmentVariable($key, "Process")) {
            [Environment]::SetEnvironmentVariable($key, $value, "Process")
        }
    }
}

if ($SeqUrl) {
    $env:SEQ_URL = $SeqUrl
}

if ($SeqApiKey) {
    $env:SEQ_API_KEY = $SeqApiKey
}

# Load .env only as fallback source.
Import-DotEnvIfPresent ".env"

if (-not $env:SEQ_URL) {
    throw "SEQ_URL is required. Provide -SeqUrl, set SEQ_URL, or add SEQ_URL to .env"
}

if (-not $env:SEQ_API_KEY) {
    throw "SEQ_API_KEY is required. Provide -SeqApiKey, set SEQ_API_KEY, or add SEQ_API_KEY to .env"
}

docker image inspect mcp/seq-otel:latest *> $null
$imageExists = ($LASTEXITCODE -eq 0)

if ($Build.IsPresent -or -not $imageExists) {
    docker compose -f $ComposeFile build seq-otel-mcp
    if ($LASTEXITCODE -ne 0) {
        throw "docker compose build failed."
    }
}

Write-Host "Starting MCP server over stdio using docker compose..."
if ($ContainerName) {
    docker compose -f $ComposeFile run --rm -i --name $ContainerName seq-otel-mcp
}
else {
    docker compose -f $ComposeFile run --rm -i seq-otel-mcp
}
