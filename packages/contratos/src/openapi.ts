// OpenAPI 3.1 da API /api/v1, gerado dos schemas Zod (F0-07). A lista de rotas
// abaixo é a fonte: rota nova entra aqui junto com o handler, e o teste do
// pacote confere que cada schema de corpo e de resposta está no documento.
import { z } from 'zod';
import { PedidoDeConvite, RespostaDeConvite, RespostaDeHoteis, RespostaDeSessao } from './api';
import {
  PedidoDeUrlDeDownload,
  PedidoDeUrlDeUpload,
  RespostaDeUrlDeDownload,
  RespostaDeUrlDeUpload,
} from './anexos';
import {
  PedidoDeBandeira,
  PedidoDeBandeiraDoHotel,
  RespostaDeBandeiraAlterada,
  RespostaDeBandeiraCriada,
  RespostaDeBandeiraDoHotel,
  RespostaDeBandeiras,
} from './bandeiras';
import { PedidoDeCredencial, RespostaDeCredencial, RespostaDeRevogacao } from './credenciais';
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
  RespostaDeLocaisDoHotel,
  RespostaDeProprietarioAlterado,
  RespostaDeProprietarios,
  RespostaDeVinculoDeProprietario,
} from './proprietarios';
import { PedidoDeOperacaoOffline, RespostaDeOperacaoOffline } from './sincronizacao';
import { ErroApi } from './erro';

type Esquema = z.ZodType;

export interface Rota {
  metodo: 'get' | 'post' | 'put';
  caminho: string;
  resumo: string;
  /** Rota que precisa do tenant ativo (cabeçalho x-hubkeep-tenant ou cookie). */
  exigeTenant: boolean;
  /** Quem chama: usuário (padrão, Bearer ou cookie) ou o agente conector. */
  autenticacao?: 'usuario' | 'agente';
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
    caminho: '/api/v1/hoteis/{id}/locais',
    resumo: 'Locais (UHs e áreas comuns) do hotel, no escopo de quem pede.',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Locais do hotel', esquema: RespostaDeLocaisDoHotel },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      404: ERRO('Hotel fora do escopo (hotel_nao_encontrado).'),
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
    resumo: 'Fuso, país, subdivisão, moeda e idioma do hotel (nulo herda). Só o Admin do grupo.',
    exigeTenant: true,
    corpo: PedidoDeConfiguracaoDoHotel,
    respostas: {
      200: { descricao: 'Configuração depois da gravação', esquema: RespostaDeConfiguracao },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Só o Admin do grupo (configuracao_so_admin).'),
      404: ERRO('Hotel não encontrado (hotel_nao_encontrado).'),
      422: ERRO(
        'fuso_invalido, pais_invalido, subdivisao_invalida, moeda_invalida ou entrada_invalida.',
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
];

const referencia = (id: string) => ({ $ref: `#/components/schemas/${id}` });

/** Id do schema registrado com .meta({ id }). Todo schema da lista tem um. */
function idDe(esquema: Esquema): string {
  const id = z.globalRegistry.get(esquema)?.id;
  if (!id) throw new Error('Schema do contrato sem .meta({ id }).');
  return id;
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
      ...(rota.exigeTenant && { parameters: [{ $ref: '#/components/parameters/Tenant' }] }),
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
