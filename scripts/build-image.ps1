[CmdletBinding()]
param(
    [Parameter()]
    [string]$ImageName = "mcp/seq-otel",

    [Parameter()]
    [string]$Tag = "latest",

    [Parameter()]
    [string]$Registry = "",

    [Parameter()]
    [switch]$Push,

    [Parameter()]
    [string]$SaveTar = ""
)

$ErrorActionPreference = "Stop"

function Require-Command([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command not found: $Name"
    }
}

Require-Command "docker"

function Stop-RunningContainersForImage([string]$ImageRef) {
    $containerIds = docker ps -q --filter "ancestor=$ImageRef"
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to query running containers for image '$ImageRef'."
    }

    if (-not $containerIds) {
        return
    }

    Write-Host "Stopping containers using image ${ImageRef}: $($containerIds -join ' ')"
    docker rm -f $containerIds | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to stop containers using image '$ImageRef'."
    }
}

$fullImage = if ([string]::IsNullOrWhiteSpace($Registry)) {
    "{0}:{1}" -f $ImageName, $Tag
}
else {
    "{0}/{1}:{2}" -f $Registry.TrimEnd("/"), $ImageName, $Tag
}

$localImage = "{0}:{1}" -f $ImageName, $Tag

$gitRef = "unknown"
if (Get-Command git -ErrorAction SilentlyContinue) {
    try {
        $gitRef = (git rev-parse --short HEAD).Trim()
    } catch {
        $gitRef = "unknown"
    }
}

$buildDate = [DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")

Stop-RunningContainersForImage $localImage
if ($fullImage -ne $localImage) {
    Stop-RunningContainersForImage $fullImage
}

Write-Host "Building image: $fullImage"
docker build `
    --build-arg IMAGE_VERSION=$Tag `
    --build-arg VCS_REF=$gitRef `
    --build-arg BUILD_DATE=$buildDate `
    -t $fullImage .

if ($LASTEXITCODE -ne 0) {
    throw "Docker build failed."
}

if ($Push.IsPresent) {
    Write-Host "Pushing image: $fullImage"
    docker push $fullImage
    if ($LASTEXITCODE -ne 0) {
        throw "Docker push failed."
    }
}

if (-not [string]::IsNullOrWhiteSpace($SaveTar)) {
    Write-Host "Saving image archive: $SaveTar"
    docker save -o $SaveTar $fullImage
    if ($LASTEXITCODE -ne 0) {
        throw "Docker save failed."
    }
}

Write-Host "Done: $fullImage"
