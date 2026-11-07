[CmdletBinding()]
param(
    [ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9._-]*$')]
    [string]$SshHost = 'my-aliyun',
    [switch]$Rollback,
    [switch]$CheckOnly
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($Rollback -and $CheckOnly) { throw 'Choose one action.' }
$sshOptions = @('-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3')
function Assert-Exit([string]$Step) {
    if ($LASTEXITCODE -ne 0) { throw "$Step failed (exit $LASTEXITCODE). Stopped." }
}
Push-Location $PSScriptRoot
$archive = $null
try {
    $remoteScript = (Get-Content (Join-Path $PSScriptRoot 'scripts/deploy-remote.sh') -Raw).Replace("`r`n", "`n")
    $remoteScript | & ssh @sshOptions $SshHost "tr -d '\r' | sudo -n bash -s -- check"
    Assert-Exit 'Preflight'
    if ($CheckOnly) { return }
    if ($Rollback) {
        $remoteScript | & ssh @sshOptions $SshHost "tr -d '\r' | sudo -n bash -s -- rollback"
        Assert-Exit 'Rollback'
        return
    }
    & npm run build
    Assert-Exit 'Build'
    if (-not (Test-Path 'dist/index.html' -PathType Leaf)) { throw 'Missing homepage.' }
    if (Test-Path 'dist/fox-preview') { throw 'Development page found in build.' }
    $release = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
    $archive = Join-Path ([IO.Path]::GetTempPath()) "personal-site-$release.tar.gz"
    & tar -czf $archive -C dist .
    Assert-Exit 'Packaging'
    & scp @sshOptions $archive "${SshHost}:/tmp/personal-site-$release.tar.gz"
    Assert-Exit 'Upload'
    $remoteScript | & ssh @sshOptions $SshHost "tr -d '\r' | sudo -n bash -s -- deploy $release"
    Assert-Exit 'Activation'
    Write-Host 'Published. Roll back with ./deploy.ps1 -Rollback'
} finally {
    if ($archive -and (Test-Path -LiteralPath $archive)) { Remove-Item -LiteralPath $archive }
    Pop-Location
}
