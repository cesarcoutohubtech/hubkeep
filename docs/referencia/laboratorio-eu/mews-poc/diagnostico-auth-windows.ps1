# HubKeep EU — diagnostico de autenticacao Mews DEMO, somente leitura.
# Requer Windows PowerShell 5.1+; sem persistencia, Supabase, HubKeep ou producao.
# Obtem dois pares PUBLICOS de demonstracao (Gross e Net) da documentacao oficial.
# Maximo absoluto: 5 requisicoes POST (2 de configuracao, 3+ leituras conforme resultado).
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$docsUrl = 'https://docs.mews.com/connector-api/guidelines/environments.md'
$apiBase = 'https://api.mews-demo.com/api/connector/v1'
$script:contador = 0
$limite = 5
# Nunca tentar novamente dentro desta execucao apos HTTP 429.
$script:rateLimited = $false

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
    if ($script:rateLimited) { throw 'limite_temporario_sem_retentativa' }
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
        $retryAfterSeconds = $null
        $response = $_.Exception.Response
        if ($null -ne $response) {
            try { $status = [int]$response.StatusCode } catch { }
            try {
                $r = [string]$response.Headers['Request-Id']
                if ($r -match '^[a-zA-Z0-9-]{1,80}
        }
        # Apenas o campo Message do JSON de erro (nunca Details nem payload bruto).
        # Sanitiza IDs, tokens, caracteres de controle e limita comprimento.
        $safeMessage = $null
        if ($null -ne $response) {
            try {
                $stream = $response.GetResponseStream()
                if ($null -ne $stream) {
                    $reader = New-Object System.IO.StreamReader($stream)
                    $body = $reader.ReadToEnd()
                    $reader.Dispose()
                    $json = ConvertFrom-Json -InputObject $body
                    if ($json.Message -is [string]) {
                        $msg = $json.Message
                        $msg = $msg.Replace($par.ClientToken, '[token]').Replace($par.AccessToken, '[token]')
                        $msg = [regex]::Replace($msg, '(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', '[id]')
                        $msg = [regex]::Replace($msg, '[A-Za-z0-9-]{40,}', '[codigo]')
                        $msg = [regex]::Replace($msg, '[\r\n\t]', ' ')
                        $msg = [regex]::Replace($msg, '[^a-zA-Z0-9À-ÿ .,:;!?()_/-]', '')
                        $safeMessage = $msg.Substring(0, [Math]::Min(160, $msg.Length))
                    }
                }
            } catch {}
        }
        if ($status -eq 429) { $script:rateLimited = $true }
        return @{
            Ok = $false
            Http = $status
            Dados = $null
            RequestId = $requestId
            Message = $safeMessage
            RetryAfterSegundos = $retryAfterSeconds
        }
    }
}

function Estado([hashtable]$resultado) {
    $est = [ordered]@{ Http = $resultado.Http }
    if ($resultado.RequestId) { $est['RequestId'] = $resultado.RequestId }
    if ($resultado.Message) { $est['Mensagem'] = $resultado.Message }
    if ($resultado.Http -eq 429) {
        $est['LimiteTemporario'] = $true
        if ($null -ne $resultado.RetryAfterSegundos) {
            $est['RetryAfterSegundos'] = $resultado.RetryAfterSegundos
        }
        $est['Acao'] = 'aguardar_e_executar_novamente_mais_tarde'
    }
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
        if ($r.Http -eq 429) {
            $relatorio['Resultado'] = 'limite_temporario_429'
            break
        }
        if ($r.Http -ne 401 -and $r.Http -ne 403) { break }
    }

    if ($null -eq $escolhido -and $script:rateLimited) {
        $relatorio['Resultado'] = 'limite_temporario_429'
        $relatorio['AutenticacaoNestaExecucao'] = 'nao_avaliada'
    }
    elseif ($null -eq $escolhido) {
        $relatorio['Resultado'] = 'autenticacao_nao_confirmada'
    }
    else {
        $relatorio['Resultado'] = 'autenticacao_confirmada'
        $relatorio['AmbienteAutenticado'] = $escolhido.Ambiente
        $enterpriseId = [string]$configuracao.Enterprise.Id
        # A configuracao identifica a propriedade single-enterprise: enterprises/getAll
        # pode estar bloqueado, nao e pre-requisito para a integracao.
        $rec = Consultar $escolhido 'resources/getAll' @{
            EnterpriseIds = @($enterpriseId)
            Extent = @{ Resources = $true; Inactive = $false }
            Limitation = @{ Count = 5 }
        }
        $relatorio.Leituras['Recursos'] = Estado $rec
        if ($rec.Ok) {
            $prop = $rec.Dados.PSObject.Properties['Resources']
            if ($null -eq $prop) { $relatorio.Leituras['Recursos']['CampoEsperado'] = 'ausente' }
            else { $relatorio.Leituras['Recursos']['Itens'] = @($prop.Value).Count }
        }

        if ($rec.Http -eq 429) {
            $relatorio['Resultado'] = 'limite_temporario_429'
        }
        else {
        # Primeiro bloco SEM filtros opcionais, conforme o contrato do Mews.
        $bloco = Consultar $escolhido 'resourceBlocks/getAll' @{ Limitation = @{ Count = 5 } }
        $relatorio.Leituras['BloqueiosSemFiltros'] = Estado $bloco
        if ($bloco.Ok) {
            $prop = $bloco.Dados.PSObject.Properties['ResourceBlocks']
            if ($null -eq $prop) {
                $relatorio.Leituras['BloqueiosSemFiltros']['CampoEsperado'] = 'ausente'
            }
            else { $relatorio.Leituras['BloqueiosSemFiltros']['Itens'] = @($prop.Value).Count }
            # Se o corpo minimo passou, testar qual filtro opcional causa o 400.
            $escopoBloco = Consultar $escolhido 'resourceBlocks/getAll' @{
                Limitation = @{ Count = 5 }
                EnterpriseIds = @($enterpriseId)
            }
            $relatorio.Leituras['BloqueiosComEnterpriseId'] = Estado $escopoBloco
            if ($escopoBloco.Ok -and $script:contador -lt $limite) {
                $filtrado = Consultar $escolhido 'resourceBlocks/getAll' @{
                    Limitation = @{ Count = 5 }
                    EnterpriseIds = @($enterpriseId)
                    ActivityStates = @('Active')
                }
                $relatorio.Leituras['BloqueiosComActivityStates'] = Estado $filtrado
            }
        }
        if ($bloco.Http -eq 429 -or $escopoBloco.Http -eq 429 -or $filtrado.Http -eq 429) {
            $relatorio['Resultado'] = 'limite_temporario_429'
        }
        }
    }
    $relatorio['TotalPosts'] = $script:contador
    $relatorio['LimitePosts'] = $limite
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
) { $requestId = $r }
            } catch { }
            if ($status -eq 429) {
                # Retry-After: segundos ou data HTTP. Nenhuma espera automatica.
                try {
                    $raw = [string]$response.Headers['Retry-After']
                    $seconds = 0
                    if ([int]::TryParse($raw, [ref]$seconds) -and $seconds -ge 0 -and $seconds -le 86400) {
                        $retryAfterSeconds = $seconds
                    }
                    else {
                        $date = [DateTimeOffset]::MinValue
                        if ([DateTimeOffset]::TryParse($raw, [ref]$date)) {
                            $wait = [Math]::Ceiling(($date - [DateTimeOffset]::UtcNow).TotalSeconds)
                            if ($wait -ge 0 -and $wait -le 86400) { $retryAfterSeconds = [int]$wait }
                        }
                    }
                } catch { }
            }
        }
        # Apenas o campo Message do JSON de erro (nunca Details nem payload bruto).
        # Sanitiza IDs, tokens, caracteres de controle e limita comprimento.
        $safeMessage = $null
        if ($null -ne $response) {
            try {
                $stream = $response.GetResponseStream()
                if ($null -ne $stream) {
                    $reader = New-Object System.IO.StreamReader($stream)
                    $body = $reader.ReadToEnd()
                    $reader.Dispose()
                    $json = ConvertFrom-Json -InputObject $body
                    if ($json.Message -is [string]) {
                        $msg = $json.Message
                        $msg = $msg.Replace($par.ClientToken, '[token]').Replace($par.AccessToken, '[token]')
                        $msg = [regex]::Replace($msg, '(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', '[id]')
                        $msg = [regex]::Replace($msg, '[A-Za-z0-9-]{40,}', '[codigo]')
                        $msg = [regex]::Replace($msg, '[\r\n\t]', ' ')
                        $msg = [regex]::Replace($msg, '[^a-zA-Z0-9À-ÿ .,:;!?()_/-]', '')
                        $safeMessage = $msg.Substring(0, [Math]::Min(160, $msg.Length))
                    }
                }
            } catch {}
        }
        return @{ Ok = $false; Http = $status; Dados = $null; RequestId = $requestId; Message = $safeMessage }
    }
}

function Estado([hashtable]$resultado) {
    $est = [ordered]@{ Http = $resultado.Http }
    if ($resultado.RequestId) { $est['RequestId'] = $resultado.RequestId }
    if ($resultado.Message) { $est['Mensagem'] = $resultado.Message }
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
        $relatorio['Resultado'] = 'autenticacao_nao_confirmada'
    }
    else {
        $relatorio['Resultado'] = 'autenticacao_confirmada'
        $relatorio['AmbienteAutenticado'] = $escolhido.Ambiente
        $enterpriseId = [string]$configuracao.Enterprise.Id
        # A configuracao identifica a propriedade single-enterprise: enterprises/getAll
        # pode estar bloqueado, nao e pre-requisito para a integracao.
        $rec = Consultar $escolhido 'resources/getAll' @{
            EnterpriseIds = @($enterpriseId)
            Extent = @{ Resources = $true; Inactive = $false }
            Limitation = @{ Count = 5 }
        }
        $relatorio.Leituras['Recursos'] = Estado $rec
        if ($rec.Ok) {
            $prop = $rec.Dados.PSObject.Properties['Resources']
            if ($null -eq $prop) { $relatorio.Leituras['Recursos']['CampoEsperado'] = 'ausente' }
            else { $relatorio.Leituras['Recursos']['Itens'] = @($prop.Value).Count }
        }

        # Primeiro bloco SEM filtros opcionais, conforme o contrato do Mews.
        $bloco = Consultar $escolhido 'resourceBlocks/getAll' @{ Limitation = @{ Count = 5 } }
        $relatorio.Leituras['BloqueiosSemFiltros'] = Estado $bloco
        if ($bloco.Ok) {
            $prop = $bloco.Dados.PSObject.Properties['ResourceBlocks']
            if ($null -eq $prop) {
                $relatorio.Leituras['BloqueiosSemFiltros']['CampoEsperado'] = 'ausente'
            }
            else { $relatorio.Leituras['BloqueiosSemFiltros']['Itens'] = @($prop.Value).Count }
            # Se o corpo minimo passou, testar qual filtro opcional causa o 400.
            $escopoBloco = Consultar $escolhido 'resourceBlocks/getAll' @{
                Limitation = @{ Count = 5 }
                EnterpriseIds = @($enterpriseId)
            }
            $relatorio.Leituras['BloqueiosComEnterpriseId'] = Estado $escopoBloco
            if ($escopoBloco.Ok -and $script:contador -lt $limite) {
                $filtrado = Consultar $escolhido 'resourceBlocks/getAll' @{
                    Limitation = @{ Count = 5 }
                    EnterpriseIds = @($enterpriseId)
                    ActivityStates = @('Active')
                }
                $relatorio.Leituras['BloqueiosComActivityStates'] = Estado $filtrado
            }
        }
    }
    $relatorio['TotalPosts'] = $script:contador
    $relatorio['LimitePosts'] = $limite
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
