// VITRINE DESCARTÁVEL: as três telas propostas para o Intelligence 1.0, com o
// pacote de interface e dados fictícios. O texto está escrito aqui só para a
// vitrine; nas telas reais, tudo sai do catálogo (regra 11).
import {
  AreaDeTexto,
  Botao,
  Campo,
  Estrutura,
  GrupoDeMenu,
  Indicador,
  ItemDeMenu,
  Marca,
  Nota,
  Painel,
  Selecao,
  Selo,
  type TomDeSelo,
  Tabela,
  comoBotao,
} from '@hubkeep/ui';
import {
  CRITICIDADE_MAXIMA,
  FAIXAS_PADRAO,
  PADRAO_ATENCAO,
} from '@hubkeep/inteligencia';
import {
  NOMES_DE_HOTEL,
  atencaoDoChiller,
  evidenciaDoSistemico,
  faixaDoValor,
  insights,
  motivosDaAtencao,
  semanasDoSistemico,
  serieDaAtencao,
} from './dados';
import type { EstadoDoInsight, InsightDaLista } from './dados';

const FAIXAS: Record<string, { nome: string; tom: TomDeSelo }> = {
  normal: { nome: 'Normal', tom: 'verde' },
  observar: { nome: 'Observar', tom: 'azul' },
  atencao: { nome: 'Atenção', tom: 'ambar' },
  alta_atencao: { nome: 'Alta atenção', tom: 'vermelho' },
  critico: { nome: 'Crítico', tom: 'vermelho' },
  dados_insuficientes: { nome: 'Dados insuficientes', tom: 'cinza' },
};
const ESTADOS: Record<EstadoDoInsight, { nome: string; tom: TomDeSelo }> = {
  novo: { nome: 'Novo', tom: 'azul' },
  em_revisao: { nome: 'Em revisão', tom: 'cinza' },
  aceito: { nome: 'Aceito', tom: 'ambar' },
  em_acao: { nome: 'Em ação', tom: 'ambar' },
  monitorando: { nome: 'Monitorando', tom: 'azul' },
  resolvido: { nome: 'Resolvido', tom: 'verde' },
  descartado: { nome: 'Descartado', tom: 'cinza' },
};
const NOMES_DE_COMPONENTE: Record<string, string> = {
  criticidade: 'Criticidade',
  reincidencia: 'Reincidência de falhas',
  parada: 'Equipamento parado',
  custo: 'Custo informado',
  impacto_hospede: 'Impacto em hóspedes',
  preventiva_ou_compliance: 'Preventiva ou compliance',
};

const SeloDaFaixa = ({ faixa }: { faixa: string }) => (
  <Selo tom={FAIXAS[faixa]?.tom ?? 'cinza'}>{FAIXAS[faixa]?.nome ?? faixa}</Selo>
);
const SeloDoEstado = ({ estado }: { estado: EstadoDoInsight }) => (
  <Selo tom={ESTADOS[estado].tom}>{ESTADOS[estado].nome}</Selo>
);

function Filtro({ rotulo, opcoes }: { rotulo: string; opcoes: string[] }) {
  return (
    <Campo rotulo={rotulo}>
      {(c) => (
        <Selecao {...c}>
          {opcoes.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </Selecao>
      )}
    </Campo>
  );
}

const q = (tela: string) => `?tela=${tela}${new URLSearchParams(location.search).get('tema') ? `&tema=${new URLSearchParams(location.search).get('tema')}` : ''}`;

function Moldura({ tela, titulo, children }: { tela: string; titulo: string; children: React.ReactNode }) {
  return (
    <Estrutura
      marca={<Marca nome="HubKeep" />}
      rotuloDoMenu="Menu principal"
      titulo={titulo}
      acoes={<span className="hk-suave">Marina Souza · Gestora CSC</span>}
      escopo={<span>Grupo Aurora · 4 hotéis</span>}
      rotuloPularParaConteudo="Pular para o conteúdo"
      menu={
        <>
          <GrupoDeMenu rotulo="Operação">
            <ItemDeMenu href="#">Chamados</ItemDeMenu>
            <ItemDeMenu href="#">Ordens de serviço</ItemDeMenu>
            <ItemDeMenu href="#">Paradas a encerrar</ItemDeMenu>
          </GrupoDeMenu>
          <GrupoDeMenu rotulo="Cadastros">
            <ItemDeMenu href="#">Hotéis</ItemDeMenu>
            <ItemDeMenu href="#">Ativos</ItemDeMenu>
          </GrupoDeMenu>
          <GrupoDeMenu rotulo="Intelligence">
            <ItemDeMenu href={q('lista')} ativo={tela === 'lista'} contagem={6}>
              Insights
            </ItemDeMenu>
          </GrupoDeMenu>
        </>
      }
    >
      {children}
    </Estrutura>
  );
}

/* ---------- 1. Lista de insights ---------- */
export function ListaDeInsights() {
  const abertos = insights.filter((i) => !['resolvido', 'descartado'].includes(i.estado));
  const linha = (i: InsightDaLista) => (
    <tr key={i.id}>
      <td>
        <SeloDaFaixa faixa={i.faixa} />
      </td>
      <td>
        <a className="hk-id" href={q(i.tipo === 'sistemico' ? 'investigacao' : 'ativo')}>
          {i.id}
        </a>
      </td>
      <td>
        <strong>{i.assunto}</strong>
        <div className="hk-suave">{i.detalhe}</div>
        {i.substituidoPor ? (
          <div className="hk-suave">Substituído pelo insight {i.substituidoPor}</div>
        ) : null}
        {i.anterior ? <div className="hk-suave">Substitui o insight {i.anterior}</div> : null}
      </td>
      <td>{i.escopo}</td>
      <td className="hk-num hk-tnum">{i.valor ?? '—'}</td>
      <td>
        <SeloDoEstado estado={i.estado} />
      </td>
      <td>{i.responsavel ?? <span className="hk-suave">Sem responsável</span>}</td>
      <td>{i.ultimaDeteccao}</td>
    </tr>
  );
  return (
    <Moldura tela="lista" titulo="Insights">
      <div className="v-indicadores">
        <Indicador rotulo="Insights abertos" valor={abertos.length} />
        <Indicador
          rotulo="Em alta atenção ou crítico"
          valor={abertos.filter((i) => ['alta_atencao', 'critico'].includes(i.faixa)).length}
          tom="critico"
          detalhe="Ativos que pedem investigação primeiro"
        />
        <Indicador
          rotulo="Possíveis problemas sistêmicos"
          valor={abertos.filter((i) => i.tipo === 'sistemico').length}
          tom="atencao"
          detalhe="Só uma pessoa confirma"
        />
        <Indicador
          rotulo="Sem responsável"
          valor={abertos.filter((i) => !i.responsavel).length}
          tom="atencao"
        />
      </div>
      <Painel titulo="Fila de insights" dica="O score sugere, e a pessoa decide">
        <div className="hk-filtros">
          <Filtro rotulo="Estado" opcoes={['Abertos', 'Todos', 'Encerrados']} />
          <Filtro
            rotulo="Tipo"
            opcoes={['Todos', 'Ativo que pede atenção', 'Possível problema sistêmico']}
          />
          <Filtro
            rotulo="Escopo"
            opcoes={['Todos os hotéis', 'Aurora Centro', 'Aurora Praia', 'Aurora Serra', 'Slim Marina']}
          />
          <Filtro rotulo="Faixa" opcoes={['Todas', 'Crítico', 'Alta atenção', 'Atenção']} />
          <Botao variante="primario">Filtrar</Botao>
        </div>
        <Tabela legenda="Insights do grupo">
          <thead>
            <tr>
              <th>Faixa</th>
              <th>Insight</th>
              <th>O que é</th>
              <th>Escopo</th>
              <th className="hk-num">Score</th>
              <th>Estado</th>
              <th>Responsável</th>
              <th>Última detecção</th>
            </tr>
          </thead>
          <tbody>{insights.map(linha)}</tbody>
        </Tabela>
      </Painel>
    </Moldura>
  );
}

/* ---------- 2. Painel de investigação (insight sistêmico) ---------- */
function BarrasPorSemana({ valores }: { valores: number[] }) {
  const max = Math.max(...valores, 1);
  const largura = 26;
  return (
    <svg
      className="v-grafico v-barras"
      viewBox={`0 0 ${valores.length * largura + 10} 120`}
      role="img"
      aria-label="Chamados por semana, nas últimas 12 semanas, em ordem do mais antigo ao mais novo"
    >
      {valores.map((v, i) => {
        const h = (v / max) * 86;
        return (
          <g key={i}>
            <rect x={6 + i * largura} y={100 - h} width={largura - 8} height={h} rx={3} fill="var(--hk-ambar)" />
            <text x={6 + i * largura + (largura - 8) / 2} y={96 - h} textAnchor="middle" fontSize="10" fill="var(--hk-texto-suave)">
              {v}
            </text>
          </g>
        );
      })}
      <line x1="4" x2={valores.length * largura + 6} y1="100.5" y2="100.5" stroke="var(--hk-linha)" />
    </svg>
  );
}

export function PainelDeInvestigacao() {
  return (
    <Moldura tela="lista" titulo="Insight INS-0141">
      <a className="hk-voltar" href={q('lista')}>
        ← Insights
      </a>
      <Painel
        titulo="Mesmo modelo, mesma falha"
        dica="Possível problema sistêmico · só uma pessoa confirma"
        acoes={
          <>
            <SeloDaFaixa faixa="atencao" />
            <SeloDoEstado estado="novo" />
          </>
        }
      >
        <p className="hk-texto-longo">
          Acme X1 com a falha “ruído”: 6 ativos do mesmo modelo, em 3 hotéis da bandeira Aurora, nos últimos 90 dias.
        </p>
        <p className="hk-suave">
          Escopo: rede da bandeira Aurora (Aurora Centro, Aurora Praia e Aurora Serra) · aberto em 05/10/2026 ·
          última detecção hoje
        </p>
        <Nota tom="atencao">
          Este insight substitui o <a href="#">INS-0133</a>, que cobria 2 hotéis e continua em revisão: entrou um hotel
          novo (Aurora Serra). Quem decidir o INS-0133 pode descartá-lo com o motivo “substituído”.
        </Nota>
      </Painel>

      <div className="hk-grade" data-colunas="2-1">
        <div className="hk-pilha">
          <Painel titulo="Por que estou vendo isso?">
            <ul className="hk-lista">
              <li>6 chamados do mesmo modelo (Acme X1) com a falha “ruído”, em ativos diferentes, em 90 dias.</li>
              <li>Em 3 hotéis da bandeira Aurora: Aurora Centro (2), Aurora Praia (2) e Aurora Serra (2).</li>
              <li>A regra pede ao menos 5 ativos do mesmo modelo e da mesma falha em 90 dias.</li>
            </ul>
            <Nota>
              É um sinal, e não uma conclusão: a regra encontra o padrão, e uma pessoa confirma. Correlação não é
              causa.
            </Nota>
          </Painel>

          <Painel titulo="Chamados por semana" dica="Últimas 12 semanas">
            <BarrasPorSemana valores={semanasDoSistemico} />
          </Painel>

          <Painel titulo="Chamados que levaram ao insight" dica="Só os hotéis do seu escopo">
            <Tabela legenda="Chamados do insight">
              <thead>
                <tr>
                  <th>Chamado</th>
                  <th>Hotel</th>
                  <th>Ativo</th>
                  <th>Aberto em</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {evidenciaDoSistemico.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <a className="hk-id" href="#">
                        {c.id}
                      </a>
                    </td>
                    <td>{NOMES_DE_HOTEL[c.hotel]}</td>
                    <td>{c.ativo}</td>
                    <td>{c.abertura.split('-').reverse().join('/')}</td>
                    <td>
                      <Selo tom={c.situacao === 'Concluído' ? 'verde' : 'azul'}>{c.situacao}</Selo>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          </Painel>
        </div>

        <div className="hk-pilha">
          <Painel titulo="Decisão" dica="Novo → revisar, aceitar ou descartar">
            <div className="hk-pilha">
              <p className="hk-suave">Sem responsável. Quem revisa assume a análise.</p>
              <div className="hk-linha-de-botoes">
                <Botao variante="primario">Revisar</Botao>
                <Botao>Aceitar</Botao>
              </div>
              <div className="hk-bloco" data-tom="atencao">
                <p className="hk-bloco-titulo">Descartar</p>
                <Campo rotulo="Motivo">
                  {(c) => (
                    <Selecao {...c} defaultValue="">
                      <option value="" disabled>
                        Escolha o motivo
                      </option>
                      <option>Não relevante</option>
                      <option>Substituído por outro insight</option>
                    </Selecao>
                  )}
                </Campo>
                <Campo rotulo="Nota" ajuda="Obrigatória. Fica no histórico do insight.">
                  {(c) => <AreaDeTexto {...c} rows={3} />}
                </Campo>
                <div className="hk-linha-de-botoes">
                  <Botao variante="perigo">Descartar insight</Botao>
                </div>
                <p className="hk-suave">
                  Descartar como “não relevante” silencia este problema por 30 dias, a menos que a faixa suba.
                </p>
              </div>
            </div>
          </Painel>

          <Painel titulo="Quem decide">
            <p className="hk-suave">
              Insight de rede: decidem o Admin do grupo e o Gestor CSC que cobrem os 3 hotéis. O Gerente de hotel vê o
              insight dos hotéis dele, mas não decide o de rede.
            </p>
          </Painel>

          <Painel titulo="Histórico">
            <ol className="hk-tempo">
              <li>
                <strong>Aberto pelo cálculo diário</strong>
                <span className="hk-suave">05/10/2026 · ligado ao INS-0133</span>
              </li>
              <li>
                <strong>Atualizado</strong>
                <span className="hk-suave">hoje · mesma faixa</span>
              </li>
            </ol>
          </Painel>
        </div>
      </div>
    </Moldura>
  );
}

/* ---------- 3. Detalhe do ativo ---------- */
function GraficoDaAtencao() {
  const largura = 640;
  const altura = 180;
  const x = (i: number) => 28 + (i / (serieDaAtencao.length - 1)) * (largura - 40);
  const y = (v: number) => 10 + (1 - v / 100) * (altura - 30);
  const faixas = [...FAIXAS_PADRAO];
  const caminho = serieDaAtencao.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(p.valor).toFixed(1)}`).join(' ');
  const cores: Record<string, string> = {
    normal: 'var(--hk-verde-suave)',
    observar: 'var(--hk-azul-suave)',
    atencao: 'var(--hk-ambar-suave)',
    alta_atencao: 'var(--hk-vermelho-suave)',
    critico: 'var(--hk-vermelho-suave)',
  };
  return (
    <svg
      className="v-grafico"
      viewBox={`0 0 ${largura} ${altura}`}
      role="img"
      aria-label="Atenção do ativo nos últimos 90 dias, de 24 a 78, em alta"
    >
      {faixas.map((f, i) => {
        const topo = faixas[i + 1]?.desde ?? 100;
        return (
          <rect key={f.chave} x={28} width={largura - 40} y={y(topo)} height={y(f.desde) - y(topo)} fill={cores[f.chave]} />
        );
      })}
      {[0, 30, 50, 70, 85, 100].map((v) => (
        <text key={v} x={22} y={y(v) + 3} textAnchor="end" fontSize="10" fill="var(--hk-texto-suave)">
          {v}
        </text>
      ))}
      <line
        x1={28}
        x2={largura - 12}
        y1={y(PADRAO_ATENCAO.limiteInsight)}
        y2={y(PADRAO_ATENCAO.limiteInsight)}
        stroke="var(--hk-ambar)"
        strokeDasharray="4 4"
      />
      <text x={34} y={y(PADRAO_ATENCAO.limiteInsight) - 4} textAnchor="start" fontSize="10" fill="var(--hk-ambar-texto)">
        Limite do insight: {PADRAO_ATENCAO.limiteInsight}
      </text>
      <path d={caminho} fill="none" stroke="var(--hk-ok)" strokeWidth="2" />
      <circle cx={x(serieDaAtencao.length - 1)} cy={y(serieDaAtencao.at(-1)?.valor ?? 0)} r="4" fill="var(--hk-ok)" />
    </svg>
  );
}

const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const porcento = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 0 });

export function DetalheDoAtivo() {
  const faixa = atencaoDoChiller.faixa;
  return (
    <Moldura tela="lista" titulo="Chiller 02">
      <a className="hk-voltar" href={q('lista')}>
        ← Insights
      </a>
      <Painel
        titulo="Chiller 02"
        dica="Casa de máquinas · Carrier 30XA · Aurora Centro · ativo desde 03/2019"
        acoes={
          <>
            <SeloDaFaixa faixa={faixa} />
            <a {...comoBotao('padrao', 'pequeno')} href={q('lista')}>
              Insight INS-0142
            </a>
          </>
        }
      >
        <div className="v-indicadores">
          <Indicador
            rotulo="Atenção ao ativo"
            valor={atencaoDoChiller.valor ?? '—'}
            unidade=" de 100"
            tom={(atencaoDoChiller.valor ?? 0) >= 70 ? 'critico' : 'atencao'}
            detalhe={`${FAIXAS[faixa]?.nome ?? faixa}, acima do limite do insight (${PADRAO_ATENCAO.limiteInsight})`}
          />
          <Indicador rotulo="Criticidade" valor={5} unidade={` de ${CRITICIDADE_MAXIMA}`} tom="critico" />
          <Indicador rotulo="Equipamento parado" valor={numero.format(30.5)} unidade=" h" detalhe="Últimos 90 dias" />
          <Indicador rotulo="Chamados que afetaram hóspedes" valor={porcento.format(0.667)} detalhe="4 de 6 respondidos" tom="atencao" />
        </div>
      </Painel>

      <div className="hk-grade" data-colunas="2-1">
        <div className="hk-pilha">
          <Painel titulo="Por que estou vendo isso?" dica="Os três fatores que mais pesaram">
            <ol className="hk-lista">
              {motivosDaAtencao.map((m, i) => (
                <li key={m.chave}>
                  <span>
                    <strong>{i + 1}.</strong> {m.texto}
                  </span>
                </li>
              ))}
            </ol>
            <Nota>
              O score sugere onde investigar. Ele mostra o que pesou, e não a causa. Dado que ainda não existe é
              avisado abaixo, e não conta como zero.
            </Nota>
          </Painel>

          <Painel titulo="Atenção nos últimos 90 dias" dica="Uma linha por dia calculado">
            <GraficoDaAtencao />
          </Painel>

          <Painel titulo="Como o score foi composto" dica="Fórmula da atenção, versão 1">
            <Tabela legenda="Componentes do score de atenção">
              <thead>
                <tr>
                  <th>Componente</th>
                  <th className="hk-num">Valor</th>
                  <th className="hk-num">Peso</th>
                  <th className="hk-num">Peso usado</th>
                  <th className="hk-num">Pontos</th>
                </tr>
              </thead>
              <tbody>
                {atencaoDoChiller.componentes.map((c) => (
                  <tr key={c.chave}>
                    <td>{NOMES_DE_COMPONENTE[c.chave] ?? c.chave}</td>
                    <td className="hk-num hk-tnum">{c.valor === null ? '—' : porcento.format(c.valor)}</td>
                    <td className="hk-num hk-tnum">{porcento.format(c.peso)}</td>
                    <td className="hk-num hk-tnum">{c.valor === null ? '—' : porcento.format(c.pesoEfetivo)}</td>
                    <td className="hk-num hk-tnum">{numero.format(c.pontos)}</td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
            {atencaoDoChiller.ausentes.length ? (
              <Nota tom="atencao">
                Sem dado: {atencaoDoChiller.ausentes.map((a) => NOMES_DE_COMPONENTE[a] ?? a).join(', ')}. O peso
                dele foi dividido entre os componentes que têm dado, na proporção.
              </Nota>
            ) : null}
          </Painel>
        </div>

        <div className="hk-pilha">
          <Painel titulo="Insights deste ativo">
            <ul className="hk-lista">
              <li>
                <span>
                  <a className="hk-id" href={q('lista')}>
                    INS-0142
                  </a>{' '}
                  Ativo que pede atenção
                </span>
                <SeloDoEstado estado="novo" />
              </li>
            </ul>
            <p className="hk-suave">Nenhum outro insight, aberto ou encerrado, nos últimos 180 dias.</p>
          </Painel>

          <Painel titulo="Como este resultado foi gravado">
            <dl className="v-dados">
              <dt>Calculado em</dt>
              <dd>07/10/2026, 03:10</dd>
              <dt>Cálculo</dt>
              <dd>1 (original)</dd>
              <dt>Fórmula</dt>
              <dd>atenção v1 · reincidência v1</dd>
              <dt>Política</dt>
              <dd>padrões do HubKeep, sem política do grupo</dd>
            </dl>
            <Nota tom="info">
              Um recálculo grava outra linha, marcada como recálculo, com a versão da fórmula e da política de hoje. O
              resultado já gravado não muda.
            </Nota>
          </Painel>

        </div>
      </div>
    </Moldura>
  );
}

export { faixaDoValor };
