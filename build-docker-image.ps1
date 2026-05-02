[CmdletBinding()]
param(
    [Parameter()]
    [string]$ImageName = "mcp/seq-otel",

    [Parameter()]
    [string]$Tag = "",

    [Parameter()]
    [string]$LatestTag = "",

    [Parameter()]
    [string]$Registry = "",

    [Parameter()]
    [switch]$Push,

    [Parameter()]
    [string]$SaveTar = ""
)

$ErrorActionPreference = "Stop"

$scriptPath = Join-Path $PSScriptRoot "scripts/build-image.ps1"

if (-not (Test-Path -Path $scriptPath -PathType Leaf)) {
    throw "Build script not found: $scriptPath"
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
exit $LASTEXITCODE