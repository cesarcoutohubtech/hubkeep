# HubKeep EU: diagnostico minimo de bloqueios Mews Demo (somente leitura).
# Windows PowerShell 5.1+; credenciais PUBLICAS; nenhum token guardado.
# No maximo 2 POSTs e nenhum retry automatico.
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$base = 'https://api.mews-demo.com/api/connector/v1'
$script:posts = 0

function CredenciaisPublicas {
    $url = 'https://docs.mews.com/connector-api/guidelines/environments.md'
    $pagina = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 20
    $gross = [regex]::Match(
        [string]$pagina.Content,
        '(?s)### API tokens \(Gross Pricing Environment\)(.*?)(?=### API tokens \(Net Pricing Environment\))'
    )
    if (-not $gross.Success) { throw 'secao_gross_inesperada' }
    $integracoes = [regex]::Matches($gross.Groups[1].Value, '(?s)\*\*Integration:.*?(?=\*\*Integration:|$)')
    if ($integracoes.Count -lt 2) { throw 'pares_publicos_insuficientes' }
    $bloco = $integracoes[1].Value
    if ($bloco -notmatch 'Connector API Test Client 2') { throw 'nome_do_conjunto_alterado' }
    $client = [regex]::Match($bloco, 'ClientToken[^\r\n]*?`([A-Za-z0-9-]{40,})`')
    $access = [regex]::Match($bloco, 'AccessToken[^\r\n]*?`([A-Za-z0-9-]{40,})`')
    if (-not $client.Success -or -not $access.Success) { throw 'par_publico_incompleto' }
    return @{
        ClientToken = [string]$client.Groups[1].Value
        AccessToken = [string]$access.Groups[1].Value
    }
}

function Consultar([hashtable]$par, [string]$operacao) {
    if (@('resourceBlocks/getAll', 'configuration/get') -notcontains $operacao) {
        throw 'operacao_nao_permitida'
    }
    if ($script:posts -ge 2) { throw 'limite_duas_chamadas' }
    $corpo = @{
        ClientToken = $par.ClientToken
        AccessToken = $par.AccessToken
        Client = 'HubKeep EU Blocks ReadOnly 0.3'
    }
    if ($operacao -eq 'resourceBlocks/getAll') {
        # A API exige CreatedUtc, UpdatedUtc ou CollidingUtc, mesmo que a
        # tabela de campos da documentacao os descreva como opcionais.
        # Janela conservadora de 30 dias UTC, inferior ao maximo de 3 meses.
        $inicio = [DateTime]::UtcNow.Date
        $fim = $inicio.AddDays(30)
        $corpo['CollidingUtc'] = @{
            StartUtc = $inicio.ToString('yyyy-MM-ddTHH:mm:ssZ')
            EndUtc = $fim.ToString('yyyy-MM-ddTHH:mm:ssZ')
        }
        $corpo['Limitation'] = @{ Count = 5 }
    }
    $argumentos = @{
        Uri = "$base/$operacao"
        Method = 'Post'
        ContentType = 'application/json'
        Body = (ConvertTo-Json -InputObject $corpo -Depth 5 -Compress)
        TimeoutSec = 20
    }
    $script:posts += 1
    try {
        $dado = Invoke-RestMethod @argumentos
        return @{ Ok = $true; Http = 200; Dados = $dado }
    }
    catch {
        $status = 0
        $requestId = $null
        $retry = $null
        $mensagem = $null
        $resp = $_.Exception.Response
        if ($null -ne $resp) {
            try { $status = [int]$resp.StatusCode } catch { }
            try {
                $r = [string]$resp.Headers['Request-Id']
                if ($r -match '^[A-Za-z0-9-]{1,80}$') { $requestId = $r }
            } catch { }
            if ($status -eq 429) {
                try {
                    $header = [string]$resp.Headers['Retry-After']
                    $seg = 0
                    if ([int]::TryParse($header, [ref]$seg) -and $seg -ge 0 -and $seg -le 86400) {
                        $retry = $seg
                    }
                    else {
                        $data = [DateTimeOffset]::MinValue
                        if ([DateTimeOffset]::TryParse($header, [ref]$data)) {
                            $seg = [int][Math]::Ceiling(($data - [DateTimeOffset]::UtcNow).TotalSeconds)
                            if ($seg -ge 0 -and $seg -le 86400) { $retry = $seg }
                        }
                    }
                } catch { }
            }
            try {
                $stream = $resp.GetResponseStream()
                if ($null -ne $stream) {
                    $reader = New-Object System.IO.StreamReader($stream)
                    $json = ConvertFrom-Json -InputObject $reader.ReadToEnd()
                    $reader.Dispose()
                    if ($json.Message -is [string]) {
                        $msg = [string]$json.Message
                        $msg = $msg.Replace($par.ClientToken, '[token]')
                        $msg = $msg.Replace($par.AccessToken, '[token]')
                        $msg = [regex]::Replace($msg, '(?i)[0-9a-f]{8}-[0-9a-f-]{27,}', '[id]')
                        $msg = [regex]::Replace($msg, '[A-Za-z0-9-]{40,}', '[codigo]')
                        $msg = [regex]::Replace($msg, '[^\w .,;:()!?/-]', ' ')
                        $mensagem = $msg.Substring(0, [Math]::Min($msg.Length, 140))
                    }
                }
            } catch { }
        }
        return @{
            Ok = $false
            Http = $status
            RequestId = $requestId
            RetryAfterSegundos = $retry
            Mensagem = $mensagem
        }
    }
}

function Estado([hashtable]$resultado) {
    $saida = [ordered]@{ Http = $resultado.Http }
    if ($resultado.RequestId) { $saida['RequestId'] = $resultado.RequestId }
    if ($resultado.Mensagem) { $saida['Mensagem'] = $resultado.Mensagem }
    if ($null -ne $resultado.RetryAfterSegundos) {
        $saida['RetryAfterSegundos'] = $resultado.RetryAfterSegundos
    }
    return $saida
}

try {
    $par = CredenciaisPublicas
    # Endpoint alvo PRIMEIRO: uma janela UTC; apenas 1 POST quando funcionar.
    $blocos = Consultar $par 'resourceBlocks/getAll'
    $saida = [ordered]@{
        Ambiente = 'Gross Demo'
        ConjuntoPublico = 2
        Gravacao = $false
        Bloqueios = (Estado $blocos)
    }
    if ($blocos.Ok) {
        $p = $blocos.Dados.PSObject.Properties['ResourceBlocks']
        if ($null -eq $p) {
            $saida['Resultado'] = 'http_200_campo_ausente'
        } else {
            $saida['Bloqueios']['Itens'] = @($p.Value).Count
            $saida['Bloqueios']['CursorPresente'] = -not [string]::IsNullOrEmpty([string]$blocos.Dados.Cursor)
            $saida['Resultado'] = 'leitura_confirmada'
        }
    }
    elseif (@(400, 401, 403) -contains $blocos.Http) {
        # Uma unica chamada extra para distinguir permissao de token/formato.
        $config = Consultar $par 'configuration/get'
        $saida['Configuracao'] = Estado $config
        $saida['Resultado'] = if ($config.Ok) {
            'configuracao_ok_bloqueios_negado'
        } else {
            'ambos_endpoints_negados'
        }
    }
    elseif ($blocos.Http -eq 429) {
        $saida['Resultado'] = 'limite_temporario_sem_retry'
    }
    else {
        $saida['Resultado'] = 'erro_sem_retry'
    }
    $saida['TotalPosts'] = $script:posts
    $saida['LimitePosts'] = 2
    Write-Output (ConvertTo-Json -InputObject $saida -Depth 5)
}
catch {
    # Nao imprimir a excecao, a URL completa ou dados privados.
    Write-Output (ConvertTo-Json -InputObject @{
        Resultado = 'falha_preparacao_ou_rede'
        Gravacao = $false
        TotalPosts = $script:posts
    })
    exit 1
}
finally {
    $par = $null
}
