# HubKeep EU / Mews - teste restrito à DEMO pública.
# Não grava dados, não modifica o HubKeep, não altera a Mews.
# Busca tokens públicos na documentação oficial a cada execução.
# Requer rede HTTPS e PowerShell 5.1 ou superior.
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$docsUrl = 'https://docs.mews.com/connector-api/guidelines/environments.md'
$apiBase = 'https://api.mews-demo.com/api/connector/v1'
$script:numeroChamadas = 0
$maxChamadas = 3

function Exigir([bool]$condicao, [string]$codigo) {
    if (-not $condicao) { throw $codigo }
}

function Obter-Lista([object]$resposta, [string]$campo) {
    Exigir ($null -ne $resposta) 'resposta_invalida'
    $valor = $resposta.PSObject.Properties[$campo]
    Exigir ($null -ne $valor) 'campo_obrigatorio_ausente'
    Exigir ($null -ne $valor.Value) 'lista_ausente'
    return ,@($valor.Value)
}

function Consultar-Demo([string]$operacao, [hashtable]$parametros) {
    $permitidas = @('configuration/get', 'resources/getAll', 'resourceBlocks/getAll')
    Exigir ($permitidas -contains $operacao) 'operacao_nao_permitida'
    Exigir ($script:numeroChamadas -lt $maxChamadas) 'limite_de_chamadas'
    $script:numeroChamadas++

    $corpo = @{
        ClientToken = $script:clientToken
        AccessToken = $script:accessToken
        Client = 'HubKeep-EU-Windows-Smoke/0.1'
        Limitation = @{ Count = 20 }
    }
    foreach ($nome in $parametros.Keys) {
        Exigir (-not @('ClientToken', 'AccessToken', 'Client', 'Limitation').Contains($nome)) 'parametro_reservado'
        $corpo[$nome] = $parametros[$nome]
    }

    try {
        return Invoke-RestMethod -Uri "$apiBase/$operacao" -Method Post -ContentType 'application/json' `
            -Body (ConvertTo-Json -InputObject $corpo -Depth 6 -Compress) -TimeoutSec 20
    }
    catch {
        # Nunca imprimir o corpo da exceção, URLs completas ou os tokens.
        $status = $null
        if ($null -ne $_.Exception.Response) {
            try { $status = [int]$_.Exception.Response.StatusCode } catch {}
        }
        if ($null -ne $status) { throw "http_$status" }
        throw 'conexao_mews_demo_indisponivel'
    }
}

try {
    # A documentação usa credenciais PÚBLICAS, destinadas apenas a testes.
    $pagina = Invoke-WebRequest -Uri $docsUrl -UseBasicParsing -TimeoutSec 20
    $bloco = [regex]::Match([string]$pagina.Content,
        '(?s)### API tokens \(Gross Pricing Environment\)(.*?)### API tokens \(Net Pricing Environment\)')
    Exigir $bloco.Success 'documentacao_demo_inesperada'

    $texto = $bloco.Groups[1].Value
    $clientMatch = [regex]::Match($texto, 'ClientToken[^\r\n]*?`([A-Za-z0-9-]{40,})`')
    $accessMatch = [regex]::Match($texto, 'AccessToken[^\r\n]*?`([A-Za-z0-9-]{40,})`')
    Exigir ($clientMatch.Success -and $accessMatch.Success) 'tokens_publicos_nao_localizados'

    $script:clientToken = $clientMatch.Groups[1].Value
    $script:accessToken = $accessMatch.Groups[1].Value
    Exigir ($script:clientToken.Length -gt 20 -and $script:accessToken.Length -gt 20) 'tokens_invalidos'

    # A demo single-property expõe Enterprise.Id em configuration/get.
    # enterprises/getAll retornou 401 com token de propriedade valido.
    $configuracao = Consultar-Demo 'configuration/get' @{}
    $id = [string]$configuracao.Enterprise.Id
    Exigir (-not [string]::IsNullOrWhiteSpace($id)) 'configuracao_sem_empresa'
    $rec = Consultar-Demo 'resources/getAll' @{
        EnterpriseIds = @($id)
        Extent = @{ Resources = $true; Inactive = $true }
    }
    $inicio = [DateTime]::UtcNow.Date
    $janela = @{
        StartUtc = $inicio.ToString('yyyy-MM-ddTHH:mm:ssZ')
        EndUtc = $inicio.AddDays(30).ToString('yyyy-MM-ddTHH:mm:ssZ')
    }
    $blo = Consultar-Demo 'resourceBlocks/getAll' @{
        EnterpriseIds = @($id)
        ActivityStates = @('Active', 'Deleted')
        CollidingUtc = $janela
    }
    $recursos = Obter-Lista $rec 'Resources'
    $bloqueios = Obter-Lista $blo 'ResourceBlocks'

    # Apenas contagens; sem nomes, hóspedes, notas ou identificadores de quartos.
    $saida = [ordered]@{
        Ambiente = 'Mews Demo (Gross)'
        AutenticacaoHttp = 'confirmada'
        ConfiguracaoConfirmada = $true
        RecursosAmostrados = $recursos.Count
        BloqueiosAmostrados = $bloqueios.Count
        MaisPaginas = [ordered]@{
            Recursos = -not [string]::IsNullOrEmpty([string]$rec.Cursor)
            Bloqueios = -not [string]::IsNullOrEmpty([string]$blo.Cursor)
        }
        ChamadasHttp = $script:numeroChamadas
        Gravacao = $false
    }
    Write-Output (ConvertTo-Json -InputObject $saida -Depth 5)
}
catch {
    # A mensagem é sempre controlada internamente; suprimir payloads HTTP.
    $codigo = [string]$_.Exception.Message
    if ($codigo -notmatch '^(documentacao_demo_inesperada|tokens_publicos_nao_localizados|tokens_invalidos|resposta_invalida|campo_obrigatorio_ausente|lista_ausente|operacao_nao_permitida|limite_de_chamadas|parametro_reservado|conexao_mews_demo_indisponivel|http_[0-9]{3})$') {
        $codigo = 'falha_inesperada_ou_rede'
    }
    Write-Output (ConvertTo-Json -InputObject @{ status = 'erro'; codigo = $codigo; chamadasHttp = $script:numeroChamadas })
    exit 1
}
finally {
    $script:clientToken = $null
    $script:accessToken = $null
}
