[CmdletBinding()]
param(
    [Parameter()]
    [string]$ImageName = "mcp/seq-otlp",

    [Parameter()]
    [string]$Tag = "",

    [Parameter()]
    [string]$LatestTag = "",

    [Parameter()]
    [string]$Registry = "",

    [Parameter()]
    [switch]$Push,

    [Parameter()]
    [string]$SaveTar = "",

    [Parameter()]
    [switch]$SkipDockerMcpCatalogInstall
)

$ErrorActionPreference = "Stop"

$scriptPath = Join-Path $PSScriptRoot "scripts/build-image.ps1"
$toolkitManifestPath = Join-Path $PSScriptRoot "catalog/docker-mcp-toolkit.yaml"

if (-not (Test-Path -Path $scriptPath -PathType Leaf)) {
    throw "Build script not found: $scriptPath"
}

function Test-DockerMcpAvailable {
    docker mcp --help *> $null
    return $LASTEXITCODE -eq 0
}

function Install-DockerMcpCatalogEntry([string]$ManifestPath) {
    if (-not (Test-Path -Path $ManifestPath -PathType Leaf)) {
        throw "Docker MCP Toolkit manifest not found: $ManifestPath"
    }

    if (-not (Test-DockerMcpAvailable)) {
        Write-Warning "Docker MCP CLI is not available; skipping local Docker MCP catalog install."
        return
    }

    $catalogDir = Join-Path $env:USERPROFILE ".docker/mcp/catalogs"
    $catalogPath = Join-Path $catalogDir "seq-otlp.yaml"

    New-Item -ItemType Directory -Force -Path $catalogDir | Out-Null
    Copy-Item -LiteralPath $ManifestPath -Destination $catalogPath -Force

    docker mcp catalog server add mcp/docker-mcp-catalog:latest --server file://seq-otlp.yaml
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to install seq-otlp into the local Docker MCP catalog."
    }
}

$invokeParams = @{
    ImageName = $ImageName
    Tag = $Tag
    LatestTag = $LatestTag
    Registry = $Registry
    SaveTar = $SaveTar
}

if ($Push.IsPresent) {
    $invokeParams.Push = $true
}

& $scriptPath @invokeParams
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

if (-not $SkipDockerMcpCatalogInstall.IsPresent) {
    Install-DockerMcpCatalogEntry -ManifestPath $toolkitManifestPath
}

Write-Host "Done: build, image validation, and local Docker MCP catalog refresh completed."
