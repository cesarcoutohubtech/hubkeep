// A fiação dos casos de uso do hk_app às portas do banco, num lugar só. A raiz
// de composição (composicao.ts) chama com o relógio do sistema, e é o único
// código do web que importa este módulo (tests/relogio-do-roteiro-fora-do-web.test.ts).
// A montagem com o relógio do roteiro (apps/web/test/demonstracao, só o gerador
// do histórico e os testes) chama com o relógio dela, e assim roda a mesma
// fiação do web, sem uma cópia que se desencontre com o tempo.
//
// Fica fora o que depende do auth-admin (convites e anexos), do pool do worker
// ou da ingestão e do módulo do Intelligence: isso continua na composição.
import {
  type CasosDeUsoDeAtivos,
  type CasosDeUsoDeAuditoriaGeral,
  type CasosDeUsoDeAvisosDeSla,
  type CasosDeUsoDaSituacaoPorHotel,
  type CasosDeUsoDeIndicadores,
  type CasosDeUsoDeComunicacao,
  type CasosDeUsoDeBandeiras,
  type CasosDeUsoDeCategorias,
  type CasosDeUsoDeChamados,
  type CasosDeUsoDeChecklists,
  type CasosDeUsoDeModelosDeAtivo,
  type CasosDeUsoDeSugestoesDePlano,
  type CasosDeUsoDeCadastrosDeAtivos,
  type CasosDeUsoDeImportacaoDeAtivos,
  type CasosDeUsoDeQrReservados,
  type CasosDeUsoDoPacoteDaBandeira,
  type CasosDeUsoDeCodigos,
  type CasosDeUsoDeConfiguracao,
  type CasosDeUsoDeConsultas,
  type CasosDeUsoDeEquipes,
  type CasosDeUsoDeExecucao,
  type CasosDeUsoDeFeriados,
  type CasosDeUsoDeFornecedores,
  type CasosDeUsoDeHistorico,
  type CasosDeUsoDeHoteis,
  type CasosDeUsoDeImplantacao,
  type CasosDeUsoDeLocais,
  type CasosDeUsoDeMembros,
  type CasosDeUsoDePapeis,
  type CasosDeUsoDeParadas,
  type CasosDeUsoDePlanosPreventivos,
  type CasosDeUsoDePreferencias,
  type CasosDeUsoDeProprietarios,
  type CasosDeUsoDeSincronizacao,
  type CasosDeUsoDeSituacoes,
  type CasosDeUsoDeTriagem,
  type CasosDeUsoDeUhIndisponivel,
  type FeriadosOficiais,
  type Relogio,
  criarCasosDeUsoDeAtivos,
  criarCasosDeUsoDeAuditoriaGeral,
  criarCasosDeUsoDeBandeiras,
  criarCasosDeUsoDeCategorias,
  criarCasosDeUsoDeAvisosDeSla,
  criarCasosDeUsoDaSituacaoPorHotel,
  criarCasosDeUsoDeIndicadores,
  criarCasosDeUsoDeComunicacao,
  criarCasosDeUsoDeChamados,
  criarCasosDeUsoDeChecklists,
  criarCasosDeUsoDeModelosDeAtivo,
  criarCasosDeUsoDeSugestoesDePlano,
  criarCasosDeUsoDeCadastrosDeAtivos,
  criarCasosDeUsoDeImportacaoDeAtivos,
  criarCasosDeUsoDeQrReservados,
  criarCasosDeUsoDoPacoteDaBandeira,
  criarCasosDeUsoDeCodigos,
  criarCasosDeUsoDeConfiguracao,
  criarCasosDeUsoDeConsultas,
  criarCasosDeUsoDeEquipes,
  criarCasosDeUsoDeExecucao,
  criarCasosDeUsoDeFeriados,
  criarCasosDeUsoDeFornecedores,
  criarCasosDeUsoDeHistorico,
  criarCasosDeUsoDeHoteis,
  criarCasosDeUsoDeImplantacao,
  criarCasosDeUsoDeLocais,
  criarCasosDeUsoDeMembros,
  criarCasosDeUsoDePapeis,
  criarCasosDeUsoDeParadas,
  criarCasosDeUsoDePlanosPreventivos,
  criarCasosDeUsoDePreferencias,
  criarCasosDeUsoDeProprietarios,
  criarCasosDeUsoDeSincronizacao,
  criarCasosDeUsoDeSituacoes,
  criarCasosDeUsoDeTriagem,
  criarCasosDeUsoDeUhIndisponivel,
  criarPoliticasDoTenant,
} from '@hubkeep/aplicacao';
import {
  type AcessoBanco,
  criarPortaAtivos,
  criarPortaAuditoriaGeral,
  criarPortaAvisosDeSla,
  criarPortaIndicadores,
  criarPortaSituacaoPorHotel,
  criarPortaComunicacao,
  criarPortaBandeiras,
  criarPortaCategorias,
  criarPortaChamados,
  criarPortaChecklists,
  criarPortaModelosDeAtivo,
  criarPortaSugestoesDePlano,
  criarPortaCadastrosDeAtivos,
  criarPortaImportacaoDeAtivos,
  criarPortaQrReservados,
  criarPortaPacoteDaBandeira,
  criarPortaCodigos,
  criarPortaConfiguracao,
  criarPortaConsultasDaCorretiva,
  criarPortaEquipes,
  criarPortaExecucao,
  criarPortaFeriadosDoHotel,
  criarPortaFornecedores,
  criarPortaHistorico,
  criarPortaHoteisDoStaging,
  criarPortaImplantacao,
  criarPortaLocais,
  criarPortaMembros,
  criarPortaModulos,
  criarPortaOperacoesOffline,
  criarPortaParadas,
  criarPortaPlanosPreventivos,
  criarPortaPreferencias,
  criarPortaPrioridades,
  criarPortaProprietarios,
  criarPortaSituacoes,
  criarPortaTriagem,
  criarPortaUhIndisponivel,
  criarPortasDeAplicacao,
} from '@hubkeep/db';
import type { RegistrosDePoliticas } from '@hubkeep/dominio';

export interface DependenciasDasFabricas {
  /** O acesso do hk_app. */
  banco: AcessoBanco;
  relogio: Relogio;
  feriadosOficiais: FeriadosOficiais;
  registrosDePoliticas: RegistrosDePoliticas;
}

export interface FabricasDeCasosDeUso {
  papeis(): CasosDeUsoDePapeis;
  equipes(): CasosDeUsoDeEquipes;
  feriados(): CasosDeUsoDeFeriados;
  hoteis(): CasosDeUsoDeHoteis;
  bandeiras(): CasosDeUsoDeBandeiras;
  fornecedores(): CasosDeUsoDeFornecedores;
  proprietarios(): CasosDeUsoDeProprietarios;
  membros(): CasosDeUsoDeMembros;
  configuracao(): CasosDeUsoDeConfiguracao;
  implantacao(): CasosDeUsoDeImplantacao;
  locais(): CasosDeUsoDeLocais;
  categorias(): CasosDeUsoDeCategorias;
  codigos(): CasosDeUsoDeCodigos;
  checklists(): CasosDeUsoDeChecklists;
  modelosDeAtivo(): CasosDeUsoDeModelosDeAtivo;
  planosPreventivos(): CasosDeUsoDePlanosPreventivos;
  sugestoesDePlano(): CasosDeUsoDeSugestoesDePlano;
  cadastrosDeAtivos(): CasosDeUsoDeCadastrosDeAtivos;
  importacaoDeAtivos(): CasosDeUsoDeImportacaoDeAtivos;
  qrReservados(): CasosDeUsoDeQrReservados;
  pacoteDaBandeira(): CasosDeUsoDoPacoteDaBandeira;
  situacoes(): CasosDeUsoDeSituacoes;
  chamados(): CasosDeUsoDeChamados;
  triagem(): CasosDeUsoDeTriagem;
  execucao(): CasosDeUsoDeExecucao;
  consultas(): CasosDeUsoDeConsultas;
  historico(): CasosDeUsoDeHistorico;
  auditoriaGeral(): CasosDeUsoDeAuditoriaGeral;
  avisosDeSla(): CasosDeUsoDeAvisosDeSla;
  indicadores(): CasosDeUsoDeIndicadores;
  situacaoPorHotel(): CasosDeUsoDaSituacaoPorHotel;
  comunicacao(): CasosDeUsoDeComunicacao;
  paradas(): CasosDeUsoDeParadas;
  uhIndisponivel(): CasosDeUsoDeUhIndisponivel;
  ativos(): CasosDeUsoDeAtivos;
  preferencias(): CasosDeUsoDePreferencias;
  sincronizacao(): CasosDeUsoDeSincronizacao;
}

/** Cria na primeira chamada e devolve o mesmo objeto nas seguintes. */
function uma<T>(criar: () => T): () => T {
  let atual: { valor: T } | undefined;
  return () => (atual ??= { valor: criar() }).valor;
}

export function criarFabricas(d: DependenciasDasFabricas): FabricasDeCasosDeUso {
  const { banco, relogio, feriadosOficiais } = d;
  const atribuicoes = criarPortasDeAplicacao(banco).atribuicoes;

  const f: FabricasDeCasosDeUso = {
    papeis: uma(() => criarCasosDeUsoDePapeis({ ...criarPortasDeAplicacao(banco), relogio })),
    equipes: uma(() =>
      criarCasosDeUsoDeEquipes({ equipes: criarPortaEquipes(banco), atribuicoes, relogio }),
    ),
    feriados: uma(() =>
      criarCasosDeUsoDeFeriados({
        feriados: criarPortaFeriadosDoHotel(banco),
        atribuicoes,
        relogio,
      }),
    ),
    hoteis: uma(() =>
      criarCasosDeUsoDeHoteis({ hoteis: criarPortaHoteisDoStaging(banco), atribuicoes, relogio }),
    ),
    bandeiras: uma(() =>
      criarCasosDeUsoDeBandeiras({ bandeiras: criarPortaBandeiras(banco), atribuicoes, relogio }),
    ),
    fornecedores: uma(() =>
      criarCasosDeUsoDeFornecedores({
        fornecedores: criarPortaFornecedores(banco),
        atribuicoes,
        relogio,
      }),
    ),
    proprietarios: uma(() =>
      criarCasosDeUsoDeProprietarios({
        proprietarios: criarPortaProprietarios(banco),
        atribuicoes,
        relogio,
      }),
    ),
    membros: uma(() =>
      criarCasosDeUsoDeMembros({ membros: criarPortaMembros(banco), atribuicoes, relogio }),
    ),
    configuracao: uma(() =>
      criarCasosDeUsoDeConfiguracao({
        configuracao: criarPortaConfiguracao(banco),
        atribuicoes,
        relogio,
        politicas: criarPoliticasDoTenant({
          registros: d.registrosDePoliticas,
          modulos: criarPortaModulos(banco),
          relogio,
        }),
      }),
    ),
    implantacao: uma(() =>
      criarCasosDeUsoDeImplantacao({
        implantacao: criarPortaImplantacao(banco),
        membros: criarPortaMembros(banco),
        atribuicoes,
        relogio,
      }),
    ),
    locais: uma(() =>
      criarCasosDeUsoDeLocais({ locais: criarPortaLocais(banco), atribuicoes, relogio }),
    ),
    categorias: uma(() =>
      criarCasosDeUsoDeCategorias({
        categorias: criarPortaCategorias(banco),
        atribuicoes,
        relogio,
      }),
    ),
    codigos: uma(() =>
      criarCasosDeUsoDeCodigos({
        codigos: criarPortaCodigos(banco),
        categorias: criarPortaCategorias(banco),
        triagem: criarPortaTriagem(banco),
        atribuicoes,
        relogio,
      }),
    ),
    checklists: uma(() =>
      criarCasosDeUsoDeChecklists({
        checklists: criarPortaChecklists(banco),
        triagem: criarPortaTriagem(banco),
        execucao: criarPortaExecucao(banco),
        atribuicoes,
        relogio,
      }),
    ),
    modelosDeAtivo: uma(() =>
      criarCasosDeUsoDeModelosDeAtivo({
        modelos: criarPortaModelosDeAtivo(banco),
        atribuicoes,
        relogio,
      }),
    ),
    planosPreventivos: uma(() =>
      criarCasosDeUsoDePlanosPreventivos({
        planos: criarPortaPlanosPreventivos(banco),
        triagem: criarPortaTriagem(banco),
        atribuicoes,
        relogio,
      }),
    ),
    cadastrosDeAtivos: uma(() =>
      criarCasosDeUsoDeCadastrosDeAtivos({
        cadastros: criarPortaCadastrosDeAtivos(banco),
        atribuicoes,
        relogio,
      }),
    ),
    importacaoDeAtivos: uma(() =>
      criarCasosDeUsoDeImportacaoDeAtivos({
        importacao: criarPortaImportacaoDeAtivos(banco),
        atribuicoes,
        relogio,
      }),
    ),
    qrReservados: uma(() =>
      criarCasosDeUsoDeQrReservados({
        qr: criarPortaQrReservados(banco),
        atribuicoes,
        relogio,
      }),
    ),
    pacoteDaBandeira: uma(() =>
      criarCasosDeUsoDoPacoteDaBandeira({
        pacote: criarPortaPacoteDaBandeira(banco),
        atribuicoes,
        relogio,
      }),
    ),
    sugestoesDePlano: uma(() => {
      const planos = criarPortaPlanosPreventivos(banco);
      const casosDosPlanos = criarCasosDeUsoDePlanosPreventivos({
        planos,
        triagem: criarPortaTriagem(banco),
        atribuicoes,
        relogio,
      });
      return criarCasosDeUsoDeSugestoesDePlano({
        sugestoes: criarPortaSugestoesDePlano(banco),
        planos,
        criarPlano: casosDosPlanos.criar,
        atribuicoes,
        relogio,
      });
    }),
    situacoes: uma(() =>
      criarCasosDeUsoDeSituacoes({
        situacoes: criarPortaSituacoes(banco),
        prioridades: criarPortaPrioridades(banco),
        atribuicoes,
        relogio,
      }),
    ),
    chamados: uma(() =>
      criarCasosDeUsoDeChamados({
        chamados: criarPortaChamados(banco),
        situacoes: criarPortaSituacoes(banco),
        prioridades: criarPortaPrioridades(banco),
        atribuicoes,
        relogio,
        feriadosOficiais,
      }),
    ),
    triagem: uma(() =>
      criarCasosDeUsoDeTriagem({
        triagem: criarPortaTriagem(banco),
        situacoes: criarPortaSituacoes(banco),
        prioridades: criarPortaPrioridades(banco),
        codigos: criarPortaCodigos(banco),
        categorias: criarPortaCategorias(banco),
        atribuicoes,
        relogio,
        feriadosOficiais,
      }),
    ),
    execucao: uma(() =>
      criarCasosDeUsoDeExecucao({
        execucao: criarPortaExecucao(banco),
        triagem: criarPortaTriagem(banco),
        situacoes: criarPortaSituacoes(banco),
        atribuicoes,
        relogio,
        paradas: criarPortaParadas(banco),
        uh: criarPortaUhIndisponivel(banco),
        codigos: criarPortaCodigos(banco),
        checklists: criarPortaChecklists(banco),
        prioridades: criarPortaPrioridades(banco),
        feriadosOficiais,
      }),
    ),
    consultas: uma(() =>
      criarCasosDeUsoDeConsultas({ consultas: criarPortaConsultasDaCorretiva(banco) }),
    ),
    historico: uma(() =>
      criarCasosDeUsoDeHistorico({
        historico: criarPortaHistorico(banco),
        triagem: criarPortaTriagem(banco),
        atribuicoes,
        relogio,
      }),
    ),
    auditoriaGeral: uma(() =>
      criarCasosDeUsoDeAuditoriaGeral({
        auditoria: criarPortaAuditoriaGeral(banco),
        historico: criarPortaHistorico(banco),
        atribuicoes,
        relogio,
      }),
    ),
    avisosDeSla: uma(() =>
      criarCasosDeUsoDeAvisosDeSla({
        avisos: criarPortaAvisosDeSla(banco),
        atribuicoes,
        prioridades: criarPortaPrioridades(banco),
        relogio,
      }),
    ),
    indicadores: uma(() =>
      criarCasosDeUsoDeIndicadores({
        indicadores: criarPortaIndicadores(banco),
        atribuicoes,
        relogio,
      }),
    ),
    situacaoPorHotel: uma(() =>
      criarCasosDeUsoDaSituacaoPorHotel({
        situacao: criarPortaSituacaoPorHotel(banco),
        avisos: criarPortaAvisosDeSla(banco),
        indicadores: criarPortaIndicadores(banco),
        atribuicoes,
        prioridades: criarPortaPrioridades(banco),
        relogio,
      }),
    ),
    comunicacao: uma(() =>
      criarCasosDeUsoDeComunicacao({
        comunicacao: criarPortaComunicacao(banco),
        atribuicoes,
        relogio,
      }),
    ),
    paradas: uma(() =>
      criarCasosDeUsoDeParadas({
        paradas: criarPortaParadas(banco),
        ativos: criarPortaAtivos(banco),
        triagem: criarPortaTriagem(banco),
        atribuicoes,
        relogio,
      }),
    ),
    uhIndisponivel: uma(() =>
      criarCasosDeUsoDeUhIndisponivel({
        uh: criarPortaUhIndisponivel(banco),
        chamados: criarPortaChamados(banco),
        triagem: criarPortaTriagem(banco),
        atribuicoes,
        relogio,
      }),
    ),
    ativos: uma(() =>
      criarCasosDeUsoDeAtivos({ ativos: criarPortaAtivos(banco), atribuicoes, relogio }),
    ),
    preferencias: uma(() =>
      criarCasosDeUsoDePreferencias({ preferencias: criarPortaPreferencias(banco) }),
    ),
    sincronizacao: uma(() =>
      criarCasosDeUsoDeSincronizacao({
        operacoes: criarPortaOperacoesOffline(banco),
        ativos: f.ativos(),
        chamados: f.chamados(),
        execucao: f.execucao(),
        checklists: f.checklists(),
      }),
    ),
  };
  return f;
}
