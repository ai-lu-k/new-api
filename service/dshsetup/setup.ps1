# Points the DSH client at this gateway: one provider entry with every model
# the account can call, and the API key.
#
#   $env:LUK_SETUP_CODE = '<setup code>'; irm __BASE_URL__/api/dsh_setup/setup.ps1 | iex
#
# The setup code comes from the website, works once and expires after ten
# minutes. It is exchanged for the configuration only after this script has
# made sure it can write to the DSH home, so a run that is refused does not use
# the code up.
#
# Two files under the DSH home are edited, both in place and both backed up
# first: settings.yaml gets the provider entries, .credentials.yaml gets the
# key. Everything else in them is left as it was.
#
# Written for Windows PowerShell 5.1 as well as PowerShell 7: no ternaries, no
# null-coalescing, and every file is read and written as UTF-8 explicitly.
& {
    param([string]$Code)

    $ErrorActionPreference = 'Stop'
    $BaseUrl = '__BASE_URL__'
    $Site = '__SITE_NAME__'
    $utf8 = New-Object System.Text.UTF8Encoding($false)

    function Get-Indent([string]$s) {
        $i = 0
        while ($i -lt $s.Length -and $s[$i] -ceq ' ') { $i++ }
        return $i
    }

    function Test-Blank([string]$s) {
        return $s -cmatch '^[ \t]*(#.*)?$'
    }

    # Get-Key returns the key of a block-style "key: ..." line together with
    # whatever follows the colon. Anything else yields $null.
    function Get-Key([string]$s) {
        $t = $s.Substring((Get-Indent $s))
        if ($t.Length -eq 0) { return $null }
        $c = $t[0]
        if ($c -ceq '"' -or $c -ceq "'") {
            $e = $t.IndexOf($c, 1)
            if ($e -lt 0 -or $e + 1 -ge $t.Length -or $t[$e + 1] -cne ':') { return $null }
            $rest = $t.Substring($e + 2)
            if ($rest.Length -gt 0 -and $rest[0] -cne ' ' -and $rest[0] -cne "`t") { return $null }
            return @{ Name = $t.Substring(1, $e - 1); Rest = $rest }
        }
        if ('#-[{?:&*!|>%@`'.IndexOf($c) -ge 0) { return $null }
        for ($j = 0; $j -lt $t.Length; $j++) {
            if ($t[$j] -cne ':') { continue }
            if ($j -eq $t.Length - 1 -or $t[$j + 1] -ceq ' ' -or $t[$j + 1] -ceq "`t") {
                return @{ Name = $t.Substring(0, $j).TrimEnd(); Rest = $t.Substring($j + 1) }
            }
        }
        return $null
    }

    # Get-InlineValue is what a key line carries after its colon, comment removed.
    function Get-InlineValue([string]$rest) {
        $v = $rest.TrimStart()
        if ($v.StartsWith('#')) { return '' }
        $v = $v -creplace '[ \t]+#.*$', ''
        return $v.TrimEnd()
    }

    function Test-EmptyValue([string]$v) {
        return ($v -ceq '' -or $v -ceq '{}' -or $v -ceq 'null' -or $v -ceq '~')
    }

    # Get-BlockEnd is the index of the last line of the block that starts at
    # $From and whose lines sit deeper than $Depth. Trailing blank lines are
    # left outside the block.
    function Get-BlockEnd($Lines, [int]$From, [int]$Limit, [int]$Depth) {
        $last = $From - 1
        for ($i = $From; $i -le $Limit; $i++) {
            if (Test-Blank $Lines[$i]) { continue }
            if ((Get-Indent $Lines[$i]) -le $Depth) { break }
            $last = $i
        }
        return $last
    }

    function Get-FirstIndent($Lines, [int]$From, [int]$To, [int]$Fallback) {
        for ($i = $From; $i -le $To; $i++) {
            if (-not (Test-Blank $Lines[$i])) { return (Get-Indent $Lines[$i]) }
        }
        return $Fallback
    }

    function Add-Indented($Out, $Block, [int]$Depth) {
        foreach ($text in $Block) {
            if ($text -ceq '') { $Out.Add('') } else { $Out.Add((' ' * $Depth) + $text) }
        }
    }

    function Add-SectionBreak($Out) {
        if ($Out.Count -gt 0 -and $Out[$Out.Count - 1] -cne '') { $Out.Add('') }
    }

    # Test-TopLevel refuses a document that is not a plain block mapping: one
    # that is written as JSON, holds several documents, or starts with a list.
    # A document that is nothing but "{}" is how an emptied one is written;
    # that line is blanked so the document can be treated as the empty one it
    # is. Returns the reason for refusing, or $null.
    function Test-TopLevel($Lines) {
        foreach ($s in $Lines) {
            if ($s -cmatch '^ *\t') { return '用了 Tab 缩进' }
        }
        $filled = 0
        $emptyMap = -1
        $seenKey = $false
        for ($i = 0; $i -lt $Lines.Count; $i++) {
            if (Test-Blank $Lines[$i]) { continue }
            $filled++
            if ((Get-Indent $Lines[$i]) -gt 0) { continue }
            if ($null -ne (Get-Key $Lines[$i])) {
                $seenKey = $true
                continue
            }
            if ($Lines[$i] -cmatch '^---[ \t]*$' -and -not $seenKey -and $filled -eq 1) { continue }
            if ($Lines[$i] -cmatch '^\{\}[ \t]*(#.*)?$') {
                $emptyMap = $i
                continue
            }
            return '文件不是普通的逐行 YAML 写法'
        }
        if ($emptyMap -lt 0) { return $null }
        if ($filled -gt 1) { return '文件不是普通的逐行 YAML 写法' }
        $Lines[$emptyMap] = ''
        return $null
    }

    # Edit-Settings and Edit-Credentials are a line-based editor for the
    # block-style YAML that DSH itself writes. They only ever replace the
    # mapping entries they are told to manage and refuse, without touching
    # anything, any layout they do not fully understand. Both return
    # @{ Lines = ... } or @{ Refused = 'reason' }.
    function Edit-Settings($Lines, $Ids, $Block, $Default) {
        $reason = Test-TopLevel $Lines
        if ($null -ne $reason) { return @{ Refused = $reason } }
        $n = $Lines.Count
        $out = New-Object 'System.Collections.Generic.List[string]'

        $top = -1
        $topRest = ''
        $hasDefault = $false
        for ($i = 0; $i -lt $n; $i++) {
            if ((Test-Blank $Lines[$i]) -or (Get-Indent $Lines[$i]) -gt 0) { continue }
            $key = Get-Key $Lines[$i]
            if ($null -eq $key) { continue }
            if ($key.Name -ceq 'agent-default-model') { $hasDefault = $true }
            if ($key.Name -cne 'llm-pi-ai') { continue }
            if ($top -ge 0) { return @{ Refused = 'llm-pi-ai 出现了两次' } }
            $top = $i
            $topRest = $key.Rest
        }

        if ($top -lt 0) {
            foreach ($s in $Lines) { $out.Add($s) }
            Add-SectionBreak $out
            $out.Add('llm-pi-ai:')
            $out.Add('  providers:')
            Add-Indented $out $Block 4
        } else {
            $value = Get-InlineValue $topRest
            if (-not (Test-EmptyValue $value)) { return @{ Refused = 'llm-pi-ai 写成了单行' } }
            if ($value -cne '') { $Lines[$top] = 'llm-pi-ai:' }
            $blockLast = Get-BlockEnd $Lines ($top + 1) ($n - 1) 0
            $child = Get-FirstIndent $Lines ($top + 1) $blockLast 2

            $providers = -1
            $providersRest = ''
            for ($i = $top + 1; $i -le $blockLast; $i++) {
                if ((Test-Blank $Lines[$i]) -or (Get-Indent $Lines[$i]) -ne $child) { continue }
                $key = Get-Key $Lines[$i]
                if ($null -eq $key -or $key.Name -cne 'providers') { continue }
                if ($providers -ge 0) { return @{ Refused = 'providers 出现了两次' } }
                $providers = $i
                $providersRest = $key.Rest
            }

            $header = ''
            $drop = @{}
            if ($providers -lt 0) {
                $after = $blockLast
                $depth = $child + $child
                $header = (' ' * $child) + 'providers:'
            } else {
                $value = Get-InlineValue $providersRest
                if (-not (Test-EmptyValue $value)) { return @{ Refused = 'providers 写成了单行' } }
                if ($value -cne '') { $Lines[$providers] = (' ' * $child) + 'providers:' }
                $providersLast = Get-BlockEnd $Lines ($providers + 1) $blockLast $child
                $depth = Get-FirstIndent $Lines ($providers + 1) $providersLast ($child + $child)
                for ($i = $providers + 1; $i -le $providersLast; $i++) {
                    if ((Test-Blank $Lines[$i]) -or (Get-Indent $Lines[$i]) -ne $depth) { continue }
                    $key = Get-Key $Lines[$i]
                    if ($null -eq $key -or -not ($Ids -ccontains $key.Name)) { continue }
                    $entryLast = Get-BlockEnd $Lines ($i + 1) $providersLast $depth
                    for ($j = $i; $j -le $entryLast; $j++) { $drop[$j] = $true }
                    $i = $entryLast
                }
                $after = $providersLast
            }

            for ($i = 0; $i -lt $n; $i++) {
                if (-not $drop.ContainsKey($i)) { $out.Add($Lines[$i]) }
                if ($i -ne $after) { continue }
                if ($header -cne '') { $out.Add($header) }
                Add-Indented $out $Block $depth
            }
        }

        if (-not $hasDefault) {
            Add-SectionBreak $out
            Add-Indented $out $Default 0
        }
        return @{ Lines = $out }
    }

    function Edit-Credentials($Lines, [string]$Ref, [string]$Key) {
        $reason = Test-TopLevel $Lines
        if ($null -ne $reason) { return @{ Refused = $reason } }
        $n = $Lines.Count
        $out = New-Object 'System.Collections.Generic.List[string]'
        $entry = $Ref + ': "' + $Key + '"'

        $filled = 0
        $version = -1
        $refs = -1
        $refsRest = ''
        for ($i = 0; $i -lt $n; $i++) {
            if (Test-Blank $Lines[$i]) { continue }
            $filled++
            if ((Get-Indent $Lines[$i]) -gt 0) { continue }
            $found = Get-Key $Lines[$i]
            if ($null -eq $found) { continue }
            if ($found.Name -ceq 'version') {
                if ((Get-InlineValue $found.Rest) -cne '1') { return @{ Refused = 'version 不是 1' } }
                $version = $i
            }
            if ($found.Name -cne 'refs') { continue }
            if ($refs -ge 0) { return @{ Refused = 'refs 出现了两次' } }
            $refs = $i
            $refsRest = $found.Rest
        }

        if ($filled -eq 0) {
            foreach ($s in $Lines) { $out.Add($s) }
            $out.Add('version: 1')
            $out.Add('refs:')
            $out.Add('  ' + $entry)
            return @{ Lines = $out }
        }
        if ($version -lt 0) { return @{ Refused = '没有 version' } }
        if ($refs -lt 0) {
            foreach ($s in $Lines) { $out.Add($s) }
            $out.Add('refs:')
            $out.Add('  ' + $entry)
            return @{ Lines = $out }
        }

        $value = Get-InlineValue $refsRest
        if (-not (Test-EmptyValue $value)) { return @{ Refused = 'refs 写成了单行' } }
        if ($value -cne '') { $Lines[$refs] = 'refs:' }
        $refsLast = Get-BlockEnd $Lines ($refs + 1) ($n - 1) 0
        $child = Get-FirstIndent $Lines ($refs + 1) $refsLast 2
        $replaced = $false
        for ($i = $refs + 1; $i -le $refsLast; $i++) {
            if ((Test-Blank $Lines[$i]) -or (Get-Indent $Lines[$i]) -ne $child) { continue }
            $found = Get-Key $Lines[$i]
            if ($null -eq $found -or $found.Name -cne $Ref) { continue }
            if ($replaced) { return @{ Refused = '同名的密钥引用出现了两次' } }
            if ((Get-BlockEnd $Lines ($i + 1) $refsLast $child) -gt $i) { return @{ Refused = '同名的密钥引用占了多行' } }
            $Lines[$i] = (' ' * $child) + $entry
            $replaced = $true
        }
        for ($i = 0; $i -lt $n; $i++) {
            $out.Add($Lines[$i])
            if ($i -eq $refs -and -not $replaced) { $out.Add((' ' * $child) + $entry) }
        }
        return @{ Lines = $out }
    }

    # Read-Document returns the lines of a file and the line ending it uses;
    # a file that does not exist reads as an empty document.
    function Read-Document([string]$Path) {
        $lines = New-Object 'System.Collections.Generic.List[string]'
        if (-not (Test-Path -LiteralPath $Path)) { return @{ Lines = $lines; Eol = "`n"; Text = $null } }
        $text = [System.IO.File]::ReadAllText($Path, $utf8)
        $eol = "`n"
        if ($text.Contains("`r`n")) { $eol = "`r`n" }
        $parts = $text -split "`r?`n"
        $count = $parts.Count
        if ($count -gt 0 -and $parts[$count - 1] -ceq '') { $count-- }
        for ($i = 0; $i -lt $count; $i++) { $lines.Add($parts[$i]) }
        return @{ Lines = $lines; Eol = $eol; Text = $text }
    }

    # Write-Document replaces a file with the edited lines, keeping a copy of
    # what was there. Returns $true when a backup was made.
    function Write-Document([string]$Path, $Document, $Lines, [string]$Stamp) {
        $text = ($Lines -join $Document.Eol) + $Document.Eol
        if ($null -ne $Document.Text -and $Document.Text -ceq $text) { return $false }
        $backedUp = $false
        if ($null -ne $Document.Text) {
            Copy-Item -LiteralPath $Path -Destination ($Path + '.luk-backup-' + $Stamp)
            $backedUp = $true
        }
        [System.IO.File]::WriteAllText($Path, $text, $utf8)
        return $backedUp
    }

    try {
        if ([string]::IsNullOrEmpty($Code)) {
            throw "缺少配置码。请回到 $Site 的「快速开始」页面，重新复制提示词。"
        }
        if ($Code -cnotmatch '^[A-Za-z0-9_-]+$') {
            throw "配置码的格式不对。请回到 $Site 的「快速开始」页面，重新复制提示词。"
        }

        $dshHome = $env:DSH_HOME
        if ([string]::IsNullOrEmpty($dshHome)) { $dshHome = Join-Path $HOME '.dsh' }
        $settings = Join-Path $dshHome 'settings.yaml'
        $credentials = Join-Path $dshHome '.credentials.yaml'

        $unwritable = "无法写入 $dshHome 。如果这条命令是让 DSH 代为执行的，请允许它在工作区之外写入，然后原样再运行一次；配置码还没有被用掉。"
        try {
            [void][System.IO.Directory]::CreateDirectory($dshHome)
            $probe = Join-Path $dshHome ('.luk-setup-probe.' + $PID)
            [System.IO.File]::WriteAllText($probe, '', $utf8)
            [System.IO.File]::Delete($probe)
            foreach ($existing in @($settings, $credentials)) {
                if (Test-Path -LiteralPath $existing) {
                    $stream = [System.IO.File]::Open($existing, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite)
                    $stream.Dispose()
                }
            }
        } catch {
            throw $unwritable
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
            $status = 0
            if ($null -ne $_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
            if ($status -eq 404) {
                throw "配置码无效、已经用过或已过期（生成后 10 分钟内有效，只能用一次）。回到 $Site 的「快速开始」页面重新复制提示词即可。"
            }
            if ($status -eq 409) {
                throw "这个账号的 API 密钥数量已达上限，没有改动任何文件。请先在 $Site 的「API 密钥」页面删掉一把不用的，再回到「快速开始」页面重新复制提示词。"
            }
            if ($status -eq 429) { throw '尝试次数太多，请稍后再试。' }
            if ($status -gt 0) { throw "服务器返回了 $status，暂时无法完成配置，没有改动任何文件。请稍后重试。" }
            throw "连不上 $BaseUrl 。请检查网络后重试；如果之后提示配置码无效，回到 $Site 的「快速开始」页面重新复制提示词即可。"
        }
        $raw = $response.RawContentStream
        $raw.Position = 0
        $payload = ($utf8.GetString($raw.ToArray())) -split "`r?`n"

        if ($payload.Count -eq 0 -or $payload[0] -cne 'luk-dsh-setup 1') {
            throw '服务器的响应不是预期的格式，没有改动任何文件。'
        }
        $fields = @{}
        $block = New-Object 'System.Collections.Generic.List[string]'
        $default = New-Object 'System.Collections.Generic.List[string]'
        $section = ''
        for ($i = 1; $i -lt $payload.Count; $i++) {
            $text = $payload[$i]
            if ($text -ceq '@@providers') { $section = 'providers'; continue }
            if ($text -ceq '@@default-model') { $section = 'default'; continue }
            if ($text -ceq '@@end') { $section = ''; continue }
            if ($section -ceq 'providers') { $block.Add($text); continue }
            if ($section -ceq 'default') { $default.Add($text); continue }
            if ($text -cmatch '^(ref|key|ids) (.+)$') { $fields[$Matches[1]] = $Matches[2] }
        }
        $ref = [string]$fields['ref']
        $key = [string]$fields['key']
        $ids = ([string]$fields['ids']) -split ' '
        if ($ref -ceq '' -or $key -ceq '' -or ([string]$fields['ids']) -ceq '' -or $block.Count -eq 0 -or $default.Count -eq 0) {
            throw '服务器的响应不完整，没有改动任何文件。'
        }
        if ($key -cnotmatch '^[A-Za-z0-9_-]+$') {
            throw '服务器的响应不是预期的格式，没有改动任何文件。'
        }

        $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
        $backedUp = $false

        $settingsDocument = Read-Document $settings
        $hadDefault = $false
        foreach ($s in $settingsDocument.Lines) {
            if ($s -cmatch '^agent-default-model:') { $hadDefault = $true }
        }
        $settingsResult = Edit-Settings $settingsDocument.Lines $ids $block $default
        $settingsDone = $false
        if ($null -eq $settingsResult.Refused) {
            if (Write-Document $settings $settingsDocument $settingsResult.Lines $stamp) { $backedUp = $true }
            $settingsDone = $true
        }

        $credentialsDocument = Read-Document $credentials
        $credentialsResult = Edit-Credentials $credentialsDocument.Lines $ref $key
        $credentialsDone = $false
        if ($null -eq $credentialsResult.Refused) {
            if (Write-Document $credentials $credentialsDocument $credentialsResult.Lines $stamp) { $backedUp = $true }
            $credentialsDone = $true
        }

        $models = 0
        foreach ($s in $block) {
            if ($s -cmatch '^ *- id:') { $models++ }
        }

        if ($settingsDone) {
            Write-Host "已写入 $Site 的提供方和 $models 个模型：$settings"
        } else {
            Write-Host "没有改动 $settings ：它现有的写法这个脚本不敢动（$($settingsResult.Refused)）。"
            Write-Host '请把下面这段放到 llm-pi-ai 的 providers 下面，替换掉其中同名的条目：'
            Write-Host ''
            foreach ($s in $block) { Write-Host ('    ' + $s) }
            Write-Host ''
        }
        if ($credentialsDone) {
            Write-Host "已保存密钥：$credentials"
        } else {
            Write-Host "没有改动 $credentials ：它现有的写法这个脚本不敢动（$($credentialsResult.Refused)）。"
            Write-Host "请打开 DSH 的 设置 → 模型，在 $Site 那一栏里粘贴密钥；密钥在 $Site 控制台的「API 密钥」里，名称是 DSH。"
        }
        if ($backedUp) {
            Write-Host "改动前的文件已备份在同一目录，文件名以 .luk-backup-$stamp 结尾。"
        }
        if ($settingsDone -and $credentialsDone) {
            if ($hadDefault) {
                Write-Host "请重启 DSH，重启后才会生效。然后在模型列表里选 $Site 下的模型就能用了。"
            } else {
                Write-Host '请重启 DSH，重启后才会生效。默认模型也已经设好，重启后新建一个会话就能用了。'
            }
        }
    } catch {
        Write-Host $_.Exception.Message -ForegroundColor Red
    } finally {
        Remove-Item Env:LUK_SETUP_CODE -ErrorAction SilentlyContinue
    }
} $env:LUK_SETUP_CODE
