param(
    [int]$TypeScriptPort = 3141,
    [int]$RustPort = 3142,
    [int]$CompatibilityRustPort = 3143,
    [int]$CompatibilityTypeScriptPort = 3144
)

$ErrorActionPreference = 'Stop'
$PSDefaultParameterValues['Invoke-WebRequest:TimeoutSec'] = 10
$PSDefaultParameterValues['Invoke-RestMethod:TimeoutSec'] = 10
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$workDir = Join-Path $PSScriptRoot '..\data\parity'
New-Item -ItemType Directory -Force -Path $workDir | Out-Null
$runId = [guid]::NewGuid().ToString('N')
$tsDb = Join-Path $workDir "$runId-ts.db"
$rustDb = Join-Path $workDir "$runId-rust.db"
$tsLog = Join-Path $workDir "$runId-ts.log"
$rustLog = Join-Path $workDir "$runId-rust.log"
$tsErr = Join-Path $workDir "$runId-ts.err.log"
$rustErr = Join-Path $workDir "$runId-rust.err.log"
$secret = 'local-parity-only-cookie-secret-32-bytes-min'
$processes = @()

function Wait-Api([string]$BaseUrl) {
    for ($i = 0; $i -lt 60; $i++) {
        try { return Invoke-RestMethod "$BaseUrl/api/health" -TimeoutSec 2 } catch { Start-Sleep -Milliseconds 500 }
    }
    throw "API did not become ready: $BaseUrl"
}

function ConvertTo-Canonical($Value) {
    if ($null -eq $Value) { return $null }
    if ($Value -is [System.Collections.IDictionary]) {
        $result = [ordered]@{}
        foreach ($key in ($Value.Keys | Sort-Object)) { $result[$key] = ConvertTo-Canonical $Value[$key] }
        return $result
    }
    if ($Value -is [System.Array]) { return ,@($Value | ForEach-Object { ConvertTo-Canonical $_ }) }
    if ($Value -is [pscustomobject]) {
        $result = [ordered]@{}
        foreach ($property in ($Value.PSObject.Properties | Sort-Object Name)) {
            if ($property.Name -in @('id', 'profile_id', 'profileId')) { $result[$property.Name] = '<generated-id>' }
            elseif ($property.Name -in @('created_at', 'createdAt', 'updated_at', 'updatedAt', 'timestamp', 'exportedAt')) { $result[$property.Name] = '<generated-time>' }
            else { $result[$property.Name] = ConvertTo-Canonical $property.Value }
        }
        return $result
    }
    if ($Value -is [byte] -or $Value -is [int16] -or $Value -is [int32] -or $Value -is [int64] -or $Value -is [single] -or $Value -is [double] -or $Value -is [decimal]) {
        return ([double]$Value).ToString('R', [Globalization.CultureInfo]::InvariantCulture)
    }
    return $Value
}

function Assert-Equal($Expected, $Actual, [string]$Label) {
    $e = ConvertTo-Json -InputObject (ConvertTo-Canonical $Expected) -Depth 50 -Compress
    $a = ConvertTo-Json -InputObject (ConvertTo-Canonical $Actual) -Depth 50 -Compress
    if ($e -cne $a) { throw "$Label differs.`nTypeScript: $e`nRust:       $a" }
}

try {
    # Initialize each empty, uniquely named disposable database with the existing
    # TypeScript migrations. This never derives a path from production config.
    foreach ($dbPath in @($tsDb, $rustDb)) {
        $env:DATABASE_PATH = $dbPath
        & npm run db:migrate --workspace=@forma/backend
        if ($LASTEXITCODE -ne 0) { throw "Disposable schema initialization failed for $dbPath" }
    }

    $env:DATABASE_PATH = $tsDb
    $env:PORT = "$TypeScriptPort"
    $env:COOKIE_SECRET = $secret
    $env:NODE_ENV = 'test'
    $ts = Start-Process -FilePath 'node' -ArgumentList @('node_modules/tsx/dist/cli.mjs', 'packages/backend/src/index.ts') -WorkingDirectory $repo -PassThru -RedirectStandardOutput $tsLog -RedirectStandardError $tsErr
    $processes += $ts

    $env:DATABASE_PATH = $rustDb
    $env:PORT = "$RustPort"
    $env:COOKIE_SECRET = $secret
    $env:NODE_ENV = 'test'
    $env:FORMA_AI_ENCRYPTION_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
    $rust = Start-Process -FilePath 'cargo' -ArgumentList @('run', '--quiet', '--manifest-path', 'packages/backend-rust/Cargo.toml') -WorkingDirectory $repo -PassThru -RedirectStandardOutput $rustLog -RedirectStandardError $rustErr
    $processes += $rust

    $tsUrl = "http://127.0.0.1:$TypeScriptPort"
    $rustUrl = "http://127.0.0.1:$RustPort"
    Wait-Api $tsUrl | Out-Null
    Wait-Api $rustUrl | Out-Null

    foreach ($path in @('/api/auth/status', '/api/setup/status', '/api/health', '/api/missing')) {
        $tsResult = Invoke-WebRequest "$tsUrl$path" -SkipHttpErrorCheck
        $rustResult = Invoke-WebRequest "$rustUrl$path" -SkipHttpErrorCheck
        if ($tsResult.StatusCode -ne $rustResult.StatusCode) { throw "$path status mismatch: TS $($tsResult.StatusCode), Rust $($rustResult.StatusCode)" }
        if ($path -ne '/api/health') { Assert-Equal (ConvertFrom-Json $tsResult.Content) (ConvertFrom-Json $rustResult.Content) "$path response" }
    }

    # Compare auth and data endpoints with identical synthetic input. IDs and
    # timestamps are generated independently, so compare stable contract fields.
    $tsSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $rustSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $fixtureUsername = "parity_$($runId.Substring(0, 12))"
    $body = @{ username = $fixtureUsername; password = 'synthetic-password-123'; displayName = 'Parity Fixture' } | ConvertTo-Json -Compress
    $tsReg = Invoke-WebRequest "$tsUrl/api/auth/register" -Method Post -ContentType 'application/json' -Body $body -WebSession $tsSession
    $rustReg = Invoke-WebRequest "$rustUrl/api/auth/register" -Method Post -ContentType 'application/json' -Body $body -WebSession $rustSession
    if ($tsReg.StatusCode -ne $rustReg.StatusCode) { throw "registration status mismatch: TS $($tsReg.StatusCode), Rust $($rustReg.StatusCode)" }
    $tsMe = Invoke-RestMethod "$tsUrl/api/auth/me" -WebSession $tsSession
    $rustMe = Invoke-RestMethod "$rustUrl/api/auth/me" -WebSession $rustSession
    if ($tsMe.username -ne $rustMe.username -or $tsMe.display_name -ne $rustMe.display_name -or $tsMe.role -ne $rustMe.role) { throw 'authenticated profile fields differ' }
    foreach ($baseUrl in @($tsUrl, $rustUrl)) {
        $check = Invoke-WebRequest "$baseUrl/api/auth/check-username?username=$fixtureUsername" -SkipHttpErrorCheck
        if ($check.StatusCode -ne 200 -or (ConvertFrom-Json $check.Content).available -ne $false) { throw "username availability contract failed at $baseUrl" }
    }

    foreach ($path in @('/api/settings', '/api/goals', '/api/goals/active', '/api/weight', '/api/weight/stats', '/api/measurements/definitions', '/api/measurements/entries', '/api/nutrition/plan', '/api/nutrition/logs', '/api/fasting/active', '/api/fasting/history', '/api/profile', '/api/ai/settings', '/api/ai/chat', '/api/ai/chat/memory', '/api/ai/weekly-reports', '/api/admin/settings', '/api/admin/users', '/api/export/json', '/api/export/csv/weight', '/api/export/csv/measurements')) {
        $tsResult = Invoke-WebRequest "$tsUrl$path" -WebSession $tsSession -SkipHttpErrorCheck
        $rustResult = Invoke-WebRequest "$rustUrl$path" -WebSession $rustSession -SkipHttpErrorCheck
        if ($tsResult.StatusCode -ne $rustResult.StatusCode) { throw "$path status mismatch: TS $($tsResult.StatusCode), Rust $($rustResult.StatusCode)" }
        if ($path -notlike '/api/export/csv/*') { Assert-Equal (ConvertFrom-Json $tsResult.Content) (ConvertFrom-Json $rustResult.Content) "$path response" }
    }

    $settingsBody = @{ unit_system = 'metric'; height_cm = '175'; sex = 'male'; date_of_birth = '1996-01-01' } | ConvertTo-Json -Compress
    $tsResult = Invoke-WebRequest "$tsUrl/api/settings" -Method Put -ContentType 'application/json' -Body $settingsBody -WebSession $tsSession
    $rustResult = Invoke-WebRequest "$rustUrl/api/settings" -Method Put -ContentType 'application/json' -Body $settingsBody -WebSession $rustSession
    Assert-Equal (ConvertFrom-Json $tsResult.Content) (ConvertFrom-Json $rustResult.Content) 'settings update'

    $goalBody = @{ starting_weight = 80; target_weight = 70; target_date = '2027-01-01'; notes = 'synthetic parity' } | ConvertTo-Json -Compress
    $tsResult = Invoke-WebRequest "$tsUrl/api/goals" -Method Post -ContentType 'application/json' -Body $goalBody -WebSession $tsSession
    $rustResult = Invoke-WebRequest "$rustUrl/api/goals" -Method Post -ContentType 'application/json' -Body $goalBody -WebSession $rustSession
    if ($tsResult.StatusCode -ne $rustResult.StatusCode) { throw 'goal create status mismatch' }
    Assert-Equal (ConvertFrom-Json $tsResult.Content) (ConvertFrom-Json $rustResult.Content) 'goal create'

    $tsResult = Invoke-WebRequest "$tsUrl/api/profile" -Method Get -WebSession $tsSession
    $rustResult = Invoke-WebRequest "$rustUrl/api/profile" -Method Get -WebSession $rustSession
    Assert-Equal (ConvertFrom-Json $tsResult.Content) (ConvertFrom-Json $rustResult.Content) 'profile read'
    $profileBody = @{ displayName = 'Updated Parity Fixture'; bio = 'Synthetic parity check'; isPublic = $true } | ConvertTo-Json -Compress
    $tsResult = Invoke-WebRequest "$tsUrl/api/profile" -Method Put -ContentType 'application/json' -Body $profileBody -WebSession $tsSession
    $rustResult = Invoke-WebRequest "$rustUrl/api/profile" -Method Put -ContentType 'application/json' -Body $profileBody -WebSession $rustSession
    Assert-Equal (ConvertFrom-Json $tsResult.Content) (ConvertFrom-Json $rustResult.Content) 'profile update'
    $tsResult = Invoke-WebRequest "$tsUrl/api/public/profile/$fixtureUsername"
    $rustResult = Invoke-WebRequest "$rustUrl/api/public/profile/$fixtureUsername"
    Assert-Equal (ConvertFrom-Json $tsResult.Content) (ConvertFrom-Json $rustResult.Content) 'public profile read'

    $adminBody = @{ registration_enabled = $false } | ConvertTo-Json -Compress
    $tsResult = Invoke-WebRequest "$tsUrl/api/admin/settings" -Method Put -ContentType 'application/json' -Body $adminBody -WebSession $tsSession
    $rustResult = Invoke-WebRequest "$rustUrl/api/admin/settings" -Method Put -ContentType 'application/json' -Body $adminBody -WebSession $rustSession
    Assert-Equal (ConvertFrom-Json $tsResult.Content) (ConvertFrom-Json $rustResult.Content) 'admin setting update'
    $adminBody = @{ registration_enabled = $true } | ConvertTo-Json -Compress
    Invoke-WebRequest "$tsUrl/api/admin/settings" -Method Put -ContentType 'application/json' -Body $adminBody -WebSession $tsSession | Out-Null
    Invoke-WebRequest "$rustUrl/api/admin/settings" -Method Put -ContentType 'application/json' -Body $adminBody -WebSession $rustSession | Out-Null

    $weightBody = @{ value = 75; unit = 'kg'; recorded_at = '2026-11-19T12:00:00Z'; notes = 'synthetic parity' } | ConvertTo-Json -Compress
    $tsResult = Invoke-WebRequest "$tsUrl/api/weight" -Method Post -ContentType 'application/json' -Body $weightBody -WebSession $tsSession
    $rustResult = Invoke-WebRequest "$rustUrl/api/weight" -Method Post -ContentType 'application/json' -Body $weightBody -WebSession $rustSession
    if ($tsResult.StatusCode -ne $rustResult.StatusCode) { throw 'weight create status mismatch' }
    Assert-Equal (ConvertFrom-Json $tsResult.Content) (ConvertFrom-Json $rustResult.Content) 'weight create'
    foreach ($path in @('/api/weight', '/api/weight/stats', '/api/body-composition')) {
        $tsResult = Invoke-WebRequest "$tsUrl$path" -WebSession $tsSession
        $rustResult = Invoke-WebRequest "$rustUrl$path" -WebSession $rustSession
        Assert-Equal (ConvertFrom-Json $tsResult.Content) (ConvertFrom-Json $rustResult.Content) "$path after synthetic write"
    }

    $aiBody = @{ enabled = $false; baseUrl = 'https://api.openai.com/v1'; model = 'synthetic-model'; apiKey = 'synthetic-api-key-not-real'; coachMode = 'friend'; customCoachPrompt = ''; customCoachName = ''; shareUserName = $false; chatHistoryLimit = 20 } | ConvertTo-Json -Compress
    $tsResult = Invoke-WebRequest "$tsUrl/api/ai/settings" -Method Put -ContentType 'application/json' -Body $aiBody -WebSession $tsSession
    $rustResult = Invoke-WebRequest "$rustUrl/api/ai/settings" -Method Put -ContentType 'application/json' -Body $aiBody -WebSession $rustSession
    Assert-Equal (ConvertFrom-Json $tsResult.Content) (ConvertFrom-Json $rustResult.Content) 'AI settings/key encryption response'
    $tsResult = Invoke-WebRequest "$tsUrl/api/ai/settings/key" -Method Delete -WebSession $tsSession
    $rustResult = Invoke-WebRequest "$rustUrl/api/ai/settings/key" -Method Delete -WebSession $rustSession
    Assert-Equal (ConvertFrom-Json $tsResult.Content) (ConvertFrom-Json $rustResult.Content) 'AI key removal'
    $memoryBody = @{ summary = 'Synthetic test memory only.' } | ConvertTo-Json -Compress
    $tsResult = Invoke-WebRequest "$tsUrl/api/ai/chat/memory" -Method Put -ContentType 'application/json' -Body $memoryBody -WebSession $tsSession
    $rustResult = Invoke-WebRequest "$rustUrl/api/ai/chat/memory" -Method Put -ContentType 'application/json' -Body $memoryBody -WebSession $rustSession
    Assert-Equal (ConvertFrom-Json $tsResult.Content) (ConvertFrom-Json $rustResult.Content) 'AI chat memory update'
    $tsResult = Invoke-WebRequest "$tsUrl/api/ai/chat/memory" -WebSession $tsSession
    $rustResult = Invoke-WebRequest "$rustUrl/api/ai/chat/memory" -WebSession $rustSession
    Assert-Equal (ConvertFrom-Json $tsResult.Content) (ConvertFrom-Json $rustResult.Content) 'AI chat memory read'

    $measurementBody = @{ entries = @(@{ definition_id = 'sys_waist'; value = 82.5; recorded_at = '2026-11-19T12:00:00Z'; notes = 'synthetic parity' }) } | ConvertTo-Json -Depth 5 -Compress
    $tsResult = Invoke-WebRequest "$tsUrl/api/measurements/entries" -Method Post -ContentType 'application/json' -Body $measurementBody -WebSession $tsSession
    $rustResult = Invoke-WebRequest "$rustUrl/api/measurements/entries" -Method Post -ContentType 'application/json' -Body $measurementBody -WebSession $rustSession
    if ($tsResult.StatusCode -ne $rustResult.StatusCode) { throw 'measurement create status mismatch' }
    Assert-Equal (ConvertFrom-Json $tsResult.Content) (ConvertFrom-Json $rustResult.Content) 'measurement create'
    foreach ($path in @('/api/measurements/entries', '/api/measurements/entries/latest')) {
        $tsResult = Invoke-WebRequest "$tsUrl$path" -WebSession $tsSession
        $rustResult = Invoke-WebRequest "$rustUrl$path" -WebSession $rustSession
        Assert-Equal (ConvertFrom-Json $tsResult.Content) (ConvertFrom-Json $rustResult.Content) "$path after synthetic write"
    }

    $nutritionBody = @{ date = '2026-11-19'; calories = 2100; protein_grams = 165; carbs_grams = 190; fat_grams = 70; notes = 'synthetic parity' } | ConvertTo-Json -Compress
    $tsResult = Invoke-WebRequest "$tsUrl/api/nutrition/logs" -Method Post -ContentType 'application/json' -Body $nutritionBody -WebSession $tsSession
    $rustResult = Invoke-WebRequest "$rustUrl/api/nutrition/logs" -Method Post -ContentType 'application/json' -Body $nutritionBody -WebSession $rustSession
    Assert-Equal (ConvertFrom-Json $tsResult.Content) (ConvertFrom-Json $rustResult.Content) 'nutrition log upsert'
    foreach ($path in @('/api/nutrition/logs', '/api/nutrition/logs?date=2026-11-19')) {
        $tsResult = Invoke-WebRequest "$tsUrl$path" -WebSession $tsSession
        $rustResult = Invoke-WebRequest "$rustUrl$path" -WebSession $rustSession
        Assert-Equal (ConvertFrom-Json $tsResult.Content) (ConvertFrom-Json $rustResult.Content) "$path after synthetic write"
    }

    $fastBody = @{ fast_type = '16:8'; target_duration_hours = 16; started_at = '2026-11-19T00:00:00Z'; notes = 'synthetic parity' } | ConvertTo-Json -Compress
    $tsResult = Invoke-WebRequest "$tsUrl/api/fasting/start" -Method Post -ContentType 'application/json' -Body $fastBody -WebSession $tsSession
    $rustResult = Invoke-WebRequest "$rustUrl/api/fasting/start" -Method Post -ContentType 'application/json' -Body $fastBody -WebSession $rustSession
    if ($tsResult.StatusCode -ne $rustResult.StatusCode) { throw 'fasting start status mismatch' }
    Assert-Equal (ConvertFrom-Json $tsResult.Content) (ConvertFrom-Json $rustResult.Content) 'fasting start'
    foreach ($path in @('/api/fasting/active', '/api/fasting/history')) {
        $tsResult = Invoke-WebRequest "$tsUrl$path" -WebSession $tsSession
        $rustResult = Invoke-WebRequest "$rustUrl$path" -WebSession $rustSession
        Assert-Equal (ConvertFrom-Json $tsResult.Content) (ConvertFrom-Json $rustResult.Content) "$path during synthetic fast"
    }
    $endBody = @{ ended_at = '2026-11-19T08:00:00Z'; status = 'completed'; mood = 'good' } | ConvertTo-Json -Compress
    $tsResult = Invoke-WebRequest "$tsUrl/api/fasting/end" -Method Post -ContentType 'application/json' -Body $endBody -WebSession $tsSession
    $rustResult = Invoke-WebRequest "$rustUrl/api/fasting/end" -Method Post -ContentType 'application/json' -Body $endBody -WebSession $rustSession
    Assert-Equal (ConvertFrom-Json $tsResult.Content) (ConvertFrom-Json $rustResult.Content) 'fasting end'

    $loginBody = @{ username = $fixtureUsername; password = 'synthetic-password-123' } | ConvertTo-Json -Compress
    $tsLogin = Invoke-WebRequest "$tsUrl/api/auth/login" -Method Post -ContentType 'application/json' -Body $loginBody
    $rustLogin = Invoke-WebRequest "$rustUrl/api/auth/login" -Method Post -ContentType 'application/json' -Body $loginBody
    if ($tsLogin.StatusCode -ne $rustLogin.StatusCode) { throw 'login status mismatch' }
    $badLoginBody = @{ username = $fixtureUsername; password = 'wrong-synthetic-password' } | ConvertTo-Json -Compress
    $tsBadLogin = Invoke-WebRequest "$tsUrl/api/auth/login" -Method Post -ContentType 'application/json' -Body $badLoginBody -SkipHttpErrorCheck
    $rustBadLogin = Invoke-WebRequest "$rustUrl/api/auth/login" -Method Post -ContentType 'application/json' -Body $badLoginBody -SkipHttpErrorCheck
    if ($tsBadLogin.StatusCode -ne $rustBadLogin.StatusCode) { throw 'bad login status mismatch' }
    Assert-Equal (ConvertFrom-Json $tsBadLogin.Content) (ConvertFrom-Json $rustBadLogin.Content) 'bad login response'

    # Protected route auth behavior must match without sending a cookie.
    $tsResult = Invoke-WebRequest "$tsUrl/api/settings" -SkipHttpErrorCheck
    $rustResult = Invoke-WebRequest "$rustUrl/api/settings" -SkipHttpErrorCheck
    if ($tsResult.StatusCode -ne $rustResult.StatusCode) { throw 'unauthenticated GET status mismatch' }
    Assert-Equal (ConvertFrom-Json $tsResult.Content) (ConvertFrom-Json $rustResult.Content) 'unauthenticated GET response'

    # Reopen the TypeScript-created database in Rust, then verify TypeScript can
    # read a Rust-written row. This uses the same disposable database only.
    $expectedSettings = Invoke-RestMethod "$tsUrl/api/settings" -WebSession $tsSession
    foreach ($process in $processes) {
        if ($process -and -not $process.HasExited) { & taskkill.exe /PID $process.Id /T /F 2>$null | Out-Null }
    }
    Start-Sleep -Milliseconds 500
    $env:DATABASE_PATH = $tsDb
    $env:PORT = "$CompatibilityRustPort"
    $rustCompat = Start-Process -FilePath 'cargo' -ArgumentList @('run', '--quiet', '--manifest-path', 'packages/backend-rust/Cargo.toml') -WorkingDirectory $repo -PassThru -RedirectStandardOutput $rustLog -RedirectStandardError $rustErr
    $processes = @($rustCompat)
    $rustCompatUrl = "http://127.0.0.1:$CompatibilityRustPort"
    Wait-Api $rustCompatUrl | Out-Null
    $rustSettings = Invoke-RestMethod "$rustCompatUrl/api/settings" -WebSession $tsSession
    Assert-Equal $expectedSettings $rustSettings 'Rust read of TypeScript database and session'
    $compatWeightBody = @{ value = 74.5; unit = 'kg'; recorded_at = '2026-11-20T12:00:00Z'; notes = 'synthetic cross-backend parity' } | ConvertTo-Json -Compress
    $rustCompatWeight = Invoke-WebRequest "$rustCompatUrl/api/weight" -Method Post -ContentType 'application/json' -Body $compatWeightBody -WebSession $tsSession
    if ($rustCompatWeight.StatusCode -ne 201) { throw 'Rust write to TypeScript-created database failed' }
    $rustCompatWeightValue = ConvertFrom-Json $rustCompatWeight.Content

    & taskkill.exe /PID $rustCompat.Id /T /F 2>$null | Out-Null
    Start-Sleep -Milliseconds 500
    $env:DATABASE_PATH = $tsDb
    $env:PORT = "$CompatibilityTypeScriptPort"
    $tsCompat = Start-Process -FilePath 'node' -ArgumentList @('node_modules/tsx/dist/cli.mjs', 'packages/backend/src/index.ts') -WorkingDirectory $repo -PassThru -RedirectStandardOutput $tsLog -RedirectStandardError $tsErr
    $processes = @($tsCompat)
    $tsCompatUrl = "http://127.0.0.1:$CompatibilityTypeScriptPort"
    Wait-Api $tsCompatUrl | Out-Null
    $tsCompatWeights = Invoke-RestMethod "$tsCompatUrl/api/weight" -WebSession $tsSession
    $matchingRow = @($tsCompatWeights | Where-Object { $_.value -eq 74.5 -and $_.notes -eq 'synthetic cross-backend parity' })
    if ($matchingRow.Count -ne 1) { throw "TypeScript did not read the Rust-written weight row. API returned: $(ConvertTo-Json -InputObject $tsCompatWeights -Depth 20 -Compress)" }
    Assert-Equal $rustCompatWeightValue $matchingRow[0] 'TypeScript read of Rust-written row'

    Write-Output 'Rust/TypeScript parity checks passed with synthetic databases, including cross-backend SQLite reads and writes.'
}
finally {
    foreach ($process in $processes) {
        if ($process -and -not $process.HasExited) { & taskkill.exe /PID $process.Id /T /F 2>$null | Out-Null }
    }
    Remove-Item Env:DATABASE_PATH, Env:PORT, Env:COOKIE_SECRET, Env:NODE_ENV, Env:FORMA_AI_ENCRYPTION_KEY -ErrorAction SilentlyContinue
}
