$ErrorActionPreference = "Stop"

$projectPath = $PSScriptRoot
$envPath = Join-Path $projectPath ".env"

function Read-EnvValue([string] $name) {
  $line = Get-Content -LiteralPath $envPath | Where-Object { $_ -match "^$([regex]::Escape($name))=" } | Select-Object -First 1
  if (-not $line) { throw "A variável $name não foi encontrada no arquivo .env." }
  $value = ($line -split "=", 2)[1].Trim()
  if ($value.StartsWith('"') -and $value.EndsWith('"')) { $value = $value.Substring(1, $value.Length - 2) }
  return $value
}

function Invoke-Psql([string] $sql) {
  $output = & $psqlPath -X -w -v ON_ERROR_STOP=1 -q -h $dbHost -p $dbPort -U postgres -d postgres -tAc $sql 2>&1
  if ($LASTEXITCODE -ne 0) {
    $detail = ($output | Select-Object -Last 3) -join " "
    throw "Não consegui configurar o PostgreSQL. Confira se a senha do usuário postgres está correta. $detail"
  }
  return ($output -join "").Trim()
}

function Invoke-Npm([string[]] $arguments) {
  & $npmPath @arguments
  if ($LASTEXITCODE -ne 0) { throw "O comando npm $($arguments -join ' ') terminou com erro ($LASTEXITCODE)." }
}

if (-not (Test-Path -LiteralPath $envPath)) { throw "Não encontrei o arquivo .env ao lado deste instalador." }

$databaseUrl = Read-EnvValue "DATABASE_URL"
$appPassword = Read-EnvValue "POSTGRES_PASSWORD"
if ($databaseUrl -notmatch '^postgresql://([^:]+):([^@]+)@([^:/?]+):([0-9]+)/([^?]+)') {
  throw "A DATABASE_URL no .env não está no formato esperado."
}
$dbUser = [uri]::UnescapeDataString($Matches[1])
$dbHost = $Matches[3]
$dbPort = $Matches[4]
$dbName = $Matches[5]

if ($dbHost -notin @("127.0.0.1", "localhost")) { throw "Este instalador configura somente um PostgreSQL instalado neste computador." }
if ($dbUser -notmatch '^[a-zA-Z_][a-zA-Z0-9_]*$' -or $dbName -notmatch '^[a-zA-Z_][a-zA-Z0-9_]*$') {
  throw "O nome do usuário ou do banco na DATABASE_URL contém caracteres não suportados pelo instalador."
}

$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npmCommand) { throw "Não encontrei o npm. Instale o Node.js 24.11 ou superior e tente novamente." }
$npmPath = $npmCommand.Source

$psqlCandidates = @(
  (Join-Path $env:ProgramFiles "PostgreSQL\18\bin\psql.exe"),
  (Join-Path $env:ProgramFiles "PostgreSQL\17\bin\psql.exe"),
  (Join-Path $env:ProgramFiles "PostgreSQL\16\bin\psql.exe")
)
$psqlCommand = Get-Command psql.exe -ErrorAction SilentlyContinue
$psqlPath = if ($psqlCommand) { $psqlCommand.Source } else { $psqlCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1 }
if (-not $psqlPath) { throw "Não encontrei o psql do PostgreSQL. Instale PostgreSQL 16, 17 ou 18 e tente novamente." }

Write-Host "Instalação local do RodoERP" -ForegroundColor Cyan
Write-Host "O instalador precisa da senha do usuário postgres do PostgreSQL deste computador."
Write-Host "A senha é usada somente durante esta execução e não será gravada em arquivo."
$secureAdminPassword = Read-Host "Senha local do PostgreSQL (postgres)" -AsSecureString
if ($secureAdminPassword.Length -eq 0) { throw "A senha não pode ficar vazia." }
$adminPassword = [System.Net.NetworkCredential]::new("", $secureAdminPassword).Password
$env:PGPASSWORD = $adminPassword

try {
  Write-Host "Configurando o usuário dedicado e o banco $dbName..."
  $escapedRole = $dbUser.Replace('"', '""')
  $escapedPassword = $appPassword.Replace("'", "''")
  $roleExists = Invoke-Psql "SELECT 1 FROM pg_roles WHERE rolname = '$dbUser';"
  if ($roleExists -eq "1") {
    Invoke-Psql "ALTER ROLE `"$escapedRole`" WITH LOGIN PASSWORD '$escapedPassword';" | Out-Null
  } else {
    Invoke-Psql "CREATE ROLE `"$escapedRole`" WITH LOGIN PASSWORD '$escapedPassword';" | Out-Null
  }

  $dbExists = Invoke-Psql "SELECT 1 FROM pg_database WHERE datname = '$dbName';"
  if ($dbExists -ne "1") {
    Invoke-Psql "CREATE DATABASE `"$dbName`" OWNER `"$escapedRole`";" | Out-Null
  } else {
    Write-Host "O banco já existe; ele será preservado e as migrações pendentes serão aplicadas."
  }
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  $adminPassword = $null
  $secureAdminPassword.Dispose()
}

Push-Location $projectPath
try {
  if (-not (Test-Path -LiteralPath (Join-Path $projectPath "node_modules"))) {
    Write-Host "Instalando os componentes da aplicação..."
    Invoke-Npm @("install", "--cache", ".npm-cache", "--no-audit", "--no-fund")
  }

  Write-Host "Preparando o acesso ao banco..."
  Invoke-Npm @("run", "db:generate")
  Invoke-Npm @("run", "db:deploy")
  Invoke-Npm @("run", "db:seed")

  Write-Host "Instalação concluída. Abra http://localhost:3000 no navegador." -ForegroundColor Green
  Write-Host "Mantenha esta janela aberta para usar o sistema. Pressione Ctrl+C para pará-lo."
  Invoke-Npm @("run", "dev")
} finally {
  Pop-Location
}
