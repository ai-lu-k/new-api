# Points Claude Code at this gateway: the base URL, the API key and a model go
# into the "env" block of ~/.claude/settings.json.
#
#   $env:NEW_API_SETUP_CODE = '<setup code>'; irm __BASE_URL__/api/dsh_setup/setup.ps1?client=claude | iex
#
# The setup code comes from the website, works once and expires after ten
# minutes. It is exchanged for the key only after this script has made sure it
# can write to the Claude Code settings, so a run that is refused (by a
# sandbox, say) does not use the code up.
#
# The file is edited in place and backed up first: only the three keys under
# "env" are merged and everything else in it is left as it was.
#
# The key is never printed as it was handed out: what is printed shows its
# first three characters and its last four. Run the script with -ShowKey (or
# set NEW_API_SETUP_SHOW_KEY=1, which is the way to do it when the script is piped
# into iex) to print it whole, and with -DryRun (or NEW_API_SETUP_DRY_RUN=1) to see
# the result without writing anything.
#
# Written for Windows PowerShell 5.1 as well as PowerShell 7: no ternaries, no
# null-coalescing, no -AsHashtable, and the file is read and written as UTF-8
# explicitly.
#
# A run that fails ends with a non-zero exit code, after saying what to do
# next; a window opened just for it closes at that point.
param(
    [string]$Code,
    [switch]$DryRun,
    [switch]$ShowKey
)

$ErrorActionPreference = 'Stop'
$BaseUrl = '__BASE_URL__'
$Site = '__SITE_NAME__'
$utf8 = New-Object System.Text.UTF8Encoding($false)

if ([string]::IsNullOrEmpty($Code)) { $Code = $env:NEW_API_SETUP_CODE }
if ($env:NEW_API_SETUP_DRY_RUN -eq '1') { $DryRun = $true }
if ($env:NEW_API_SETUP_SHOW_KEY -eq '1') { $ShowKey = $true }

# Stop-Setup prints what went wrong and how to get further, and ends with a
# non-zero exit code. It is only ever reached before a write, so the settings
# file is never left half changed.
function Stop-Setup([string]$Message) {
    Write-Host $Message -ForegroundColor Red
    exit 1
}

# Remove-Quotes strips the double quotes the gateway puts around every value
# it writes into the payload.
function Remove-Quotes([string]$Text) {
    if ($Text.Length -ge 2 -and $Text[0] -ceq '"' -and $Text[$Text.Length - 1] -ceq '"') {
        return $Text.Substring(1, $Text.Length - 2)
    }
    return $Text
}

# Get-MaskedKey keeps the first three characters and the last four, which is
# enough to tell keys apart and useless to anyone who reads the screen.
function Get-MaskedKey([string]$Key) {
    if ($Key.Length -gt 8) {
        return $Key.Substring(0, 3) + [char]0x2026 + $Key.Substring($Key.Length - 4)
    }
    return [string][char]0x2026
}

# Set-Entry writes one string property on a JSON object, whether or not the
# object has that property yet.
function Set-Entry($Object, [string]$Name, [string]$Value) {
    $property = $Object.PSObject.Properties[$Name]
    if ($null -eq $property) {
        $Object | Add-Member -MemberType NoteProperty -Name $Name -Value $Value
    } else {
        $property.Value = $Value
    }
}

if ([string]::IsNullOrEmpty($Code)) {
    Stop-Setup "缺少配置码。请回到 $Site 的「快速开始」页面，重新复制命令。"
}
if ($Code -cnotmatch '^[A-Za-z0-9_-]+$') {
    Stop-Setup "配置码的格式不对。请回到 $Site 的「快速开始」页面，重新复制命令。"
}

$claudeHome = $env:CLAUDE_CONFIG_DIR
if ([string]::IsNullOrEmpty($claudeHome)) { $claudeHome = Join-Path $HOME '.claude' }
$settings = Join-Path $claudeHome 'settings.json'

# A dry run changes nothing, so it neither creates nor probes anything.
if (-not $DryRun) {
    $unwritable = "无法写入 $claudeHome 。如果这条命令是让 Claude Code 代为执行的，请允许它在工作区之外写入，然后原样再运行一次；配置码还没有被用掉。"
    try {
        [void][System.IO.Directory]::CreateDirectory($claudeHome)
        $probe = Join-Path $claudeHome ('.new-api-setup-probe.' + $PID)
        [System.IO.File]::WriteAllText($probe, '', $utf8)
        [System.IO.File]::Delete($probe)
        if (Test-Path -LiteralPath $settings) {
            $stream = [System.IO.File]::Open($settings, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite)
            $stream.Dispose()
        }
    } catch {
        Stop-Setup $unwritable
    }
}

try {
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor [System.Net.SecurityProtocolType]::Tls12
} catch {
    # Newer runtimes negotiate the protocol themselves.
}
$response = $null
try {
    $response = Invoke-WebRequest -UseBasicParsing -Method Post -Uri ($BaseUrl + '/api/dsh_setup/redeem') -Headers @{ 'X-Setup-Code' = $Code }
} catch {
    # Both Windows PowerShell and PowerShell 7 carry the status code, but they
    # do not always put it in the same place.
    $status = 0
    if ($null -ne $_.Exception.Response -and $null -ne $_.Exception.Response.StatusCode) {
        $status = [int]$_.Exception.Response.StatusCode
    } elseif ($null -ne $_.Exception.StatusCode) {
        $status = [int]$_.Exception.StatusCode
    }
    if ($status -eq 404) {
        Stop-Setup "配置码无效、已经用过或已过期（生成后 10 分钟内有效，只能用一次）。回到 $Site 的「快速开始」页面重新复制命令即可。"
    }
    if ($status -eq 409) {
        Stop-Setup "这个账号的 API 密钥数量已达上限，没有改动任何文件。请先在 $Site 的「API 密钥」页面删掉一把不用的，再回到「快速开始」页面重新复制命令。"
    }
    if ($status -eq 429) {
        Stop-Setup '尝试次数太多，请稍后再试。'
    }
    if ($status -gt 0) {
        Stop-Setup "服务器返回了 $status，暂时无法完成配置，没有改动任何文件。请稍后重试。"
    }
    Stop-Setup "连不上 $BaseUrl 。请检查网络后重试；如果之后提示配置码无效，回到 $Site 的「快速开始」页面重新复制命令即可。"
}
$payload = $response.Content
if ($payload -is [byte[]]) { $payload = $utf8.GetString($payload) }
$lines = $payload -split "`r?`n"
if ($lines.Count -eq 0 -or $lines[0] -cne 'new-api-dsh-setup 1') {
    Stop-Setup '服务器的响应不是预期的格式，没有改动任何文件。'
}

# Claude Code speaks the Messages API, so its base URL and its models are the
# ones in the payload's anthropic-messages block, and the site's default model
# is used when that block carries it.
$token = ''
$endpoint = ''
$defaultProvider = ''
$defaultModel = ''
$inProviders = $false
$inDefault = $false
$provider = ''
$api = ''
$anthropicProvider = ''
$anthropicBase = ''
$firstModel = ''
$firstClaude = ''
$served = @{}
for ($i = 1; $i -lt $lines.Count; $i++) {
    $line = $lines[$i]
    if ($line -ceq '@@providers') { $inProviders = $true; $inDefault = $false; continue }
    if ($line -ceq '@@default-model') { $inProviders = $false; $inDefault = $true; continue }
    if ($line -ceq '@@end') { $inProviders = $false; $inDefault = $false; continue }
    if ($inDefault) {
        if ($line -cmatch '^  provider: (.+)$') { $defaultProvider = $Matches[1]; continue }
        if ($line -cmatch '^  model: (.+)$') { $defaultModel = Remove-Quotes $Matches[1]; continue }
        continue
    }
    if (-not $inProviders) {
        if ($token -ceq '' -and $line -cmatch '^key (.+)$') { $token = $Matches[1] }
        continue
    }
    if ($line -cmatch '^([A-Za-z0-9_-]+):$') { $provider = $Matches[1]; $api = ''; continue }
    if ($line -cmatch '^  api: (.+)$') { $api = $Matches[1]; continue }
    if ($line -cmatch '^  baseURL: (.+)$') {
        if ($api -ceq 'anthropic-messages' -and $anthropicBase -ceq '') {
            $anthropicBase = Remove-Quotes $Matches[1]
        }
        continue
    }
    if ($line -cmatch '^    - id: (.+)$') {
        if ($api -ceq 'anthropic-messages') {
            $id = Remove-Quotes $Matches[1]
            $served[$id] = $true
            if ($anthropicProvider -ceq '') { $anthropicProvider = $provider }
            if ($firstModel -ceq '') { $firstModel = $id }
            if ($firstClaude -ceq '' -and $id.StartsWith('claude')) { $firstClaude = $id }
        }
        continue
    }
}

$model = $firstClaude
if ($model -ceq '' -and $defaultProvider -ceq $anthropicProvider -and $served.ContainsKey($defaultModel)) {
    $model = $defaultModel
}
if ($model -ceq '') { $model = $firstModel }
if ($anthropicBase -ceq '') { $endpoint = $BaseUrl } else { $endpoint = $anthropicBase }

if ($model -ceq '') {
    Stop-Setup "这个账号现在没有 Claude Code 能用的模型：它只认 Anthropic Messages 协议的模型。没有改动任何文件。请先用别的客户端，或者联系 $Site 的管理员。"
}
if ($token -ceq '') {
    Stop-Setup '服务器的响应不完整，没有改动任何文件。请稍后重新复制一条新命令再试。'
}
if ($token -cnotmatch '^[A-Za-z0-9_-]+$') {
    Stop-Setup '服务器的响应不是预期的格式，没有改动任何文件。'
}
if ($endpoint -cnotmatch '^[A-Za-z0-9:/._~-]+$') {
    Stop-Setup '服务器的响应不是预期的格式，没有改动任何文件。'
}
if ($model -cnotmatch '^[A-Za-z0-9._:/@+-]+$') {
    Stop-Setup '服务器的响应不是预期的格式，没有改动任何文件。'
}

# The settings file as it is now. It is read as UTF-8 with the byte order mark
# either way, and an absent or empty file is an empty document.
$text = $null
if (Test-Path -LiteralPath $settings) {
    try {
        $text = [System.IO.File]::ReadAllText($settings)
    } catch {
        Stop-Setup "读不了 $settings ，没有改动任何文件。请检查这个文件的读取权限，再从 $Site 的「快速开始」页面重新复制一条新命令：这条配置码已经用掉了。"
    }
    if ($text.Length -gt 0 -and $text[0] -ceq [char]0xFEFF) { $text = $text.Substring(1) }
}

$document = $null
if ($null -ne $text -and $text.Trim() -cne '') {
    try {
        $document = ConvertFrom-Json -InputObject $text
    } catch {
        Stop-Setup "$settings 不是有效的 JSON，没有改动任何文件。请先修好（或先备份再删掉）这个文件，再从 $Site 的「快速开始」页面重新复制一条新命令：这条配置码已经用掉了。"
    }
}
if ($null -ne $document -and $document -isnot [pscustomobject]) {
    Stop-Setup "$settings 的内容不是 JSON 对象，没有改动任何文件。请先把这个文件改成一个 JSON 对象，再从 $Site 的「快速开始」页面重新复制一条新命令：这条配置码已经用掉了。"
}
if ($null -eq $document) { $document = [pscustomobject]@{} }

$envMember = $document.PSObject.Properties['env']
$envBlock = $null
if ($null -ne $envMember) { $envBlock = $envMember.Value }
if ($null -ne $envBlock -and $envBlock -isnot [pscustomobject]) {
    Stop-Setup "$settings 里的 env 不是 JSON 对象，没有改动任何文件。请先把这个字段改成一个 JSON 对象，再从 $Site 的「快速开始」页面重新复制一条新命令：这条配置码已经用掉了。"
}
if ($null -eq $envBlock) {
    $envBlock = [pscustomobject]@{}
    if ($null -eq $envMember) {
        $document | Add-Member -MemberType NoteProperty -Name 'env' -Value $envBlock
    } else {
        $envMember.Value = $envBlock
    }
}
Set-Entry $envBlock 'ANTHROPIC_BASE_URL' $endpoint
Set-Entry $envBlock 'ANTHROPIC_AUTH_TOKEN' $token
Set-Entry $envBlock 'ANTHROPIC_MODEL' $model

$merged = $document | ConvertTo-Json -Depth 100
if (-not $merged.EndsWith("`n")) { $merged = $merged + [System.Environment]::NewLine }

# A run that would write what is already there leaves the file, and any
# backup, alone.
$unchanged = $false
if ($null -ne $text) {
    $before = $text.Replace("`r`n", "`n").TrimEnd([char]0x0A)
    $after = $merged.Replace("`r`n", "`n").TrimEnd([char]0x0A)
    if ($before -ceq $after) { $unchanged = $true }
}

if ($DryRun) {
    if ($ShowKey) {
        Write-Host "将要写入 $settings 的内容，没有改动任何文件："
        Write-Output $merged
    } else {
        Write-Host "将要写入 $settings 的内容，没有改动任何文件（密钥已打码，加 -ShowKey 可以看到完整值）："
        Write-Output $merged.Replace($token, (Get-MaskedKey $token))
    }
} elseif ($unchanged) {
    Write-Host "$settings 里已经是这三个键，没有改动。"
    Write-Host "请重启 Claude Code（或重新打开一个终端）后才生效：之后 Claude Code 会通过 $Site 调用模型。"
} else {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $backup = ''
    if ($null -ne $text) {
        $backup = $settings + '.new-api-backup-' + $stamp
        try {
            Copy-Item -LiteralPath $settings -Destination $backup -Force
        } catch {
            Stop-Setup "无法备份 $settings ，没有改动任何文件。请检查这个文件所在目录的写入权限，再从 $Site 的「快速开始」页面重新复制一条新命令：这条配置码已经用掉了。"
        }
    }
    try {
        [System.IO.File]::WriteAllText($settings, $merged, $utf8)
    } catch {
        if ($backup -ceq '') {
            Stop-Setup "无法写入 $settings ：$($_.Exception.Message) 这个文件原来不存在，所以什么都没留下，请检查目录的写入权限后原样再运行一次（配置码已经用掉了，需要回 $Site 重新复制一条新命令）。"
        }
        Stop-Setup "无法写入 $settings ：$($_.Exception.Message) 改动前的文件在 $backup ，可以用它恢复。修好权限后再从 $Site 的「快速开始」页面重新复制一条新命令：这条配置码已经用掉了。"
    }

    Write-Host "已写入 $settings ：env 下的 ANTHROPIC_BASE_URL、ANTHROPIC_AUTH_TOKEN、ANTHROPIC_MODEL 三个键，文件的其它内容都保留着。"
    if ($backup -cne '') {
        Write-Host "改动前的文件已备份在同一目录，文件名以 .new-api-backup-$stamp 结尾。"
    }
    Write-Host "请重启 Claude Code（或重新打开一个终端）后才生效：之后 Claude Code 会通过 $Site 调用模型。"
}
