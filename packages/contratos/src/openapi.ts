// OpenAPI 3.1 da API /api/v1, gerado dos schemas Zod (F0-07). A lista de rotas
// abaixo é a fonte: rota nova entra aqui junto com o handler, e o teste do
// pacote confere que cada schema de corpo e de resposta está no documento.
import { z } from 'zod';
import { PedidoDeConvite, RespostaDeConvite, RespostaDeHoteis, RespostaDeSessao } from './api';
import {
  PedidoDeUrlDeDownload,
  PedidoDeUrlDeUpload,
  PedidoDeRegistroDeAnexo,
  PedidoDeUrlDoAnexo,
  RespostaDeAnexoRegistrado,
  RespostaDeAnexoRemovido,
  RespostaDeAnexos,
  RespostaDeUrlDeDownload,
  RespostaDeUrlDeUpload,
} from './anexos';
import {
  PedidoDeChecklistNaOs,
  PedidoDeModeloDeChecklist,
  RespostaDeChecklistAplicado,
  RespostaDeChecklistDaOs,
  RespostaDeModeloDeChecklistAlterado,
  RespostaDeModelosDeChecklist,
} from './checklists';
import {
  PedidoDeAlteracaoDePlanoPreventivo,
  PedidoDeNovoPlanoPreventivo,
  PedidoDeSituacaoDoPlano,
  RespostaDePlanoAlterado,
  RespostaDePlanosPreventivos,
} from './planos-preventivos';
import {
  PedidoDeBandeira,
  PedidoDeBandeiraDoHotel,
  RespostaDeBandeiraAlterada,
  RespostaDeBandeiraCriada,
  RespostaDeBandeiraDoHotel,
  RespostaDeBandeiras,
} from './bandeiras';
import {
  PedidoDeAlteracaoDeFornecedor,
  PedidoDeFornecedor,
  PedidoDeVersaoDeFornecedor,
  RespostaDeFornecedorGravado,
  RespostaDeFornecedores,
} from './fornecedores';
import {
  PedidoDeCategoria,
  RespostaDeCategoriaAlterada,
  RespostaDeCategorias,
  RespostaDeCategoriasPadrao,
} from './categorias';
import {
  PedidoDeCodigoDeManutencao,
  PedidoDeNomesDeCodigo,
  RespostaDeCodigoAlterado,
  RespostaDeCodigosDaOs,
  RespostaDeCodigosDeManutencao,
  RespostaDeCodigosPadrao,
} from './codigos-manutencao';
import {
  PedidoDePrioridade,
  PedidoDeSituacao,
  PedidoDeSituacaoNova,
  RespostaDeConfiguracaoAlterada,
  RespostaDeSituacoesEPrioridades,
  RespostaDeSituacoesEPrioridadesPadrao,
} from './situacoes';
import {
  ConsultaDaLista,
  RespostaDeLinhaDoTempo,
  RespostaDeListaDeChamados,
  RespostaDeListaDeOs,
  PedidoDeAberturaDeChamado,
  PedidoDeAjusteDePrioridade,
  PedidoDeAtribuicaoDeOs,
  PedidoDeAceiteDeOs,
  PedidoDeCancelamento,
  PedidoDeExecutorDaOs,
  PedidoDeGeracaoDeOs,
  PedidoDeImpactoNoHospede,
  PedidoDeReaberturaDeOs,
  PedidoDeTriagem,
  RespostaDeChamado,
  RespostaDeChamadoAberto,
  RespostaDeChamadoAlterado,
  RespostaDeOsDoDia,
  RespostaDeOsGravada,
  RespostaDeReaberturaDeOs,
} from './chamados';
import { ConsultaDaAuditoriaGeral, RespostaDaAuditoriaGeral } from './auditoria-geral';
import { ConsultaDoHistorico, RespostaDoHistorico } from './historico';
import { PedidoDeCredencial, RespostaDeCredencial, RespostaDeRevogacao } from './credenciais';
import {
  PedidoDeAlteracaoDeAtivo,
  PedidoDeCadastroDeAtivo,
  PedidoDeMovimentacaoDeAtivo,
  PedidoDeVersaoDeAtivo,
  RespostaDeAtivoDoQr,
  RespostaDeAtivoGravado,
  RespostaDeAtivosDoHotel,
  RespostaDeMovimentacoesDoAtivo,
} from './ativos';
import {
  PedidoDeAreaComum,
  PedidoDeEdificacao,
  RespostaDeLocaisDoHotel,
  RespostaDeLocalAlterado,
} from './locais';
import {
  PedidoDeEquipe,
  PedidoDeMembroDaEquipe,
  RespostaDeEquipeAlterada,
  RespostaDeEquipes,
  RespostaDeMembroDaEquipe,
} from './equipes';
import { RespostaDeImplantacao } from './implantacao';
import { LoteDeIngestao, RespostaDeLote } from './ingestao';
import {
  PedidoDeImportacaoDeHotel,
  RespostaDeAtivacaoDeHotel,
  RespostaDeHoteisDoStaging,
  RespostaDeImportacaoDeHotel,
} from './hoteis';
import {
  PedidoDeConcessaoDePapel,
  PedidoDeValidade,
  RespostaDeAtivoDoMembro,
  RespostaDeConcessaoDePapel,
  RespostaDeMembros,
  RespostaDeRevogacaoDePapel,
  RespostaDeValidade,
} from './membros';
import {
  PedidoDeConfiguracaoDoHotel,
  PedidoDeConfiguracaoDoTenant,
  PedidoDePolitica,
  RespostaDeConfiguracao,
} from './configuracao';
import { PedidoDePreferencias, RespostaDePreferencias } from './preferencias';
import {
  PedidoDeProprietario,
  PedidoDeVigenciaDoVinculo,
  PedidoDeVinculoDeProprietario,
  RespostaDeProprietarioAlterado,
  RespostaDeProprietarios,
  RespostaDeVinculoDeProprietario,
} from './proprietarios';
import {
  PedidoDeEncerramentoDeParada,
  RespostaDeParadaEncerrada,
  RespostaDeParadasDoAtivo,
  RespostaDeParadasPendentes,
} from './paradas';
import {
  PedidoDeLiberacaoDeUh,
  PedidoDeUhIndisponivel,
  RespostaDeUhIndisponivel,
  RespostaDeUhLiberada,
  RespostaDeUhMarcada,
} from './uh-indisponivel';
import { PedidoDeOperacaoOffline, RespostaDeOperacaoOffline } from './sincronizacao';
import { ErroApi } from './erro';
import {
  ConsultaDeInsights,
  PedidoDeDecisaoDoInsight,
  RespostaDaDecisaoDoInsight,
  RespostaDeInsights,
  RespostaDoAtivoNoIntelligence,
  RespostaDoInsight,
  RespostaDoResumoDoIntelligence,
} from './inteligencia';

type Esquema = z.ZodType;

export interface Rota {
  metodo: 'get' | 'post' | 'put';
  caminho: string;
  resumo: string;
  /** Rota que precisa do tenant ativo (cabeçalho x-hubkeep-tenant ou cookie). */
  exigeTenant: boolean;
  /** Quem chama: usuário (padrão, Bearer ou cookie) ou o agente conector. */
  autenticacao?: 'usuario' | 'agente';
  /** Lista que aceita ?busca= (trecho, sem acento, a partir de 3 caracteres; B6). */
  busca?: boolean;
  /** Parâmetros da query string (C7): cada campo do objeto vira um parâmetro. */
  consulta?: z.ZodObject;
  corpo?: Esquema;
  respostas: Record<number, { descricao: string; esquema?: Esquema }>;
}

const ERRO = (descricao: string) => ({ descricao, esquema: ErroApi });

export const ROTAS: readonly Rota[] = [
  {
    metodo: 'get',
    caminho: '/api/v1/sessao',
    resumo: 'Usuário do token verificado e tenants sugeridos.',
    exigeTenant: false,
    respostas: {
      200: { descricao: 'Sessão', esquema: RespostaDeSessao },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
    },
  },
  {
    metodo: 'get',
    caminho: '/api/v1/proprietarios',
    resumo:
      'Proprietários com os vínculos (UH ou hotel inteiro) e a vigência. Só o Admin do grupo.',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Proprietários', esquema: RespostaDeProprietarios },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Só o Admin do grupo (proprietarios_so_admin).'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/proprietarios',
    resumo: 'Cadastra um proprietário ou locador. Só o Admin do grupo.',
    exigeTenant: true,
    corpo: PedidoDeProprietario,
    respostas: {
      201: { descricao: 'Proprietário cadastrado', esquema: RespostaDeProprietarioAlterado },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Só o Admin do grupo (proprietarios_so_admin).'),
      422: ERRO('proprietario_nome_invalido, proprietario_documento_invalido ou entrada_invalida.'),
    },
  },
  {
    metodo: 'put',
    caminho: '/api/v1/proprietarios/{id}',
    resumo: 'Altera nome e documento do proprietário. Só o Admin do grupo.',
    exigeTenant: true,
    corpo: PedidoDeProprietario,
    respostas: {
      200: { descricao: 'Proprietário alterado', esquema: RespostaDeProprietarioAlterado },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Só o Admin do grupo (proprietarios_so_admin).'),
      404: ERRO('Proprietário não encontrado (proprietario_nao_encontrado).'),
      422: ERRO('proprietario_nome_invalido, proprietario_documento_invalido ou entrada_invalida.'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/proprietarios/{id}/vinculos',
    resumo:
      'Vincula o proprietário a uma UH ou a um hotel inteiro, com vigência (ADR-031). Só o Admin do grupo.',
    exigeTenant: true,
    corpo: PedidoDeVinculoDeProprietario,
    respostas: {
      201: { descricao: 'Vínculo gravado', esquema: RespostaDeVinculoDeProprietario },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Só o Admin do grupo (proprietarios_so_admin).'),
      404: ERRO('proprietario_nao_encontrado, local_nao_encontrado ou hotel_nao_encontrado.'),
      409: ERRO('Já existe vínculo nesse período (vinculo_sobreposto).'),
      422: ERRO('vigencia_invalida, vinculo_so_com_uh ou entrada_invalida.'),
    },
  },
  {
    metodo: 'put',
    caminho: '/api/v1/vinculos-de-proprietario/{id}/vigencia',
    resumo: 'Altera ou encerra a vigência do vínculo. Só o Admin do grupo.',
    exigeTenant: true,
    corpo: PedidoDeVigenciaDoVinculo,
    respostas: {
      200: { descricao: 'Vigência alterada', esquema: RespostaDeVinculoDeProprietario },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Só o Admin do grupo (proprietarios_so_admin).'),
      404: ERRO('Vínculo não encontrado (vinculo_nao_encontrado).'),
      409: ERRO('Já existe vínculo nesse período (vinculo_sobreposto).'),
      422: ERRO('vigencia_invalida ou entrada_invalida.'),
    },
  },
  {
    metodo: 'get',
    caminho: '/api/v1/hoteis/{id}/ativos',
    resumo:
      'Ativos do hotel no escopo de quem pede (o proprietário vê só os dos locais dele), com os campos estendidos lidos pela categoria. A busca acha o trecho no nome, fabricante, modelo ou número de série.',
    exigeTenant: true,
    busca: true,
    respostas: {
      200: { descricao: 'Ativos do hotel', esquema: RespostaDeAtivosDoHotel },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      404: ERRO('Hotel fora do escopo (hotel_nao_encontrado).'),
      422: ERRO('Termo com menos de 3 caracteres (busca_curta).'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/ativos',
    resumo:
      'Cadastra um ativo num local. Admin, Gestor CSC, Implantador, Gerente ou Técnico do hotel. Os campos estendidos são validados contra a categoria.',
    exigeTenant: true,
    corpo: PedidoDeCadastroDeAtivo,
    respostas: {
      201: { descricao: 'Ativo cadastrado', esquema: RespostaDeAtivoGravado },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Fora do escopo (ativos_fora_do_escopo).'),
      404: ERRO('local_nao_encontrado ou categoria_nao_encontrada.'),
      422: ERRO(
        'ativo_nome_invalido, ativo_texto_invalido, ativo_local_inativo, ativo_categoria_inativa, campo_obrigatorio, campo_desconhecido, valor_de_campo_invalido ou entrada_invalida.',
      ),
    },
  },
  {
    metodo: 'put',
    caminho: '/api/v1/ativos/{id}',
    resumo:
      'Altera o ativo (o local só muda por /movimentacao). Leva a versão vista; se o ativo mudou nesse meio-tempo, 409 (ADR-029).',
    exigeTenant: true,
    corpo: PedidoDeAlteracaoDeAtivo,
    respostas: {
      200: { descricao: 'Ativo alterado, com a versão nova', esquema: RespostaDeAtivoGravado },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Fora do escopo (ativos_fora_do_escopo).'),
      404: ERRO('ativo_nao_encontrado ou categoria_nao_encontrada.'),
      409: ERRO('O ativo mudou (conflito_de_versao, com versaoAtual).'),
      422: ERRO(
        'ativo_nome_invalido, ativo_texto_invalido, ativo_categoria_inativa, campo_obrigatorio, campo_desconhecido, valor_de_campo_invalido ou entrada_invalida.',
      ),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/ativos/{id}/desativacao',
    resumo: 'Desativa o ativo (exclusão lógica). Leva a versão vista.',
    exigeTenant: true,
    corpo: PedidoDeVersaoDeAtivo,
    respostas: {
      200: { descricao: 'Ativo desativado', esquema: RespostaDeAtivoGravado },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Fora do escopo (ativos_fora_do_escopo).'),
      404: ERRO('Ativo não encontrado (ativo_nao_encontrado).'),
      409: ERRO('O ativo mudou (conflito_de_versao, com versaoAtual).'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/ativos/{id}/reativacao',
    resumo: 'Reativa o ativo. Leva a versão vista.',
    exigeTenant: true,
    corpo: PedidoDeVersaoDeAtivo,
    respostas: {
      200: { descricao: 'Ativo reativado', esquema: RespostaDeAtivoGravado },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Fora do escopo (ativos_fora_do_escopo).'),
      404: ERRO('Ativo não encontrado (ativo_nao_encontrado).'),
      409: ERRO('O ativo mudou (conflito_de_versao, com versaoAtual).'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/ativos/{id}/movimentacao',
    resumo:
      'Move o ativo para outro local do mesmo hotel. Admin, Gestor CSC, Implantador ou Gerente do hotel; o técnico não move. Leva a versão vista; grava a movimentação e a auditoria. Entre hotéis: desativar e cadastrar de novo.',
    exigeTenant: true,
    corpo: PedidoDeMovimentacaoDeAtivo,
    respostas: {
      200: { descricao: 'Ativo movido, com a versão nova', esquema: RespostaDeAtivoGravado },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Fora do escopo (mover_ativo_fora_do_escopo).'),
      404: ERRO('ativo_nao_encontrado ou local_nao_encontrado.'),
      409: ERRO('O ativo mudou (conflito_de_versao, com versaoAtual).'),
      422: ERRO(
        'mover_ativo_entre_hoteis, mover_ativo_mesmo_local, mover_ativo_local_inativo, ativo_desativado ou entrada_invalida.',
      ),
    },
  },
  {
    metodo: 'get',
    caminho: '/api/v1/ativos/{id}/movimentacoes',
    resumo:
      'Movimentações do ativo entre locais do hotel (origem, destino, quem e quando), da mais nova para a mais velha. O proprietário não lê movimentações.',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Movimentações do ativo', esquema: RespostaDeMovimentacoesDoAtivo },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      404: ERRO('Ativo fora do escopo (ativo_nao_encontrado).'),
    },
  },
  {
    metodo: 'get',
    caminho: '/api/v1/ativos/{id}/paradas',
    resumo:
      'Paradas do ativo (C5), da mais nova para a mais antiga, com o tempo parado de cada uma e o total, sem contar duas vezes a sobreposição. Lê quem lê o ativo, inclusive o proprietário da UH, que recebe só o ativo, o estado e as datas (sem chamadoId, osId, abertaPor e encerradaPor).',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Paradas do ativo', esquema: RespostaDeParadasDoAtivo },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      404: ERRO('Ativo fora do escopo (ativo_nao_encontrado).'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/paradas/{id}/encerramento',
    resumo:
      'Encerra a parada aberta do ativo (C5), sem fim informado, agora. Admin do grupo, Gestor CSC ou Gerente do hotel; o Técnico responsável encerra na execução, pela operação offline os.encerrar_parada.',
    exigeTenant: true,
    corpo: PedidoDeEncerramentoDeParada,
    respostas: {
      200: { descricao: 'Parada encerrada', esquema: RespostaDeParadaEncerrada },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Fora dos papéis que encerram (parada_fora_do_papel).'),
      404: ERRO('Parada fora do escopo (parada_nao_encontrada).'),
      409: ERRO('A parada já foi encerrada (parada_nao_aberta).'),
      422: ERRO('Fim antes do início ou no futuro (parada_invalida) ou entrada_invalida.'),
    },
  },
  {
    metodo: 'get',
    caminho: '/api/v1/paradas/abertas-com-os-concluida',
    resumo:
      'Paradas abertas cujo chamado já tem a OS concluída ou aceita (o técnico respondeu que o equipamento não voltou a funcionar, ou não respondeu), da mais antiga para a mais nova. Admin do grupo, Gestor CSC e Gerente do hotel, cada um com as dos hotéis dele; o encerramento é pelo POST /api/v1/paradas/{id}/encerramento.',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Paradas pendentes', esquema: RespostaDeParadasPendentes },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Fora dos papéis que encerram parada (parada_fora_do_papel).'),
    },
  },
  {
    metodo: 'get',
    caminho: '/api/v1/ativos/qr/{codigo}',
    resumo:
      'Abre o ativo pelo código do QR individual, no escopo de quem pede. Aceita minúsculas, hífens e O, I e L no lugar de 0 e 1. Código mal formado, de outro tenant ou fora do escopo dá o mesmo 404.',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'O ativo e o hotel dele', esquema: RespostaDeAtivoDoQr },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      404: ERRO('Código desconhecido ou fora do escopo (ativo_nao_encontrado).'),
    },
  },
  {
    metodo: 'get',
    caminho: '/api/v1/hoteis/{id}/locais',
    resumo:
      'Locais do hotel no escopo de quem pede: UHs do sistema hoteleiro (só leitura, menos a edificação, com o status da licença) e áreas comuns, e as edificações que já existem no hotel, para sugerir. A busca acha o trecho no nome ou na edificação.',
    exigeTenant: true,
    busca: true,
    respostas: {
      200: { descricao: 'Locais do hotel', esquema: RespostaDeLocaisDoHotel },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      404: ERRO('Hotel fora do escopo (hotel_nao_encontrado).'),
      422: ERRO('Termo com menos de 3 caracteres (busca_curta).'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/hoteis/{id}/locais',
    resumo:
      'Cadastra uma área comum no hotel (não conta licença). Admin, Gestor CSC, Implantador ou Gerente do hotel.',
    exigeTenant: true,
    corpo: PedidoDeAreaComum,
    respostas: {
      201: { descricao: 'Área comum cadastrada', esquema: RespostaDeLocalAlterado },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Fora do escopo (locais_fora_do_escopo).'),
      404: ERRO('Hotel fora do escopo (hotel_nao_encontrado).'),
      409: ERRO('Nome repetido entre as áreas comuns ativas (local_nome_repetido).'),
      422: ERRO(
        'local_nome_invalido, local_andar_invalido, local_edificacao_invalida ou entrada_invalida.',
      ),
    },
  },
  {
    metodo: 'put',
    caminho: '/api/v1/locais/{id}',
    resumo:
      'Altera nome, andar e edificação da área comum (a edificação ausente fica como está). UH e local do sistema hoteleiro são só leitura.',
    exigeTenant: true,
    corpo: PedidoDeAreaComum,
    respostas: {
      200: { descricao: 'Área comum alterada', esquema: RespostaDeLocalAlterado },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Fora do escopo (locais_fora_do_escopo).'),
      404: ERRO('Local não encontrado (local_nao_encontrado).'),
      409: ERRO('Nome repetido entre as áreas comuns ativas (local_nome_repetido).'),
      422: ERRO(
        'local_so_leitura, local_nome_invalido, local_andar_invalido, local_edificacao_invalida ou entrada_invalida.',
      ),
    },
  },
  {
    metodo: 'put',
    caminho: '/api/v1/locais/{id}/edificacao',
    resumo:
      'Altera só a edificação (torre, bloco) do local, inclusive da UH do sistema hoteleiro, que o conector não sobrescreve. null apaga.',
    exigeTenant: true,
    corpo: PedidoDeEdificacao,
    respostas: {
      200: { descricao: 'Edificação alterada', esquema: RespostaDeLocalAlterado },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Fora do escopo (locais_fora_do_escopo).'),
      404: ERRO('Local não encontrado (local_nao_encontrado).'),
      422: ERRO('local_edificacao_invalida ou entrada_invalida.'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/locais/{id}/desativacao',
    resumo: 'Desativa a área comum (exclusão lógica).',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Área comum desativada', esquema: RespostaDeLocalAlterado },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Fora do escopo (locais_fora_do_escopo).'),
      404: ERRO('Local não encontrado (local_nao_encontrado).'),
      422: ERRO('UH e local do sistema hoteleiro são só leitura (local_so_leitura).'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/locais/{id}/reativacao',
    resumo: 'Reativa a área comum.',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Área comum reativada', esquema: RespostaDeLocalAlterado },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Fora do escopo (locais_fora_do_escopo).'),
      404: ERRO('Local não encontrado (local_nao_encontrado).'),
      409: ERRO('Nome repetido entre as áreas comuns ativas (local_nome_repetido).'),
      422: ERRO('UH e local do sistema hoteleiro são só leitura (local_so_leitura).'),
    },
  },
  {
    metodo: 'get',
    caminho: '/api/v1/hoteis',
    resumo: 'Hotéis visíveis ao usuário no tenant ativo (recorte da RLS).',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Hotéis visíveis', esquema: RespostaDeHoteis },
      400: ERRO('Tenant não informado (tenant_ausente).'),
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/convites',
    resumo: 'Convida uma pessoa para o tenant ativo (ADR-014, ADR-018).',
    exigeTenant: true,
    corpo: PedidoDeConvite,
    respostas: {
      201: { descricao: 'Acesso gravado; o e-mail sai pelo worker', esquema: RespostaDeConvite },
      400: ERRO('Tenant não informado (tenant_ausente).'),
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Quem convida não pode conceder este papel (código do domínio).'),
      404: ERRO('Escopo do convite não visível a quem convida (escopo_nao_encontrado).'),
      409: ERRO('A pessoa já é membro do tenant (ja_e_membro).'),
      422: ERRO('Entrada inválida (entrada_invalida) ou regra do domínio violada.'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/ingestao/lotes',
    resumo: 'O agente conector envia um lote do sistema hoteleiro para o staging (ADR-008).',
    exigeTenant: false,
    autenticacao: 'agente',
    corpo: LoteDeIngestao,
    respostas: {
      200: {
        descricao: 'Lote já recebido; nada reprocessado (novo: false)',
        esquema: RespostaDeLote,
      },
      201: { descricao: 'Lote novo gravado no staging', esquema: RespostaDeLote },
      401: ERRO('Credencial ausente, inválida, revogada ou de outro tenant (nao_autenticado).'),
      413: ERRO('Lote acima do limite (corpo_grande); o agente divide antes.'),
      422: ERRO('Entrada inválida (entrada_invalida) ou chave repetida (lote_com_chave_repetida).'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/credenciais-agente',
    resumo: 'O Admin do grupo cria a credencial do agente; ela sai só nesta resposta.',
    exigeTenant: true,
    corpo: PedidoDeCredencial,
    respostas: {
      201: { descricao: 'Credencial criada', esquema: RespostaDeCredencial },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Só o Admin do grupo (credencial_de_agente_so_admin).'),
      422: ERRO('Entrada inválida (entrada_invalida).'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/credenciais-agente/{id}/revogacao',
    resumo: 'O Admin do grupo revoga a credencial do agente.',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Credencial revogada', esquema: RespostaDeRevogacao },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Só o Admin do grupo (credencial_de_agente_so_admin).'),
      404: ERRO('Credencial não encontrada ou já revogada (credencial_nao_encontrada).'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/anexos/url-de-upload',
    resumo: 'URL assinada para enviar um anexo direto ao Storage (ADR-024).',
    exigeTenant: true,
    corpo: PedidoDeUrlDeUpload,
    respostas: {
      200: { descricao: 'URL de upload (PUT do arquivo)', esquema: RespostaDeUrlDeUpload },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Quem só lê o hotel não anexa (anexo_sem_escrita_no_hotel).'),
      404: ERRO('Registro fora do escopo do usuário (registro_nao_encontrado).'),
      409: ERRO(
        'O arquivo do arquivoId já está no Storage (arquivo_ja_enviado, com o caminho), ou a OS não aceita foto (transicao_invalida, os_de_outro_responsavel).',
      ),
      422: ERRO(
        'Entrada inválida (entrada_invalida) ou tipo não aceito (tipo_de_arquivo_nao_aceito).',
      ),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/anexos/url-de-download',
    resumo: 'URL assinada de curta duração para baixar um anexo do escopo do usuário.',
    exigeTenant: true,
    corpo: PedidoDeUrlDeDownload,
    respostas: {
      200: { descricao: 'URL de download (5 minutos)', esquema: RespostaDeUrlDeDownload },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      404: ERRO('Anexo fora do escopo do usuário (anexo_nao_encontrado).'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/anexos',
    resumo:
      'Registra o arquivo enviado com a URL de upload (e a miniatura gerada no aparelho), com auditoria (B4).',
    exigeTenant: true,
    corpo: PedidoDeRegistroDeAnexo,
    respostas: {
      201: { descricao: 'Anexo registrado', esquema: RespostaDeAnexoRegistrado },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Quem só lê o hotel não anexa (anexo_sem_escrita_no_hotel).'),
      404: ERRO('Registro fora do escopo do usuário (registro_nao_encontrado).'),
      409: ERRO(
        'O arquivo já foi registrado (anexo_ja_registrado), ou a OS não aceita foto (transicao_invalida, os_de_outro_responsavel).',
      ),
      422: ERRO(
        'caminho_de_anexo_invalido, miniatura_invalida, anexo_nome_invalido, momento_da_foto_invalido, momento_so_na_os ou entrada_invalida.',
      ),
    },
  },
  ...(['hoteis', 'locais', 'ativos', 'chamados', 'os'] as const).map((recurso): Rota => ({
    metodo: 'get',
    caminho: `/api/v1/${recurso}/{id}/anexos`,
    resumo:
      'Anexos do registro, do mais novo para o mais antigo. O proprietário vê os dos locais dele, dos ativos que estão neles (B4) e dos chamados que ele vê (C2); as fotos da OS (C4), quem lê o hotel.',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Anexos', esquema: RespostaDeAnexos },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      404: ERRO('Registro fora do escopo do usuário (registro_nao_encontrado).'),
    },
  })),
  {
    metodo: 'post',
    caminho: '/api/v1/anexos/{id}/url-de-download',
    resumo: 'URL de 5 minutos para o arquivo ou a miniatura de um anexo registrado (B4).',
    exigeTenant: true,
    corpo: PedidoDeUrlDoAnexo,
    respostas: {
      200: { descricao: 'URL de download (5 minutos)', esquema: RespostaDeUrlDeDownload },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      404: ERRO('Anexo fora do escopo, removido ou sem miniatura (anexo_nao_encontrado).'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/anexos/{id}/remocao',
    resumo: 'Remove o anexo (exclusão lógica; o arquivo fica no Storage).',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Anexo removido', esquema: RespostaDeAnexoRemovido },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO(
        'Só quem enviou ou quem gere o hotel (remover_anexo_fora_do_escopo); a assinatura do aceite ninguém remove (assinatura_nao_se_remove).',
      ),
      404: ERRO('Anexo fora do escopo ou já removido (anexo_nao_encontrado).'),
    },
  },
  {
    metodo: 'get',
    caminho: '/api/v1/hoteis/{id}/equipes',
    resumo: 'Equipes do hotel, com os membros, e os membros disponíveis para entrar.',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Equipes do hotel', esquema: RespostaDeEquipes },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      404: ERRO('Hotel fora do escopo (hotel_nao_encontrado).'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/hoteis/{id}/equipes',
    resumo: 'Cria uma equipe no hotel (Admin, Gestor CSC, Implantador ou Gerente do hotel).',
    exigeTenant: true,
    corpo: PedidoDeEquipe,
    respostas: {
      201: { descricao: 'Equipe criada', esquema: RespostaDeEquipeAlterada },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Fora do escopo (equipes_fora_do_escopo).'),
      404: ERRO('Hotel fora do escopo (hotel_nao_encontrado).'),
      409: ERRO('Nome repetido no hotel (equipe_nome_repetido).'),
      422: ERRO('Nome inválido (equipe_nome_invalido).'),
    },
  },
  {
    metodo: 'put',
    caminho: '/api/v1/equipes/{id}',
    resumo: 'Renomeia a equipe.',
    exigeTenant: true,
    corpo: PedidoDeEquipe,
    respostas: {
      200: { descricao: 'Equipe renomeada', esquema: RespostaDeEquipeAlterada },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Fora do escopo (equipes_fora_do_escopo).'),
      404: ERRO('Equipe não encontrada (equipe_nao_encontrada).'),
      409: ERRO('Nome repetido no hotel (equipe_nome_repetido).'),
      422: ERRO('Nome inválido (equipe_nome_invalido).'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/equipes/{id}/desativacao',
    resumo: 'Desativa a equipe.',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Equipe desativada', esquema: RespostaDeEquipeAlterada },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Fora do escopo (equipes_fora_do_escopo).'),
      404: ERRO('Equipe não encontrada (equipe_nao_encontrada).'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/equipes/{id}/reativacao',
    resumo: 'Reativa a equipe.',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Equipe reativada', esquema: RespostaDeEquipeAlterada },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Fora do escopo (equipes_fora_do_escopo).'),
      404: ERRO('Equipe não encontrada (equipe_nao_encontrada).'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/equipes/{id}/membros',
    resumo: 'Põe (ou reativa) um membro na equipe.',
    exigeTenant: true,
    corpo: PedidoDeMembroDaEquipe,
    respostas: {
      200: { descricao: 'Membro na equipe', esquema: RespostaDeMembroDaEquipe },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Fora do escopo (equipes_fora_do_escopo).'),
      404: ERRO('Equipe não encontrada (equipe_nao_encontrada).'),
      422: ERRO('Quem não é membro do tenant (recusado_pela_integridade).'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/equipes/{id}/membros/{usuarioId}/remocao',
    resumo: 'Tira o membro da equipe (desativação lógica).',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Membro fora da equipe', esquema: RespostaDeMembroDaEquipe },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Fora do escopo (equipes_fora_do_escopo).'),
      404: ERRO(
        'Equipe ou participação não encontrada (equipe_nao_encontrada, membro_nao_encontrado).',
      ),
    },
  },
  {
    metodo: 'get',
    caminho: '/api/v1/preferencias',
    resumo: 'Idioma, formato regional, fuso e moeda de quem usa, já resolvidos (ADR-022).',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Preferências resolvidas e as gravadas', esquema: RespostaDePreferencias },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
    },
  },
  {
    metodo: 'put',
    caminho: '/api/v1/preferencias',
    resumo: 'Grava as preferências de idioma e região do próprio usuário.',
    exigeTenant: true,
    corpo: PedidoDePreferencias,
    respostas: {
      200: {
        descricao: 'Preferências resolvidas depois da gravação',
        esquema: RespostaDePreferencias,
      },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      422: ERRO(
        'Entrada inválida (entrada_invalida), formato regional fora da lista ' +
          '(formato_regional_nao_aceito) ou fuso inválido (fuso_invalido).',
      ),
    },
  },
  {
    metodo: 'get',
    caminho: '/api/v1/bandeiras',
    resumo: 'Bandeiras do tenant (ativas e desativadas).',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Bandeiras', esquema: RespostaDeBandeiras },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/bandeiras',
    resumo: 'Cria uma bandeira. Só o Admin do grupo.',
    exigeTenant: true,
    corpo: PedidoDeBandeira,
    respostas: {
      201: { descricao: 'Bandeira criada', esquema: RespostaDeBandeiraCriada },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Só o Admin do grupo (bandeiras_so_admin).'),
      409: ERRO('Nome repetido (bandeira_nome_repetido).'),
      422: ERRO('Nome inválido (bandeira_nome_invalido).'),
    },
  },
  {
    metodo: 'put',
    caminho: '/api/v1/bandeiras/{id}',
    resumo: 'Renomeia a bandeira. Só o Admin do grupo.',
    exigeTenant: true,
    corpo: PedidoDeBandeira,
    respostas: {
      200: { descricao: 'Bandeira renomeada', esquema: RespostaDeBandeiraAlterada },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Só o Admin do grupo (bandeiras_so_admin).'),
      404: ERRO('Bandeira não encontrada (bandeira_nao_encontrada).'),
      409: ERRO('Nome repetido (bandeira_nome_repetido).'),
      422: ERRO('Nome inválido (bandeira_nome_invalido).'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/bandeiras/{id}/desativacao',
    resumo: 'Desativa a bandeira: deixa de ser oferecida para novos hotéis.',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Bandeira desativada', esquema: RespostaDeBandeiraAlterada },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Só o Admin do grupo (bandeiras_so_admin).'),
      404: ERRO('Bandeira não encontrada (bandeira_nao_encontrada).'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/bandeiras/{id}/reativacao',
    resumo: 'Reativa a bandeira.',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Bandeira reativada', esquema: RespostaDeBandeiraAlterada },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Só o Admin do grupo (bandeiras_so_admin).'),
      404: ERRO('Bandeira não encontrada (bandeira_nao_encontrada).'),
    },
  },
  {
    metodo: 'get',
    caminho: '/api/v1/fornecedores',
    resumo:
      'Fornecedores do grupo (I3), ativos e desativados, pelo nome. Lê quem tem papel em algum hotel do grupo, menos o proprietário, que recebe a lista vazia.',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Fornecedores', esquema: RespostaDeFornecedores },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/fornecedores',
    resumo:
      'Cadastra um fornecedor do grupo: nome, CNPJ opcional (numérico ou alfanumérico, com ou sem pontuação; único no grupo) e contato opcional. Admin do grupo, Gestor CSC ou Gerente do hotel.',
    exigeTenant: true,
    corpo: PedidoDeFornecedor,
    respostas: {
      201: { descricao: 'Fornecedor cadastrado', esquema: RespostaDeFornecedorGravado },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO(
        'Sem permissão (fornecedores_sem_permissao), ou o papel de Gestor CSC ou Gerente ainda não alcança nenhum hotel (fornecedores_sem_hotel).',
      ),
      409: ERRO('CNPJ já cadastrado no grupo (fornecedor_cnpj_repetido).'),
      422: ERRO(
        'fornecedor_nome_invalido, fornecedor_cnpj_invalido, fornecedor_contato_nome_invalido, fornecedor_telefone_invalido, fornecedor_email_invalido ou entrada_invalida.',
      ),
    },
  },
  {
    metodo: 'put',
    caminho: '/api/v1/fornecedores/{id}',
    resumo:
      'Altera o cadastro do fornecedor (todos os campos). Leva a versão vista; se ele mudou nesse meio-tempo, 409 (ADR-029).',
    exigeTenant: true,
    corpo: PedidoDeAlteracaoDeFornecedor,
    respostas: {
      200: {
        descricao: 'Fornecedor alterado, com a versão nova',
        esquema: RespostaDeFornecedorGravado,
      },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO(
        'Sem permissão (fornecedores_sem_permissao), ou o papel de Gestor CSC ou Gerente ainda não alcança nenhum hotel (fornecedores_sem_hotel).',
      ),
      404: ERRO('Fornecedor não encontrado (fornecedor_nao_encontrado).'),
      409: ERRO('fornecedor_cnpj_repetido ou conflito_de_versao (com versaoAtual).'),
      422: ERRO(
        'fornecedor_nome_invalido, fornecedor_cnpj_invalido, fornecedor_contato_nome_invalido, fornecedor_telefone_invalido, fornecedor_email_invalido ou entrada_invalida.',
      ),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/fornecedores/{id}/desativacao',
    resumo: 'Desativa o fornecedor (exclusão lógica). Leva a versão vista.',
    exigeTenant: true,
    corpo: PedidoDeVersaoDeFornecedor,
    respostas: {
      200: { descricao: 'Fornecedor desativado', esquema: RespostaDeFornecedorGravado },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO(
        'Sem permissão (fornecedores_sem_permissao), ou o papel de Gestor CSC ou Gerente ainda não alcança nenhum hotel (fornecedores_sem_hotel).',
      ),
      404: ERRO('Fornecedor não encontrado (fornecedor_nao_encontrado).'),
      409: ERRO('O fornecedor mudou (conflito_de_versao, com versaoAtual).'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/fornecedores/{id}/reativacao',
    resumo: 'Reativa o fornecedor. Leva a versão vista.',
    exigeTenant: true,
    corpo: PedidoDeVersaoDeFornecedor,
    respostas: {
      200: { descricao: 'Fornecedor reativado', esquema: RespostaDeFornecedorGravado },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO(
        'Sem permissão (fornecedores_sem_permissao), ou o papel de Gestor CSC ou Gerente ainda não alcança nenhum hotel (fornecedores_sem_hotel).',
      ),
      404: ERRO('Fornecedor não encontrado (fornecedor_nao_encontrado).'),
      409: ERRO('O fornecedor mudou (conflito_de_versao, com versaoAtual).'),
    },
  },
  {
    metodo: 'put',
    caminho: '/api/v1/hoteis/{id}/bandeira',
    resumo: 'Troca (ou tira) a bandeira do hotel; o escopo do Gestor CSC da bandeira muda na hora.',
    exigeTenant: true,
    corpo: PedidoDeBandeiraDoHotel,
    respostas: {
      200: { descricao: 'Bandeira do hotel trocada', esquema: RespostaDeBandeiraDoHotel },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Só o Admin do grupo (bandeiras_so_admin).'),
      404: ERRO(
        'Hotel ou bandeira não encontrado (hotel_nao_encontrado, bandeira_nao_encontrada).',
      ),
      422: ERRO('Bandeira desativada (bandeira_desativada).'),
    },
  },
  {
    metodo: 'get',
    caminho: '/api/v1/hoteis/staging',
    resumo:
      'Hotéis do sistema hoteleiro (staging), com o cadastro e o uso da licença. Só o Admin do grupo.',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Hotéis do staging', esquema: RespostaDeHoteisDoStaging },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Só o Admin do grupo (ativacao_so_admin).'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/hoteis/importacoes',
    resumo: 'Traz um hotel do staging para implantação, sem consumir licença.',
    exigeTenant: true,
    corpo: PedidoDeImportacaoDeHotel,
    respostas: {
      201: { descricao: 'Hotel em implantação', esquema: RespostaDeImportacaoDeHotel },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Só o Admin do grupo (ativacao_so_admin).'),
      404: ERRO('Hotel fora do staging (hotel_nao_encontrado_no_staging).'),
      409: ERRO('Hotel já importado (hotel_ja_importado).'),
      422: ERRO(
        'Sem nome no staging, fuso ausente ou inválido (hotel_sem_nome_no_staging, fuso_obrigatorio, fuso_invalido).',
      ),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/hoteis/{id}/ativacao',
    resumo: 'Ativa o hotel, consumindo uma licença; libera as UHs pendentes até o saldo de UHs.',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Hotel ativo', esquema: RespostaDeAtivacaoDeHotel },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Só o Admin do grupo (ativacao_so_admin, sem_permissao).'),
      404: ERRO('Hotel não encontrado (hotel_nao_encontrado).'),
      409: ERRO(
        'Hotel já ativo ou sem licença de hotel (hotel_ja_ativo, licenca_hoteis_sem_saldo).',
      ),
    },
  },
  {
    metodo: 'get',
    caminho: '/api/v1/hoteis/{id}/implantacao',
    resumo:
      'Painel de implantação do hotel: locais, papéis vigentes e pendências. Admin do grupo ou Implantador do hotel.',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Resumo da implantação', esquema: RespostaDeImplantacao },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Fora do escopo (implantacao_fora_do_escopo).'),
      404: ERRO('Hotel não encontrado (hotel_nao_encontrado).'),
    },
  },
  {
    metodo: 'get',
    caminho: '/api/v1/membros',
    resumo: 'Membros do tenant com as atribuições visíveis (Admin do grupo e Implantador).',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Membros', esquema: RespostaDeMembros },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Só o Admin do grupo e o Implantador (gestao_de_membros_so_admin_ou_implantador).'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/atribuicoes',
    resumo: 'Concede um papel num escopo (regras de escalada do domínio e da RLS).',
    exigeTenant: true,
    corpo: PedidoDeConcessaoDePapel,
    respostas: {
      201: { descricao: 'Papel concedido', esquema: RespostaDeConcessaoDePapel },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Concessão fora do alcance de quem concede (códigos de papel).'),
      422: ERRO(
        'Pedido inválido (entrada_invalida, validade_no_passado, implantador_exige_hotel_e_validade).',
      ),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/atribuicoes/{id}/revogacao',
    resumo: 'Revoga uma atribuição (exclusão lógica).',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Atribuição revogada', esquema: RespostaDeRevogacaoDePapel },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Revogação fora do alcance (códigos de papel).'),
      404: ERRO('Atribuição não encontrada (atribuicao_nao_encontrada).'),
      422: ERRO('Já revogada (ja_revogada).'),
    },
  },
  {
    metodo: 'put',
    caminho: '/api/v1/atribuicoes/{id}/validade',
    resumo: 'Muda a validade de uma atribuição (ex.: prorrogar o Implantador).',
    exigeTenant: true,
    corpo: PedidoDeValidade,
    respostas: {
      200: { descricao: 'Validade alterada', esquema: RespostaDeValidade },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO(
        'Fora do alcance (validade_so_admin_ou_implantador, implantador_nao_altera_validade_do_papel).',
      ),
      404: ERRO('Atribuição não encontrada (atribuicao_nao_encontrada).'),
      422: ERRO(
        'Validade inválida (validade_no_passado, implantador_exige_hotel_e_validade, ja_revogada).',
      ),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/membros/{usuarioId}/desativacao',
    resumo: 'Desativa o membro no tenant: perde o acesso na hora. Só o Admin do grupo.',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Membro desativado', esquema: RespostaDeAtivoDoMembro },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Só o Admin do grupo (ativacao_de_membro_so_admin).'),
      404: ERRO('Membro não encontrado ou já desativado (membro_nao_encontrado).'),
      422: ERRO('Não altera o próprio acesso (nao_altera_o_proprio_acesso).'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/membros/{usuarioId}/reativacao',
    resumo: 'Reativa o membro no tenant. Só o Admin do grupo.',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Membro reativado', esquema: RespostaDeAtivoDoMembro },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Só o Admin do grupo (ativacao_de_membro_so_admin).'),
      404: ERRO('Membro não encontrado ou já ativo (membro_nao_encontrado).'),
      422: ERRO('Não altera o próprio acesso (nao_altera_o_proprio_acesso).'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/sincronizacao/operacoes',
    resumo: 'Uma operação feita offline no PWA, com chave de idempotência (ADR-025).',
    exigeTenant: true,
    corpo: PedidoDeOperacaoOffline,
    respostas: {
      201: { descricao: 'Operação aplicada agora', esquema: RespostaDeOperacaoOffline },
      200: {
        descricao: 'Chave já recebida: resposta guardada, nada aplicado de novo',
        esquema: RespostaDeOperacaoOffline,
      },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO(
        'Fora do escopo (o código da regra, ex.: ativos_fora_do_escopo); a chave não é guardada.',
      ),
      404: ERRO('Registro fora do escopo (ex.: ativo_nao_encontrado); a chave não é guardada.'),
      409: ERRO(
        'O registro mudou desde que o aparelho o leu (conflito_de_versao, transicao_invalida, os_de_outro_responsavel, parada_ja_aberta, parada_nao_aberta, parada_de_outro_chamado); a chave não é guardada.',
      ),
      422: ERRO(
        'Operação inválida (entrada_invalida ou o código da regra); a chave não é guardada.',
      ),
    },
  },
  {
    metodo: 'get',
    caminho: '/api/v1/configuracao',
    resumo:
      'Configuração do tenant e, com ?hotelId=, a do hotel; políticas com o valor de cada nível ' +
      'e o efetivo (hotel → grupo → padrão). Qualquer membro.',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Configuração e políticas', esquema: RespostaDeConfiguracao },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      404: ERRO('Hotel fora do escopo (hotel_nao_encontrado).'),
    },
  },
  {
    metodo: 'put',
    caminho: '/api/v1/configuracao',
    resumo: 'País, subdivisão, moeda e idioma padrão do tenant. Só o Admin do grupo.',
    exigeTenant: true,
    corpo: PedidoDeConfiguracaoDoTenant,
    respostas: {
      200: { descricao: 'Configuração depois da gravação', esquema: RespostaDeConfiguracao },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Só o Admin do grupo (configuracao_so_admin).'),
      422: ERRO('pais_invalido, subdivisao_invalida, moeda_invalida ou entrada_invalida.'),
    },
  },
  {
    metodo: 'put',
    caminho: '/api/v1/hoteis/{id}/configuracao',
    resumo:
      'Fuso, país, subdivisão, moeda e idioma do hotel (nulo herda) e o modelo contratual (ausente fica como está; nulo é não informado). Só o Admin do grupo.',
    exigeTenant: true,
    corpo: PedidoDeConfiguracaoDoHotel,
    respostas: {
      200: { descricao: 'Configuração depois da gravação', esquema: RespostaDeConfiguracao },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Só o Admin do grupo (configuracao_so_admin).'),
      404: ERRO('Hotel não encontrado (hotel_nao_encontrado).'),
      422: ERRO(
        'fuso_invalido, pais_invalido, subdivisao_invalida, moeda_invalida, hotel_modelo_contratual_invalido ou entrada_invalida.',
      ),
    },
  },
  {
    metodo: 'put',
    caminho: '/api/v1/politicas',
    resumo:
      'Grava a política no grupo ou no hotel; valor null volta a herdar. Só o Admin do grupo (ADR-026).',
    exigeTenant: true,
    corpo: PedidoDePolitica,
    respostas: {
      200: { descricao: 'Configuração depois da gravação', esquema: RespostaDeConfiguracao },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Só o Admin do grupo (configuracao_so_admin).'),
      404: ERRO('Hotel fora do escopo (hotel_nao_encontrado).'),
      422: ERRO('Formato fora da política (politica_valor_invalido) ou entrada_invalida.'),
    },
  },
  {
    metodo: 'get',
    caminho: '/api/v1/categorias-de-ativo',
    resumo:
      'Categorias de ativo do tenant, com os campos estendidos e o idioma padrão para a volta dos nomes (ADR-027, ADR-028).',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Categorias', esquema: RespostaDeCategorias },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/categorias-de-ativo',
    resumo: 'Cria uma categoria do tenant. Só o Admin do grupo.',
    exigeTenant: true,
    corpo: PedidoDeCategoria,
    respostas: {
      201: { descricao: 'Categoria criada', esquema: RespostaDeCategoriaAlterada },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Só o Admin do grupo (categorias_so_admin).'),
      422: ERRO(
        'categoria_nome_invalido, definicao_de_campo_invalida (campo, motivo) ou entrada_invalida.',
      ),
    },
  },
  {
    metodo: 'put',
    caminho: '/api/v1/categorias-de-ativo/{id}',
    resumo:
      'Altera nomes e campos. O tipo de um campo existente não muda; campo novo obrigatório vale para gravações novas.',
    exigeTenant: true,
    corpo: PedidoDeCategoria,
    respostas: {
      200: { descricao: 'Categoria alterada', esquema: RespostaDeCategoriaAlterada },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Só o Admin do grupo (categorias_so_admin).'),
      404: ERRO('Categoria não encontrada (categoria_nao_encontrada).'),
      422: ERRO(
        'categoria_nome_invalido, definicao_de_campo_invalida, campo_muda_de_tipo ou entrada_invalida.',
      ),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/categorias-de-ativo/{id}/desativacao',
    resumo: 'Desativa a categoria (exclusão lógica).',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Categoria desativada', esquema: RespostaDeCategoriaAlterada },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Só o Admin do grupo (categorias_so_admin).'),
      404: ERRO('Categoria não encontrada (categoria_nao_encontrada).'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/categorias-de-ativo/{id}/reativacao',
    resumo: 'Reativa a categoria.',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Categoria reativada', esquema: RespostaDeCategoriaAlterada },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Só o Admin do grupo (categorias_so_admin).'),
      404: ERRO('Categoria não encontrada (categoria_nao_encontrada).'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/categorias-de-ativo/padrao',
    resumo: 'Instala as categorias padrão do catálogo que o tenant ainda não tem. Idempotente.',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Quantas foram instaladas', esquema: RespostaDeCategoriasPadrao },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Só o Admin do grupo (categorias_so_admin).'),
    },
  },
  {
    metodo: 'get',
    caminho: '/api/v1/codigos-de-manutencao',
    resumo:
      'Códigos de falha, causa e solução do tenant, inclusive os desativados, com o idioma padrão para a volta dos nomes (I6, ADR-027). Lê o Admin do grupo e quem lê algum hotel.',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Códigos', esquema: RespostaDeCodigosDeManutencao },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/codigos-de-manutencao',
    resumo:
      'Cria um código do tenant: tipo, categoria de ativo (nula: todas) e nomes. O tipo e a categoria não mudam depois. Só o Admin do grupo.',
    exigeTenant: true,
    corpo: PedidoDeCodigoDeManutencao,
    respostas: {
      201: { descricao: 'Código criado', esquema: RespostaDeCodigoAlterado },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Só o Admin do grupo (codigos_so_admin).'),
      404: ERRO('Categoria não encontrada (categoria_nao_encontrada).'),
      422: ERRO('codigo_nome_invalido, codigo_tipo_invalido ou entrada_invalida.'),
    },
  },
  {
    metodo: 'put',
    caminho: '/api/v1/codigos-de-manutencao/{id}',
    resumo: 'Altera os nomes do código. No padrão, o nome vazio volta ao do catálogo.',
    exigeTenant: true,
    corpo: PedidoDeNomesDeCodigo,
    respostas: {
      200: { descricao: 'Código alterado', esquema: RespostaDeCodigoAlterado },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Só o Admin do grupo (codigos_so_admin).'),
      404: ERRO('Código não encontrado (codigo_nao_encontrado).'),
      422: ERRO('codigo_nome_invalido ou entrada_invalida.'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/codigos-de-manutencao/{id}/desativacao',
    resumo:
      'Desativa o código (exclusão lógica). A OS que já o tem continua com ele; a conclusão e o aceite novos não o aceitam.',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Código desativado', esquema: RespostaDeCodigoAlterado },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Só o Admin do grupo (codigos_so_admin).'),
      404: ERRO('Código não encontrado (codigo_nao_encontrado).'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/codigos-de-manutencao/{id}/reativacao',
    resumo: 'Reativa o código.',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Código reativado', esquema: RespostaDeCodigoAlterado },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Só o Admin do grupo (codigos_so_admin).'),
      404: ERRO('Código não encontrado (codigo_nao_encontrado).'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/codigos-de-manutencao/padrao',
    resumo:
      'Instala os códigos padrão do catálogo que o tenant ainda não tem. A falha de uma categoria padrão entra só se o tenant tiver a categoria. Idempotente.',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Quantos foram instalados', esquema: RespostaDeCodigosPadrao },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Só o Admin do grupo (codigos_so_admin).'),
    },
  },
  {
    metodo: 'get',
    caminho: '/api/v1/modelos-de-checklist',
    resumo:
      'Modelos de checklist do grupo, inclusive os desativados, com o idioma padrão para a volta dos nomes (PV1, ADR-040). Leem a gestão (Admin do grupo, Gestor CSC e Gerente do hotel) e o Implantador; para os outros, a lista vem vazia.',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Modelos', esquema: RespostaDeModelosDeChecklist },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/modelos-de-checklist',
    resumo:
      'Cria um modelo de checklist: nomes, categoria sugerida (nula: todas) e itens tipados (ADR-028), até 50, com a marca de obrigatório. Começa na versão 1. Só o Admin do grupo.',
    exigeTenant: true,
    corpo: PedidoDeModeloDeChecklist,
    respostas: {
      201: { descricao: 'Modelo criado', esquema: RespostaDeModeloDeChecklistAlterado },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Só o Admin do grupo (checklists_so_admin).'),
      422: ERRO('checklist_nome_invalido, definicao_de_campo_invalida ou entrada_invalida.'),
    },
  },
  {
    metodo: 'put',
    caminho: '/api/v1/modelos-de-checklist/{id}',
    resumo:
      'Altera nomes, categoria e itens do modelo. A versão sobe só quando os itens mudam; o tipo de um item existente não muda. As OS que já têm o checklist ficam com a cópia delas (ADR-026).',
    exigeTenant: true,
    corpo: PedidoDeModeloDeChecklist,
    respostas: {
      200: {
        descricao: 'Modelo alterado, com a versão',
        esquema: RespostaDeModeloDeChecklistAlterado,
      },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Só o Admin do grupo (checklists_so_admin).'),
      404: ERRO('Modelo não encontrado (checklist_nao_encontrado).'),
      422: ERRO(
        'checklist_nome_invalido, definicao_de_campo_invalida, campo_muda_de_tipo ou entrada_invalida.',
      ),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/modelos-de-checklist/{id}/desativacao',
    resumo: 'Desativa o modelo (exclusão lógica). As OS que já o têm continuam com a cópia.',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Modelo desativado', esquema: RespostaDeModeloDeChecklistAlterado },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Só o Admin do grupo (checklists_so_admin).'),
      404: ERRO('Modelo não encontrado (checklist_nao_encontrado).'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/modelos-de-checklist/{id}/reativacao',
    resumo: 'Reativa o modelo.',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Modelo reativado', esquema: RespostaDeModeloDeChecklistAlterado },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Só o Admin do grupo (checklists_so_admin).'),
      404: ERRO('Modelo não encontrado (checklist_nao_encontrado).'),
    },
  },
  {
    metodo: 'get',
    caminho: '/api/v1/hoteis/{id}/planos-preventivos',
    resumo:
      'Planos preventivos do hotel, com a próxima data no fuso do hotel (gestão do hotel e Implantador; os outros recebem a lista vazia).',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Planos do hotel', esquema: RespostaDePlanosPreventivos },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      404: ERRO('Hotel fora do escopo (hotel_nao_encontrado).'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/hoteis/{id}/planos-preventivos',
    resumo:
      'Cadastra um plano preventivo do ativo ou da categoria no hotel, pausado ou já ativo (Admin, Gestor CSC, Gerente do hotel ou Implantador).',
    exigeTenant: true,
    corpo: PedidoDeNovoPlanoPreventivo,
    respostas: {
      201: { descricao: 'Plano cadastrado', esquema: RespostaDePlanoAlterado },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Fora do escopo (planos_fora_do_escopo).'),
      404: ERRO('Hotel fora do escopo (hotel_nao_encontrado).'),
      422: ERRO(
        'Dados inválidos: plano_alvo_invalido, plano_ativo_invalido, plano_categoria_invalida, plano_checklist_invalido, plano_tecnico_invalido, plano_equipe_invalida, plano_responsavel_duplo, plano_sem_responsavel, periodicidade_invalida, plano_inicio_invalido ou plano_nome_invalido.',
      ),
    },
  },
  {
    metodo: 'put',
    caminho: '/api/v1/planos-preventivos/{id}',
    resumo: 'Altera o plano, pela versão; o alvo não muda.',
    exigeTenant: true,
    corpo: PedidoDeAlteracaoDePlanoPreventivo,
    respostas: {
      200: { descricao: 'Plano alterado', esquema: RespostaDePlanoAlterado },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Fora do escopo (planos_fora_do_escopo).'),
      404: ERRO('Plano não encontrado (plano_nao_encontrado).'),
      409: ERRO('Versão desatualizada (conflito_de_versao).'),
      422: ERRO(
        'Dados inválidos (os mesmos do cadastro), plano encerrado (plano_encerrado) ou plano ativo sem responsável (plano_sem_responsavel).',
      ),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/planos-preventivos/{id}/ativacao',
    resumo: 'Ativa o plano pausado; exige o responsável padrão.',
    exigeTenant: true,
    corpo: PedidoDeSituacaoDoPlano,
    respostas: {
      200: { descricao: 'Plano ativado', esquema: RespostaDePlanoAlterado },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Fora do escopo (planos_fora_do_escopo).'),
      404: ERRO('Plano não encontrado (plano_nao_encontrado).'),
      409: ERRO('Versão desatualizada (conflito_de_versao).'),
      422: ERRO(
        'Plano encerrado (plano_encerrado), já ativo (plano_transicao_invalida) ou sem responsável (plano_sem_responsavel).',
      ),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/planos-preventivos/{id}/pausa',
    resumo: 'Pausa o plano ativo; não apaga nada.',
    exigeTenant: true,
    corpo: PedidoDeSituacaoDoPlano,
    respostas: {
      200: { descricao: 'Plano pausado', esquema: RespostaDePlanoAlterado },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Fora do escopo (planos_fora_do_escopo).'),
      404: ERRO('Plano não encontrado (plano_nao_encontrado).'),
      409: ERRO('Versão desatualizada (conflito_de_versao).'),
      422: ERRO('Plano encerrado (plano_encerrado) ou já pausado (plano_transicao_invalida).'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/planos-preventivos/{id}/encerramento',
    resumo: 'Encerra o plano; não volta.',
    exigeTenant: true,
    corpo: PedidoDeSituacaoDoPlano,
    respostas: {
      200: { descricao: 'Plano encerrado', esquema: RespostaDePlanoAlterado },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Fora do escopo (planos_fora_do_escopo).'),
      404: ERRO('Plano não encontrado (plano_nao_encontrado).'),
      409: ERRO('Versão desatualizada (conflito_de_versao).'),
      422: ERRO('Plano já encerrado (plano_encerrado).'),
    },
  },
  {
    metodo: 'get',
    caminho: '/api/v1/ativos/{id}/planos-preventivos',
    resumo: 'Planos preventivos do ativo, para a ficha dele.',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Planos do ativo', esquema: RespostaDePlanosPreventivos },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      404: ERRO('Ativo fora do escopo (ativo_nao_encontrado).'),
    },
  },
  {
    metodo: 'get',
    caminho: '/api/v1/situacoes-e-prioridades',
    resumo:
      'Situações (ligadas aos estados canônicos do chamado e da OS) e prioridades do tenant, na ordem da tela, com o idioma padrão para a volta dos nomes (ADR-027).',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Situações e prioridades', esquema: RespostaDeSituacoesEPrioridades },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/situacoes-e-prioridades/padrao',
    resumo:
      'Instala as situações e prioridades padrão do catálogo que o tenant ainda não tem. Idempotente.',
    exigeTenant: true,
    respostas: {
      200: {
        descricao: 'Quantas foram instaladas',
        esquema: RespostaDeSituacoesEPrioridadesPadrao,
      },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Só o Admin do grupo (situacoes_so_admin ou prioridades_so_admin).'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/situacoes',
    resumo:
      'Cria uma situação ligada a um estado canônico. A entidade e o estado não mudam depois.',
    exigeTenant: true,
    corpo: PedidoDeSituacaoNova,
    respostas: {
      201: { descricao: 'Situação criada', esquema: RespostaDeConfiguracaoAlterada },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Só o Admin do grupo (situacoes_so_admin).'),
      422: ERRO(
        'estado_invalido, situacao_nome_invalido, ordem_invalida, cor_invalida ou entrada_invalida.',
      ),
    },
  },
  {
    metodo: 'put',
    caminho: '/api/v1/situacoes/{id}',
    resumo: 'Altera nomes, ordem e cor da situação.',
    exigeTenant: true,
    corpo: PedidoDeSituacao,
    respostas: {
      200: { descricao: 'Situação alterada', esquema: RespostaDeConfiguracaoAlterada },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Só o Admin do grupo (situacoes_so_admin).'),
      404: ERRO('Situação não encontrada (situacao_nao_encontrada).'),
      422: ERRO('situacao_nome_invalido, ordem_invalida, cor_invalida ou entrada_invalida.'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/situacoes/{id}/desativacao',
    resumo: 'Desativa a situação (exclusão lógica).',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Situação desativada', esquema: RespostaDeConfiguracaoAlterada },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Só o Admin do grupo (situacoes_so_admin).'),
      404: ERRO('Situação não encontrada (situacao_nao_encontrada).'),
      422: ERRO('É a última situação ativa do estado (ultima_situacao_do_estado).'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/situacoes/{id}/reativacao',
    resumo: 'Reativa a situação.',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Situação reativada', esquema: RespostaDeConfiguracaoAlterada },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Só o Admin do grupo (situacoes_so_admin).'),
      404: ERRO('Situação não encontrada (situacao_nao_encontrada).'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/prioridades',
    resumo: 'Cria uma prioridade do tenant, com ordem e peso.',
    exigeTenant: true,
    corpo: PedidoDePrioridade,
    respostas: {
      201: { descricao: 'Prioridade criada', esquema: RespostaDeConfiguracaoAlterada },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Só o Admin do grupo (prioridades_so_admin).'),
      422: ERRO('prioridade_nome_invalido, ordem_invalida, peso_invalido ou entrada_invalida.'),
    },
  },
  {
    metodo: 'put',
    caminho: '/api/v1/prioridades/{id}',
    resumo: 'Altera nomes, ordem e peso da prioridade.',
    exigeTenant: true,
    corpo: PedidoDePrioridade,
    respostas: {
      200: { descricao: 'Prioridade alterada', esquema: RespostaDeConfiguracaoAlterada },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Só o Admin do grupo (prioridades_so_admin).'),
      404: ERRO('Prioridade não encontrada (prioridade_nao_encontrada).'),
      422: ERRO('prioridade_nome_invalido, ordem_invalida, peso_invalido ou entrada_invalida.'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/prioridades/{id}/desativacao',
    resumo: 'Desativa a prioridade (exclusão lógica).',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Prioridade desativada', esquema: RespostaDeConfiguracaoAlterada },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Só o Admin do grupo (prioridades_so_admin).'),
      404: ERRO('Prioridade não encontrada (prioridade_nao_encontrada).'),
      422: ERRO('É a última prioridade ativa (ultima_prioridade).'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/prioridades/{id}/reativacao',
    resumo: 'Reativa a prioridade.',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Prioridade reativada', esquema: RespostaDeConfiguracaoAlterada },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Só o Admin do grupo (prioridades_so_admin).'),
      404: ERRO('Prioridade não encontrada (prioridade_nao_encontrada).'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/chamados',
    resumo:
      'Abre um chamado no local (UH ou área comum), com ativo opcional do mesmo local. Abre quem tem escrita no hotel, inclusive o Solicitante. A prioridade padrão vem da política por categoria (hotel → grupo → padrão), com a cópia no chamado (ADR-026). A foto vai depois, como anexo do chamado. Com paradoDesde, grava a parada aberta do ativo (C5); se o ativo já está parado, fica a parada que existe. Com impactoHospede, responde se afeta hóspede (null: não sei); com uhIndisponivelDesde, grava o período aberto da UH do chamado (I4), só em chamado de UH. A origem é gravada pelo servidor, interna.',
    exigeTenant: true,
    corpo: PedidoDeAberturaDeChamado,
    respostas: {
      201: { descricao: 'Chamado aberto', esquema: RespostaDeChamadoAberto },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Sem escrita no hotel (chamado_fora_do_escopo).'),
      404: ERRO('local_nao_encontrado, hotel_nao_encontrado ou ativo_nao_encontrado.'),
      422: ERRO(
        'chamado_uh_pendente_licenca, chamado_local_inativo, chamado_descricao_invalida, chamado_ativo_fora_do_local, chamado_ativo_desativado, parada_sem_ativo, parada_invalida, uh_indisponivel_fora_de_uh, uh_indisponivel_periodo_invalido, sem_prioridade_ativa, sem_situacao_para_estado ou entrada_invalida.',
      ),
    },
  },
  {
    metodo: 'get',
    caminho: '/api/v1/chamados/{id}',
    resumo:
      'O chamado e as OS dele, se visível a quem pede: quem lê o hotel, o proprietário da UH do chamado ou do hotel inteiro. Com os nomes do hotel, do local, do ativo, de quem abriu e dos responsáveis (C7); o que quem pede não lê vem null ou fica de fora.',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Chamado, com as OS e os nomes', esquema: RespostaDeChamado },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      404: ERRO('Chamado fora do escopo (chamado_nao_encontrado).'),
    },
  },
  {
    metodo: 'get',
    caminho: '/api/v1/chamados',
    resumo:
      'Lista os chamados no escopo de quem pede (C7): cada papel vê os dos hotéis que lê, e o proprietário, os das UHs e do hotel inteiro dele (RLS). Filtros opcionais: hotel, situação, prioridade e período pela data de abertura (de inclusive, ate exclusive). Do mais novo para o mais antigo, 50 por página; a seguinte com depoisDe = proximo.',
    exigeTenant: true,
    consulta: ConsultaDaLista,
    respostas: {
      200: { descricao: 'Uma página de chamados', esquema: RespostaDeListaDeChamados },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      422: ERRO('periodo_invalido (de igual ou depois de ate) ou entrada_invalida.'),
    },
  },
  {
    metodo: 'get',
    caminho: '/api/v1/chamados/{id}/linha-do-tempo',
    resumo:
      'A linha do tempo do chamado (C7): as ações da auditoria do chamado, das OS dele e das paradas do chamado, com quem fez, quando e o motivo do cancelamento ou da reabertura, da mais antiga para a mais nova. A auditoria é lida pela RLS: o proprietário lê a do chamado e das OS que ele vê, e não a das paradas (D1).',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Eventos do chamado', esquema: RespostaDeLinhaDoTempo },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      404: ERRO('Chamado fora do escopo (chamado_nao_encontrado).'),
    },
  },
  {
    metodo: 'get',
    caminho: '/api/v1/auditoria',
    resumo:
      'O histórico de um registro (D1): hotel, local, ativo, chamado, OS ou fornecedor (I3), com quem gravou, quando, a ação e o antes e o depois de cada campo, da mais antiga para a mais nova. Quem não vê o registro recebe 404. Das linhas do registro, a RLS mostra só as que quem pede lê: o proprietário lê as do local, dos ativos, dos chamados e das OS que ele vê, e não as do hotel nem as das paradas. Os ids das mudanças vêm com o nome em referencias, quando quem pede os lê.',
    exigeTenant: true,
    consulta: ConsultaDoHistorico,
    respostas: {
      200: { descricao: 'Histórico do registro', esquema: RespostaDoHistorico },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      404: ERRO('Registro fora do escopo (registro_nao_encontrado, com a entidade).'),
      422: ERRO('Entidade ou id fora do formato (entrada_invalida).'),
    },
  },
  {
    metodo: 'get',
    caminho: '/api/v1/auditoria/geral',
    resumo:
      'A auditoria geral (1c): toda a auditoria que a gestão enxerga, da mais nova para a mais antiga, por período (até 92 dias), hotel, tipo de registro, ação e pessoa, em páginas de 50 linhas por cursor estável (em, id). Com exportacao=1, a página tem 1.000 linhas, e o navegador junta o CSV até 50 mil. Só o Admin do grupo, o Gestor CSC e o Gerente do hotel, este só nos hotéis dele; as linhas sem hotel seguem a RLS (ADR-021). Os ids das mudanças vêm com o nome em referencias, quando quem pede os lê.',
    exigeTenant: true,
    consulta: ConsultaDaAuditoriaGeral,
    respostas: {
      200: { descricao: 'Página da auditoria', esquema: RespostaDaAuditoriaGeral },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Quem pede não é da gestão (auditoria_sem_permissao).'),
      422: ERRO(
        'Período acima de 92 dias ou com o fim antes do início (auditoria_periodo_invalido, com maximoDias), cursor inválido (auditoria_cursor_invalido) ou filtro fora do formato (entrada_invalida).',
      ),
    },
  },
  {
    metodo: 'get',
    caminho: '/api/v1/os',
    resumo:
      'Lista as OS no escopo de quem pede (C7), com os mesmos filtros da lista de chamados; a prioridade é a do chamado, e o período, pela data de criação da OS. Da mais nova para a mais antiga, 50 por página; a seguinte com depoisDe = proximo.',
    exigeTenant: true,
    consulta: ConsultaDaLista,
    respostas: {
      200: { descricao: 'Uma página de OS', esquema: RespostaDeListaDeOs },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      422: ERRO('periodo_invalido (de igual ou depois de ate) ou entrada_invalida.'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/chamados/{id}/triagem',
    resumo:
      'Classifica o chamado aberto (vai para em triagem), com prioridade opcional. Admin do grupo, Gestor CSC ou Gerente do hotel. Leva a versão vista (ADR-029).',
    exigeTenant: true,
    corpo: PedidoDeTriagem,
    respostas: {
      200: {
        descricao: 'Chamado em triagem, com a versão nova',
        esquema: RespostaDeChamadoAlterado,
      },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Fora dos papéis da triagem (acao_fora_do_papel).'),
      404: ERRO('Chamado fora do escopo (chamado_nao_encontrado).'),
      409: ERRO('conflito_de_versao (com versaoAtual) ou transicao_invalida.'),
      422: ERRO('prioridade_indisponivel, sem_situacao_para_estado ou entrada_invalida.'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/chamados/{id}/prioridade',
    resumo:
      'Ajusta a prioridade do chamado até a execução. Admin do grupo, Gestor CSC ou Gerente do hotel. Leva a versão vista.',
    exigeTenant: true,
    corpo: PedidoDeAjusteDePrioridade,
    respostas: {
      200: {
        descricao: 'Prioridade ajustada, com a versão nova',
        esquema: RespostaDeChamadoAlterado,
      },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Fora dos papéis da triagem (triagem_fora_do_papel).'),
      404: ERRO('Chamado fora do escopo (chamado_nao_encontrado).'),
      409: ERRO('conflito_de_versao (com versaoAtual) ou transicao_invalida.'),
      422: ERRO('prioridade_indisponivel ou entrada_invalida.'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/chamados/{id}/cancelamento',
    resumo:
      'Cancela o chamado antes da OS (aberto ou em triagem), com motivo. Admin do grupo, Gestor CSC ou Gerente do hotel. Leva a versão vista.',
    exigeTenant: true,
    corpo: PedidoDeCancelamento,
    respostas: {
      200: {
        descricao: 'Chamado cancelado, com a versão nova',
        esquema: RespostaDeChamadoAlterado,
      },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Fora dos papéis da triagem (acao_fora_do_papel).'),
      404: ERRO('Chamado fora do escopo (chamado_nao_encontrado).'),
      409: ERRO('conflito_de_versao (com versaoAtual) ou transicao_invalida.'),
      422: ERRO('motivo_obrigatorio, sem_situacao_para_estado ou entrada_invalida.'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/chamados/{id}/os',
    resumo:
      'Gera a OS do chamado aberto ou em triagem, atribuída a um Técnico do hotel ou a uma equipe do hotel; o chamado vai para em execução. No máximo uma OS não cancelada por chamado. Com executadoPor, quem executa (I4): a equipe interna (o padrão) ou um fornecedor ativo do grupo, com fornecedorId. Leva a versão vista do chamado e grava o evento os.atribuida.',
    exigeTenant: true,
    corpo: PedidoDeGeracaoDeOs,
    respostas: {
      201: { descricao: 'OS gerada, com a versão nova do chamado', esquema: RespostaDeOsGravada },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Fora dos papéis da triagem (acao_fora_do_papel).'),
      404: ERRO('chamado_nao_encontrado, equipe_nao_encontrada ou fornecedor_nao_encontrado.'),
      409: ERRO('conflito_de_versao (com versaoAtual), os_em_andamento ou transicao_invalida.'),
      422: ERRO(
        'responsavel_sem_papel_tecnico, equipe_indisponivel, os_fornecedor_obrigatorio, os_fornecedor_indevido, os_fornecedor_desativado, sem_situacao_para_estado ou entrada_invalida.',
      ),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/os/{id}/executor',
    resumo:
      'Corrige quem executa a OS (I4), até a conclusão: a equipe interna ou um fornecedor ativo do grupo, com fornecedorId. Admin do grupo, Gestor CSC ou Gerente do hotel. Leva a versão vista da OS e grava o evento os.executor_definido.',
    exigeTenant: true,
    corpo: PedidoDeExecutorDaOs,
    respostas: {
      200: {
        descricao: 'Quem executa corrigido, com a versão nova da OS',
        esquema: RespostaDeOsGravada,
      },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Fora dos papéis da triagem (triagem_fora_do_papel).'),
      404: ERRO('os_nao_encontrada ou fornecedor_nao_encontrado.'),
      409: ERRO(
        'conflito_de_versao (com versaoAtual) ou transicao_invalida (OS concluída ou cancelada).',
      ),
      422: ERRO(
        'os_fornecedor_obrigatorio, os_fornecedor_indevido, os_fornecedor_desativado ou entrada_invalida.',
      ),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/chamados/{id}/impacto-hospede',
    resumo:
      'Corrige se o chamado afeta hóspede (I4), até o aceite; null é não sei. Admin do grupo, Gestor CSC ou Gerente do hotel. Leva a versão vista do chamado e grava o evento chamado.impacto_informado.',
    exigeTenant: true,
    corpo: PedidoDeImpactoNoHospede,
    respostas: {
      200: {
        descricao: 'Impacto corrigido, com a versão nova',
        esquema: RespostaDeChamadoAlterado,
      },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Fora dos papéis da triagem (triagem_fora_do_papel).'),
      404: ERRO('Chamado fora do escopo (chamado_nao_encontrado).'),
      409: ERRO(
        'conflito_de_versao (com versaoAtual) ou transicao_invalida (chamado concluído ou cancelado).',
      ),
      422: ERRO('entrada_invalida.'),
    },
  },
  {
    metodo: 'get',
    caminho: '/api/v1/chamados/{id}/uh-indisponivel',
    resumo:
      'Os períodos em que a UH do chamado ficou indisponível (I4), do mais novo para o mais antigo, com o tempo de cada um. Lê quem lê o chamado; o proprietário recebe só a UH, o estado e as datas (sem chamadoId, abertaPor e encerradaPor).',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Períodos da UH do chamado', esquema: RespostaDeUhIndisponivel },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      404: ERRO('Chamado fora do escopo (chamado_nao_encontrado).'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/chamados/{id}/uh-indisponivel',
    resumo:
      'Marca a UH do chamado como indisponível depois da abertura (I4), sem início informado, agora. Admin do grupo, Gestor CSC ou Gerente do hotel, com o chamado em curso, até o aceite. Um período aberto por chamado; só chamado de UH.',
    exigeTenant: true,
    corpo: PedidoDeUhIndisponivel,
    respostas: {
      201: { descricao: 'UH marcada como indisponível', esquema: RespostaDeUhMarcada },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Fora dos papéis que marcam (uh_indisponivel_fora_do_papel).'),
      404: ERRO('chamado_nao_encontrado ou local_nao_encontrado.'),
      409: ERRO(
        'uh_indisponivel_ja_aberta ou transicao_invalida (chamado concluído ou cancelado).',
      ),
      422: ERRO(
        'uh_indisponivel_fora_de_uh, uh_indisponivel_periodo_invalido ou entrada_invalida.',
      ),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/uh-indisponivel/{id}/liberacao',
    resumo:
      'Libera a UH (I4): encerra o período aberto, sem fim informado, agora. Admin do grupo, Gestor CSC ou Gerente do hotel, a qualquer momento; quem conclui a OS libera na conclusão, pela operação offline os.concluir (uhLiberada).',
    exigeTenant: true,
    corpo: PedidoDeLiberacaoDeUh,
    respostas: {
      200: { descricao: 'UH liberada', esquema: RespostaDeUhLiberada },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Fora dos papéis que liberam (uh_indisponivel_fora_do_papel).'),
      404: ERRO('Período fora do escopo (uh_indisponivel_nao_encontrada).'),
      409: ERRO('O período já foi encerrado (uh_indisponivel_nao_aberta).'),
      422: ERRO(
        'Fim antes do início ou no futuro (uh_indisponivel_periodo_invalido) ou entrada_invalida.',
      ),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/os/{id}/reatribuicao',
    resumo:
      'Passa a OS para outro Técnico do hotel ou outra equipe do hotel; ela volta a atribuída. Admin do grupo, Gestor CSC ou Gerente do hotel. Leva a versão vista da OS e grava o evento os.atribuida.',
    exigeTenant: true,
    corpo: PedidoDeAtribuicaoDeOs,
    respostas: {
      200: { descricao: 'OS reatribuída, com a versão nova', esquema: RespostaDeOsGravada },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Fora dos papéis da triagem (acao_fora_do_papel).'),
      404: ERRO('os_nao_encontrada ou equipe_nao_encontrada.'),
      409: ERRO('conflito_de_versao (com versaoAtual) ou transicao_invalida.'),
      422: ERRO(
        'responsavel_sem_papel_tecnico, equipe_indisponivel, sem_situacao_para_estado ou entrada_invalida.',
      ),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/os/{id}/cancelamento',
    resumo:
      'Cancela a OS, com motivo; o chamado volta para em triagem, para ganhar outra OS. Admin do grupo, Gestor CSC ou Gerente do hotel. Leva a versão vista da OS.',
    exigeTenant: true,
    corpo: PedidoDeCancelamento,
    respostas: {
      200: {
        descricao: 'OS cancelada, com a versão nova do chamado',
        esquema: RespostaDeOsGravada,
      },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Fora dos papéis da triagem (acao_fora_do_papel).'),
      404: ERRO('OS fora do escopo (os_nao_encontrada).'),
      409: ERRO('conflito_de_versao (com versaoAtual) ou transicao_invalida.'),
      422: ERRO('motivo_obrigatorio, sem_situacao_para_estado ou entrada_invalida.'),
    },
  },
  {
    metodo: 'get',
    caminho: '/api/v1/os/{id}/codigos',
    resumo:
      'Os códigos que servem para a OS, por tipo: ativos, da categoria do ativo do chamado primeiro, depois os de todas (I6). A lista do aceite; os nomes vêm de /api/v1/codigos-de-manutencao.',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Ids por tipo', esquema: RespostaDeCodigosDaOs },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      404: ERRO('OS fora do escopo (os_nao_encontrada).'),
    },
  },
  {
    metodo: 'get',
    caminho: '/api/v1/os/{id}/checklist',
    resumo:
      'O checklist da OS (PV1, ADR-040): a cópia do modelo aplicado, com a versão, e as respostas por item, com a hora no aparelho e quem respondeu. null: a OS não tem checklist. Lê quem lê a OS.',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Checklist da OS', esquema: RespostaDeChecklistDaOs },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      404: ERRO('OS fora do escopo (os_nao_encontrada).'),
    },
  },
  {
    metodo: 'put',
    caminho: '/api/v1/os/{id}/checklist',
    resumo:
      'Aplica o modelo ativo na OS atribuída, em execução ou pausada, com a cópia dos itens e da versão (ADR-026); troca o modelo enquanto o checklist não tem resposta. Quem tria: o Admin do grupo, o Gestor CSC e o Gerente do hotel. Não mexe na versão da OS. As respostas vêm do Técnico, pela operação offline os.responder_checklist.',
    exigeTenant: true,
    corpo: PedidoDeChecklistNaOs,
    respostas: {
      200: { descricao: 'Checklist aplicado', esquema: RespostaDeChecklistAplicado },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Fora dos papéis da triagem (triagem_fora_do_papel).'),
      404: ERRO(
        'OS fora do escopo (os_nao_encontrada) ou modelo não encontrado (checklist_nao_encontrado).',
      ),
      409: ERRO('transicao_invalida ou checklist_ja_respondido.'),
      422: ERRO('checklist_modelo_inativo ou entrada_invalida.'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/os/{id}/aceite',
    resumo:
      'Aceita a OS concluída; o chamado fica concluído (C6). Quem abriu o chamado, se ainda escreve no hotel, ou o Gerente do hotel; quem abriu e executa a OS (responsável, ou membro da equipe responsável) não decide, só outro Gerente do hotel; sem outro Gerente ativo no hotel, o Gestor CSC ou o Admin do grupo. Com custoInformado, o custo em reais (I4), opcional, sem aprovação nem alçada. Com codigos (I6), falha, causa e solução substituem os sugeridos pelo técnico; com a política os.codigos_obrigatorios ligada no hotel, o aceite exige os três. Com assinaturaCaminho (I8), o PNG enviado pela URL da assinatura, registrado como anexo da OS no mesmo aceite; com a política os.assinatura_no_aceite ligada no hotel, o aceite exige a assinatura. É evidência do aceite, e não assinatura digital ICP-Brasil. Leva a versão vista da OS.',
    exigeTenant: true,
    corpo: PedidoDeAceiteDeOs,
    respostas: {
      200: { descricao: 'OS aceita, com a versão nova do chamado', esquema: RespostaDeOsGravada },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO(
        'Nem quem abriu o chamado nem o Gerente do hotel (nem o Gestor CSC ou o Admin, quando não há outro Gerente), ou quem abriu também executa a OS (acao_fora_do_papel).',
      ),
      404: ERRO('OS fora do escopo (os_nao_encontrada).'),
      409: ERRO('conflito_de_versao (com versaoAtual) ou transicao_invalida.'),
      422: ERRO(
        'os_custo_invalido, codigos_obrigatorios_no_aceite (faltam), codigo_nao_encontrado, codigo_de_outro_tipo, codigo_inativo ou codigo_de_outra_categoria (tipo), assinatura_obrigatoria_no_aceite, assinatura_invalida, sem_situacao_para_estado ou entrada_invalida.',
      ),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/os/{id}/assinatura/url-de-upload',
    resumo:
      'URL assinada para enviar a assinatura do aceite (I8): um PNG novo na pasta da OS, desenhado no web. Só para quem pode aceitar a OS concluída agora (as mesmas regras do aceite). O caminho devolvido vai no aceite (assinaturaCaminho).',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'URL de upload (PUT do PNG)', esquema: RespostaDeUrlDeUpload },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO(
        'Sem escrita no hotel (anexo_sem_escrita_no_hotel), ou quem pede não aceita a OS (acao_fora_do_papel).',
      ),
      404: ERRO('OS fora do escopo (registro_nao_encontrado ou os_nao_encontrada).'),
      409: ERRO('A OS não está concluída (transicao_invalida).'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/os/{id}/reabertura',
    resumo:
      'Reabre a OS concluída, com motivo: a mesma OS volta para em execução, com o mesmo responsável, e o chamado também (C6). Quem abriu o chamado, se ainda escreve no hotel, ou o Gerente do hotel; quem abriu e executa a OS não decide, só outro Gerente do hotel; sem outro Gerente ativo no hotel, o Gestor CSC ou o Admin do grupo. O motivo fica na OS (o último, motivoReabertura) e na auditoria. Com paradoDesde, o equipamento está parado: abre uma parada nova do ativo no mesmo chamado (a encerrada não reabre); se o ativo já está parado, fica a que existe (paradaId nulo). Leva a versão vista da OS.',
    exigeTenant: true,
    corpo: PedidoDeReaberturaDeOs,
    respostas: {
      200: {
        descricao: 'OS reaberta, com a versão nova do chamado e a parada nova, se houver',
        esquema: RespostaDeReaberturaDeOs,
      },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO(
        'Nem quem abriu o chamado nem o Gerente do hotel (nem o Gestor CSC ou o Admin, quando não há outro Gerente), ou quem abriu também executa a OS (acao_fora_do_papel).',
      ),
      404: ERRO('OS fora do escopo (os_nao_encontrada).'),
      409: ERRO('conflito_de_versao (com versaoAtual) ou transicao_invalida.'),
      422: ERRO(
        'motivo_obrigatorio, parada_sem_ativo, parada_invalida, sem_situacao_para_estado ou entrada_invalida.',
      ),
    },
  },
  {
    metodo: 'get',
    caminho: '/api/v1/os/do-dia',
    resumo:
      'A fila do dia do Técnico (C4): as OS atribuídas, em execução ou pausadas dele e das equipes de que é membro ativo, da mais antiga para a mais nova. O PWA guarda no aparelho e apaga ao sair (ADR-025).',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'OS do dia', esquema: RespostaDeOsDoDia },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
    },
  },
  // HubKeep Intelligence (módulo opcional): sem o módulo vigente no tenant, ou
  // sem papel que decide insight, toda rota devolve 404 inteligencia_indisponivel.
  {
    metodo: 'get',
    caminho: '/api/v1/inteligencia/resumo',
    resumo:
      'Os quatro indicadores do Intelligence, sobre os insights abertos que quem pede lê: abertos, em alta atenção ou crítico, sistêmicos e sem responsável. O menu mostra o item "HubKeep Intelligence" só quando esta rota responde 200. Lê quem decide insight (Admin do grupo, Gestor CSC e Gerente do hotel, no próprio escopo).',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Indicadores', esquema: RespostaDoResumoDoIntelligence },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      404: ERRO('Sem o módulo ou sem papel que decide (inteligencia_indisponivel).'),
    },
  },
  {
    metodo: 'get',
    caminho: '/api/v1/inteligencia/insights',
    resumo:
      'Os insights que quem pede lê (a RLS da app.insight: o Gerente, só os do próprio hotel; o insight de rede, só o Admin do grupo e o Gestor CSC que cobrem os hotéis dele), da última detecção mais recente para a mais antiga, até 500. Abertos por padrão; filtros por estado, tipo, faixa e hotel. Cada um com a substituição nos dois sentidos e se quem pede o decide, e os nomes de hotéis, bandeiras e pessoas.',
    exigeTenant: true,
    consulta: ConsultaDeInsights,
    respostas: {
      200: { descricao: 'Insights', esquema: RespostaDeInsights },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      404: ERRO('Sem o módulo ou sem papel que decide (inteligencia_indisponivel).'),
      422: ERRO('Filtro fora do formato (entrada_invalida).'),
    },
  },
  {
    metodo: 'get',
    caminho: '/api/v1/inteligencia/insights/{id}',
    resumo:
      'A página do insight: o registro, o detalhe e a evidência como o job gravou, as ações que o estado permite (vazias para quem não decide), os chamados da evidência que quem pede vê e a série de chamados por semana nas últimas 12 semanas.',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Insight', esquema: RespostaDoInsight },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      404: ERRO(
        'inteligencia_indisponivel, ou insight_nao_encontrado (fora do escopo ou inexistente).',
      ),
    },
  },
  {
    metodo: 'get',
    caminho: '/api/v1/inteligencia/ativos/{id}',
    resumo:
      'O detalhe do ativo no Intelligence: a atenção de cada dia gravado nos últimos 90 dias (o resultado original, sem recálculo), o último dia com o detalhe do score e as versões da fórmula e da política, e os insights de atenção do ativo. Só para quem decide o insight do hotel do ativo: a métrica nunca tem mais leitores que o insight.',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Ativo', esquema: RespostaDoAtivoNoIntelligence },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      404: ERRO(
        'inteligencia_indisponivel, ou ativo_nao_encontrado (fora do escopo de quem decide ou inexistente).',
      ),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/inteligencia/insights/{id}/decisao',
    resumo:
      'Uma pessoa decide o insight (ADR-033): revisar, aceitar, agir, monitorar, resolver ou descartar, conforme o estado. Resolver e descartar pedem nota; descartar pede o motivo. Quem toma a primeira ação vira o responsável. Grava com a trava de versão, auditoria e o evento insight.decidido.',
    exigeTenant: true,
    corpo: PedidoDeDecisaoDoInsight,
    respostas: {
      200: { descricao: 'Insight decidido', esquema: RespostaDaDecisaoDoInsight },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Quem pede lê, mas não decide neste escopo (insight_fora_do_escopo).'),
      404: ERRO('inteligencia_indisponivel ou insight_nao_encontrado.'),
      409: ERRO(
        'Outra pessoa decidiu antes (conflito_de_versao) ou a ação não vale no estado (transicao_invalida).',
      ),
      422: ERRO('motivo_obrigatorio, motivo_de_descarte_invalido ou entrada_invalida.'),
    },
  },
];

const referencia = (id: string) => ({ $ref: `#/components/schemas/${id}` });

/** Id do schema registrado com .meta({ id }). Todo schema da lista tem um. */
function idDe(esquema: Esquema): string {
  const id = z.globalRegistry.get(esquema)?.id;
  if (!id) throw new Error('Schema do contrato sem .meta({ id }).');
  return id;
}

/** Um parâmetro de query por campo do objeto, com o schema do campo. */
function parametrosDaConsulta(consulta: z.ZodObject) {
  return Object.entries(consulta.shape).map(([nome, campo]) => {
    const esquema: Record<string, unknown> = {
      ...z.toJSONSchema(campo as Esquema, { io: 'input' }),
    };
    delete esquema['$schema'];
    return {
      name: nome,
      in: 'query',
      required: !(campo as Esquema).safeParse(undefined).success,
      schema: esquema,
    };
  });
}

export function gerarOpenApi(): Record<string, unknown> {
  // Os schemas vão para components; entrada e saída usam a forma de entrada
  // do Zod (o que o cliente manda), que aqui coincide com a de saída.
  const gerados = z.toJSONSchema(z.globalRegistry, {
    io: 'input',
    uri: (id) => `#/components/schemas/${id}`,
  }).schemas;
  // Em components, o nome já identifica o schema: sai o $schema e o $id do Zod.
  const schemas: Record<string, Record<string, unknown>> = {};
  for (const [id, gerado] of Object.entries(gerados)) {
    const copia: Record<string, unknown> = { ...gerado };
    delete copia['$schema'];
    delete copia['$id'];
    schemas[id] = copia;
  }

  const paths: Record<string, Record<string, unknown>> = {};
  for (const rota of ROTAS) {
    const respostas: Record<string, unknown> = {};
    for (const [status, r] of Object.entries(rota.respostas)) {
      respostas[status] = {
        description: r.descricao,
        ...(r.esquema && {
          content: { 'application/json': { schema: referencia(idDe(r.esquema)) } },
        }),
      };
    }
    (paths[rota.caminho] ??= {})[rota.metodo] = {
      summary: rota.resumo,
      ...(rota.autenticacao === 'agente' && { security: [{ agente: [] }] }),
      ...((rota.exigeTenant || rota.busca || rota.consulta) && {
        parameters: [
          ...(rota.exigeTenant ? [{ $ref: '#/components/parameters/Tenant' }] : []),
          ...(rota.busca ? [{ $ref: '#/components/parameters/Busca' }] : []),
          ...(rota.consulta ? parametrosDaConsulta(rota.consulta) : []),
        ],
      }),
      ...(rota.corpo && {
        requestBody: {
          required: true,
          content: { 'application/json': { schema: referencia(idDe(rota.corpo)) } },
        },
      }),
      responses: respostas,
    };
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'HubKeep API',
      version: 'v1',
      description:
        'Erros sempre no formato ErroApi: código e parâmetros, sem frase (ADR-022). ' +
        'Toda resposta traz x-request-id.',
    },
    security: [{ bearer: [] }, { cookie: [] }],
    paths,
    components: {
      schemas,
      parameters: {
        Tenant: {
          name: 'x-hubkeep-tenant',
          in: 'header',
          required: false,
          description: 'Tenant ativo (alternativa ao cookie hk_tenant).',
          schema: { type: 'string', format: 'uuid' },
        },
        Busca: {
          name: 'busca',
          in: 'query',
          required: false,
          description:
            'Trecho a achar, sem diferença de acento nem de maiúsculas. Vazio: a lista inteira. ' +
            'Com menos de 3 caracteres: 422 busca_curta.',
          schema: { type: 'string' },
        },
      },
      securitySchemes: {
        bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        cookie: { type: 'apiKey', in: 'cookie', name: 'sb-<ref>-auth-token' },
        agente: {
          type: 'apiKey',
          in: 'header',
          name: 'Authorization',
          description: 'Agent hk_<tenant_id>_<segredo> (credencial do agente conector).',
        },
      },
    },
  };
}
