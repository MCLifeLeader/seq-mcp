[CmdletBinding()]
param(
    [Parameter()]
    [string]$ImageReference = "mcp/seq-otlp:latest",

    [Parameter()]
    [string]$Root = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Root)) {
    $Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

$catalogDir = Join-Path $Root "catalog"
$toolsPath = Join-Path $catalogDir "tools.json"
$toolkitPath = Join-Path $catalogDir "docker-mcp-toolkit.yaml"

if (-not (Test-Path -Path $toolsPath -PathType Leaf)) {
    throw "Tools manifest not found: $toolsPath"
}

function ConvertTo-YamlScalar([object]$Value) {
    if ($null -eq $Value) {
        return '""'
    }

    $text = [string]$Value
    if ($text -eq "") {
        return '""'
    }

    if ($text -match '^[A-Za-z0-9_./@{}<>, -]+$' -and $text -notmatch '^(true|false|null|yes|no|on|off)$') {
        return $text
    }

    return '"' + $text.Replace('\', '\\').Replace('"', '\"') + '"'
}

function Get-JsonSchemaType([object]$Schema) {
    if ($null -eq $Schema -or $null -eq $Schema.type) {
        return "string"
    }

    if ($Schema.type -is [System.Array]) {
        return ($Schema.type | ForEach-Object { [string]$_ }) -join " | "
    }

    return [string]$Schema.type
}

function Add-ToolArguments([System.Collections.Generic.List[string]]$Lines, [object]$Tool) {
    $properties = $Tool.inputSchema.properties
    if ($null -eq $properties) {
        $Lines.Add("    arguments: []")
        return
    }

    $propertyNames = @($properties.PSObject.Properties | ForEach-Object { $_.Name })
    if ($propertyNames.Count -eq 0) {
        $Lines.Add("    arguments: []")
        return
    }

    $required = @()
    if ($Tool.inputSchema.required) {
        $required = @($Tool.inputSchema.required | ForEach-Object { [string]$_ })
    }

    $Lines.Add("    arguments:")
    foreach ($property in $properties.PSObject.Properties) {
        $schema = $property.Value
        $Lines.Add("      - name: $(ConvertTo-YamlScalar $property.Name)")
        $Lines.Add("        type: $(ConvertTo-YamlScalar (Get-JsonSchemaType $schema))")
        $description = if ($schema.description) { $schema.description } else { "" }
        $Lines.Add("        desc: $(ConvertTo-YamlScalar $description)")
        if ($required -notcontains $property.Name) {
            $Lines.Add("        optional: true")
        }
    }
}

function Format-ManifestIfPrettierAvailable([string]$Path) {
    $prettierCandidates = @(
        (Join-Path $Root "node_modules\.bin\prettier.cmd"),
        (Join-Path $Root "node_modules\.bin\prettier")
    )

    foreach ($prettier in $prettierCandidates) {
        if (-not (Test-Path -Path $prettier -PathType Leaf)) {
            continue
        }

        & $prettier --write $Path | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Prettier failed to format generated manifest: $Path"
        }

        return
    }
}

$tools = Get-Content -Path $toolsPath -Raw | ConvertFrom-Json

$lines = [System.Collections.Generic.List[string]]::new()
$lines.Add("name: seq-otlp")
$lines.Add("type: server")
$lines.Add("image: $(ConvertTo-YamlScalar $ImageReference)")
$lines.Add("description: Unofficial standalone MCP server for Datalust Seq OpenTelemetry access.")
$lines.Add("title: Seq OTLP")
$lines.Add("readme: https://raw.githubusercontent.com/MCLifeLeader/seq-mcp/main/README.md")
$lines.Add("remote: {}")
$lines.Add("secrets:")
$lines.Add("  - name: seq-otlp.api_key")
$lines.Add("    env: SEQ_API_KEY")
$lines.Add("env:")
$lines.Add("  - name: SEQ_URL")
$lines.Add("    value: ""{{seq-otlp.url}}""")
$lines.Add("config:")
$lines.Add("  - description: Configure the connection to Seq.")
$lines.Add("    name: seq-otlp")
$lines.Add("    properties:")
$lines.Add("      url:")
$lines.Add("        type: string")
$lines.Add("    required:")
$lines.Add("      - url")
$lines.Add("    type: object")
$lines.Add("tools:")
foreach ($tool in $tools) {
    $lines.Add("  - name: $(ConvertTo-YamlScalar $tool.name)")
    $lines.Add("    description: $(ConvertTo-YamlScalar $tool.description)")
    Add-ToolArguments -Lines $lines -Tool $tool
}
$lines.Add("metadata:")
$lines.Add("  category: observability")
$lines.Add("  tags:")
$lines.Add("    - seq")
$lines.Add("    - otlp")
$lines.Add("    - opentelemetry")
$lines.Add("    - observability")
$lines.Add("  license: MIT")
$lines.Add("  owner: MCLifeLeader")

Set-Content -Path $toolkitPath -Value $lines -Encoding utf8
Format-ManifestIfPrettierAvailable -Path $toolkitPath
Write-Host "Generated Docker MCP Toolkit manifest: $toolkitPath"
