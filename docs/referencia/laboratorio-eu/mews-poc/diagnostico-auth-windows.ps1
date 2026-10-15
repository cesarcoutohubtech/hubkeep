# HubKeep EU — diagnostico de autenticacao Mews DEMO, somente leitura.
# Requer Windows PowerShell 5.1+; sem persistencia, Supabase, HubKeep ou producao.
# Obtem dois pares PUBLICOS de demonstracao (Gross e Net) da documentacao oficial.
# Maximo absoluto: 5 requisicoes POST (2 de configuracao, 3 de leitura).
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$docsUrl = 'https://docs.mews.com/connector-api/guidelines/environments.md'
$apiBase = 'https://api.mews-demo.com/api/connector/v1'
$script:contador = 0
$limite = 5

function Par-Publico([string]$texto, [string]$tipo) {
    $outro = if ($tipo -eq 'Gross') { 'Net Pricing Environment' } else { 'Mews Operations credentials' }
    $bloco = [regex]::Match(
        $texto,
        '(?s)### API tokens \(' + [regex]::Escape($tipo) + ' Pricing Environment\)(.*?)(?=### ' + [regex]::Escape($(if ($tipo -eq 'Gross') { 'API tokens (Net Pricing Environment)' } else { $outro })) + ')'
    )
    if (-not $bloco.Success) { throw 'secao_demo_nao_encontrada' }
    $conteudo = $bloco.Groups[1].Value
    $clients = [regex]::Matches($conteudo, 'ClientToken[^\r\n]*?`([A-Za-z0-9-]{40,})`')
    $access = [regex]::Matches($conteudo, 'AccessToken[^\r\n]*?`([A-Za-z0-9-]{40,})`')
    if ($clients.Count -lt 1 -or $access.Count -lt 1) { throw 'par_publico_nao_encontrado' }
    return @{
        Ambiente = $tipo
        ClientToken = $clients[0].Groups[1].Value
        AccessToken = $access[0].Groups[1].Value
    }
}

function Consultar([hashtable]$par, [string]$recurso, [hashtable]$filtros) {
    $permitidas = @('configuration/get', 'enterprises/getAll', 'resources/getAll', 'resourceBlocks/getAll')
    if ($permitidas -notcontains $recurso) { throw 'operacao_nao_permitida' }
    if ($script:contador -ge $limite) { throw 'limite_http_atingido' }
    $script:contador += 1
    $body = @{
        ClientToken = $par.ClientToken
        AccessToken = $par.AccessToken
        Client = 'HubKeep EU Demo Auth Check 0.2.0'
    }
    foreach ($k in $filtros.Keys) {
        if (@('ClientToken', 'AccessToken', 'Client').Contains($k)) { throw 'campo_reservado' }
        $body[$k] = $filtros[$k]
    }
    try {
        $dado = Invoke-RestMethod -Method Post -Uri "$apiBase/$recurso" `
            -ContentType 'application/json' `
            -Body (ConvertTo-Json -InputObject $body -Depth 8 -Compress) -TimeoutSec 20
        return @{ Ok = $true; Http = 200; Dados = $dado; RequestId = $null }
    }
    catch {
        $status = 0
        $requestId = $null
        $response = $_.Exception.Response
        if ($null -ne $response) {
            try { $status = [int]$response.StatusCode } catch { }
            try {
                $r = [string]$response.Headers['Request-Id']
                if ($r -match '^[a-zA-Z0-9-]{1,80}$') { $requestId = $r }
            } catch { }
        }
        # Nunca apresentar o corpo do erro, excecao, resposta ou tokens.
        return @{ Ok = $false; Http = $status; Dados = $null; RequestId = $requestId }
    }
}

function Estado([hashtable]$resultado) {
    $est = [ordered]@{ Http = $resultado.Http }
    if ($resultado.RequestId) { $est.RequestId = $resultado.RequestId }
    return $est
}

try {
    # Credenciais de DEMO sao publicas; nenhum segredo privado sera solicitado.
    $pagina = Invoke-WebRequest -UseBasicParsing -Uri $docsUrl -TimeoutSec 20
    $texto = [string]$pagina.Content
    $gross = Par-Publico $texto 'Gross'
    $net = Par-Publico $texto 'Net'

    $relatorio = [ordered]@{
        Diagnostico = 'Mews Connector API demo'
        Producao = $false
        Gravacao = $false
        TestesAutenticacao = @()
        Leituras = [ordered]@{}
    }
    $escolhido = $null
    $configuracao = $null
    foreach ($par in @($gross, $net)) {
        $r = Consultar $par 'configuration/get' @{}
        $relatorio.TestesAutenticacao += [ordered]@{
            Ambiente = $par.Ambiente
            Resultado = (Estado $r)
        }
        if ($r.Ok -and $null -ne $r.Dados.Enterprise -and $r.Dados.Enterprise.Id) {
            $escolhido = $par
            $configuracao = $r.Dados
            break
        }
        if ($r.Ok) { throw 'resposta_configuracao_invalida' }
        if ($r.Http -ne 401 -and $r.Http -ne 403) { break }
    }

    if ($null -eq $escolhido) {
        $relatorio.Resultado = 'autenticacao_nao_confirmada'
    }
    else {
        $relatorio.Resultado = 'autenticacao_confirmada'
        $relatorio.AmbienteAutenticado = $escolhido.Ambiente
        $enterpriseId = [string]$configuracao.Enterprise.Id
        $consultas = @(
            @{ Caminho = 'enterprises/getAll'; Nome = 'Empresas'; Filtros = @{ Limitation = @{ Count = 5 } } },
            @{ Caminho = 'resources/getAll'; Nome = 'Recursos'; Filtros = @{
                EnterpriseIds = @($enterpriseId)
                Extent = @{ Resources = $true; Inactive = $false }
                Limitation = @{ Count = 5 }
            } },
            @{ Caminho = 'resourceBlocks/getAll'; Nome = 'Bloqueios'; Filtros = @{
                EnterpriseIds = @($enterpriseId)
                ActivityStates = @('Active')
                Limitation = @{ Count = 5 }
            } }
        )
        foreach ($q in $consultas) {
            $r = Consultar $escolhido $q.Caminho $q.Filtros
            $info = Estado $r
            if ($r.Ok) {
                $campo = switch ($q.Nome) {
                    'Empresas' { 'Enterprises' }
                    'Recursos' { 'Resources' }
                    'Bloqueios' { 'ResourceBlocks' }
                }
                $prop = $r.Dados.PSObject.Properties[$campo]
                if ($null -eq $prop) { $info.CampoEsperado = 'ausente' }
                else { $info.Itens = @($prop.Value).Count }
            }
            $relatorio.Leituras[$q.Nome] = $info
        }
    }
    $relatorio.TotalPosts = $script:contador
    $relatorio.LimitePosts = $limite
    Write-Output (ConvertTo-Json -InputObject $relatorio -Depth 8)
}
catch {
    # Nunca enviar mensagem de erro bruta, pois ela pode conter URL ou token.
    Write-Output (ConvertTo-Json -InputObject @{
        Resultado = 'falha_preparacao_ou_formato'
        TotalPosts = $script:contador
        Producao = $false
    })
    exit 1
}
finally {
    $gross = $null
    $net = $null
    $escolhido = $null
}
