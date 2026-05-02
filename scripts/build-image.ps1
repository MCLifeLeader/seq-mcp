[CmdletBinding()]
param(
    [Parameter()]
    [string]$ImageName = $(if ([string]::IsNullOrWhiteSpace($env:IMAGE_NAME)) { "mcp/seq-otel" } else { $env:IMAGE_NAME }),

    [Parameter()]
    [string]$Tag = $(if ([string]::IsNullOrWhiteSpace($env:TAG)) { "" } else { $env:TAG }),

    [Parameter()]
    [string]$LatestTag = $(if ([string]::IsNullOrWhiteSpace($env:LATEST_TAG)) { "" } else { $env:LATEST_TAG }),

    [Parameter()]
    [string]$Registry = $(if ([string]::IsNullOrWhiteSpace($env:REGISTRY)) { "" } else { $env:REGISTRY }),

    [Parameter()]
    [switch]$Push,

    [Parameter()]
    [string]$SaveTar = $(if ([string]::IsNullOrWhiteSpace($env:SAVE_TAR)) { "" } else { $env:SAVE_TAR })
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
    if ([string]::IsNullOrWhiteSpace($Tag)) {
        $ImageName
    }
    else {
        "{0}:{1}" -f $ImageName, $Tag
    }
}
else {
    if ([string]::IsNullOrWhiteSpace($Tag)) {
        "{0}/{1}" -f $Registry.TrimEnd("/"), $ImageName
    }
    else {
        "{0}/{1}:{2}" -f $Registry.TrimEnd("/"), $ImageName, $Tag
    }
}

$latestImage = if ([string]::IsNullOrWhiteSpace($LatestTag)) {
    ""
}
elseif ([string]::IsNullOrWhiteSpace($Registry)) {
    "{0}:{1}" -f $ImageName, $LatestTag
}
else {
    "{0}/{1}:{2}" -f $Registry.TrimEnd("/"), $ImageName, $LatestTag
}

$localImage = if ([string]::IsNullOrWhiteSpace($Tag)) {
    $ImageName
}
else {
    "{0}:{1}" -f $ImageName, $Tag
}

$imageVersion = if ([string]::IsNullOrWhiteSpace($Tag)) {
    "none"
}
else {
    $Tag
}

$gitRef = "unknown"
if (Get-Command git -ErrorAction SilentlyContinue) {
    try {
        $gitRef = (git rev-parse --short HEAD).Trim()
    } catch {
        $gitRef = "unknown"
    }
}

$buildDate = [DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")
$pushEnabled = $Push.IsPresent -or $env:PUSH -eq "true"

Stop-RunningContainersForImage $localImage
if (-not [string]::IsNullOrWhiteSpace($fullImage) -and $fullImage -ne $localImage) {
    Stop-RunningContainersForImage $fullImage
}
if (-not [string]::IsNullOrWhiteSpace($latestImage) -and $latestImage -ne $localImage -and $latestImage -ne $fullImage) {
    Stop-RunningContainersForImage $latestImage
}

Write-Host "Building image: $fullImage"
$buildArgs = @(
    "build",
    "--build-arg", "IMAGE_VERSION=$imageVersion",
    "--build-arg", "VCS_REF=$gitRef",
    "--build-arg", "BUILD_DATE=$buildDate",
    "-t", $fullImage
)

if (-not [string]::IsNullOrWhiteSpace($latestImage) -and $latestImage -ne $fullImage) {
    $buildArgs += @("-t", $latestImage)
}

$buildArgs += "."

docker @buildArgs

if ($LASTEXITCODE -ne 0) {
    throw "Docker build failed."
}

if ($pushEnabled) {
    Write-Host "Pushing image: $fullImage"
    docker push $fullImage
    if ($LASTEXITCODE -ne 0) {
        throw "Docker push failed."
    }

    if (-not [string]::IsNullOrWhiteSpace($latestImage) -and $latestImage -ne $fullImage) {
        Write-Host "Pushing image: $latestImage"
        docker push $latestImage
        if ($LASTEXITCODE -ne 0) {
            throw "Docker push failed."
        }
    }
}

if (-not [string]::IsNullOrWhiteSpace($SaveTar)) {
    Write-Host "Saving image archive: $SaveTar"
    if (-not [string]::IsNullOrWhiteSpace($latestImage) -and $latestImage -ne $fullImage) {
        docker save -o $SaveTar $fullImage $latestImage
    }
    else {
        docker save -o $SaveTar $fullImage
    }
    if ($LASTEXITCODE -ne 0) {
        throw "Docker save failed."
    }
}

if (-not [string]::IsNullOrWhiteSpace($latestImage) -and $latestImage -ne $fullImage) {
    Write-Host "Done: $fullImage and $latestImage"
}
else {
    Write-Host "Done: $fullImage"
}
