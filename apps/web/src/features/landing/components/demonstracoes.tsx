"use client";

import { useState, useSyncExternalStore } from "react";
import type {
  AcompanhamentoPedido,
  EmpresaPublica,
  GrupoOpcoesPublico,
  ItemListaConversas,
  Mensagem,
  ProdutoPublico,
  SaidaEntrega,
  StatusPedido,
} from "@jaa/contratos";
import { useNarrativa } from "./use-narrativa";
import { useConversaCardapioDemo } from "./use-conversa-cardapio-demo";
import { CabecalhoConversa } from "@/features/conversas/components/cabecalho-conversa";
import { ListaConversas } from "@/features/conversas/components/lista-conversas";
import { BalaoMensagem } from "@/features/conversas/components/balao-mensagem";
import {
  Cardapio,
  DetalheProdutoCatalogo,
} from "@/features/catalogo/components/catalogo-apresentacao";
import {
  AvisoDaEntrega,
  EntregadorDaEntrega,
} from "@/features/entregas/components/acompanhamento-cliente";
import { SequenciaDaSaida } from "@/features/entregas/components/saida-apresentacao";
import { TimelinePedido } from "@/features/pedidos/components/apresentacao-pedido";
import { IconeConversa, IconeLoja, IconeCesta } from "@/components/ui/icones";

// Dados exclusivamente locais da demonstração. Nenhuma ação envia pedidos ou mensagens à API.
const empresa: EmpresaPublica = {
  identidadeId: "demo-empresa",
  nome: "Pizzaria · exemplo",
  nomeUsuario: "pizzaria_exemplo",
  slug: "pizzaria-exemplo",
};
const prato: ProdutoPublico = {
  id: "prato",
  nome: "Monte seu prato",
  descricao: "Escolha o tamanho e a proteína.",
  precoCentavos: 3990,
  disponibilidade: "disponivel",
  categoriaId: "pratos",
  imagemUrl: "/landing/prato-demo.svg",
  personalizavel: true,
};
const bebida: ProdutoPublico = {
  ...prato,
  id: "bebida",
  imagemUrl: "/landing/bebida-demo.svg",
  nome: "Refrigerante 2 L",
  descricao: "Para acompanhar seu pedido.",
  precoCentavos: 1200,
  categoriaId: "bebidas",
  personalizavel: false,
};
const grupos: GrupoOpcoesPublico[] = [
  {
    id: "tamanho",
    nome: "Tamanho",
    instrucao: null,
    minimoEscolhas: 1,
    maximoEscolhas: 1,
    opcoes: [
      { id: "media", nome: "Médio", precoAdicionalCentavos: 0 },
      { id: "grande", nome: "Grande", precoAdicionalCentavos: 1000 },
    ],
  },
  {
    id: "sabor",
    nome: "Proteína",
    instrucao: null,
    minimoEscolhas: 1,
    maximoEscolhas: 1,
    opcoes: [
      { id: "frango", nome: "Frango grelhado", precoAdicionalCentavos: 0 },
      { id: "carne", nome: "Carne grelhada", precoAdicionalCentavos: 0 },
    ],
  },
];
const secoes = [
  {
    id: "pratos",
    categoriaId: "pratos",
    nome: "Pratos",
    produtos: [prato],
    montagem: false,
  },
  {
    id: "bebidas",
    categoriaId: "bebidas",
    nome: "Bebidas",
    produtos: [bebida],
    montagem: false,
  },
];
const agora = new Date("2026-10-08T18:30:00-03:00");
function mensagem(conteudo: string, propria: boolean, id: string): Mensagem {
  return {
    id,
    conversaId: "demo",
    remetenteIdentidadeId: propria ? "eu" : "empresa",
    tipo: "texto",
    conteudo,
    criadoEm: agora.toISOString(),
    estado: "lida",
    mensagemRespondida: null,
    editadaEm: null,
    excluidaEm: null,
    pedido: null,
    anexo: null,
  };
}
const conversas: ItemListaConversas[] = [
  {
    id: "empresa",
    tipo: "direta",
    outraIdentidade: {
      identidadeId: "empresa",
      tipo: "empresarial",
      nomeExibicao: "Pizzaria · exemplo",
      nomeUsuario: "pizzaria_exemplo",
      fotoUrl: "/landing/pizzaria-demo.svg",
    },
    ultimaMensagem: mensagem(
      "Nosso cardápio está aqui na conversa.",
      false,
      "ultima-empresa",
    ),
    atividadeId: "ultima-empresa",
    naoLidas: 0,
    comunicacaoBloqueada: false,
  },
  {
    id: "pessoa",
    tipo: "direta",
    outraIdentidade: {
      identidadeId: "pessoa",
      tipo: "pessoal",
      nomeExibicao: "Ana · exemplo",
      nomeUsuario: "ana_exemplo",
      fotoUrl: null,
    },
    ultimaMensagem: mensagem(
      "Vamos combinar por aqui?",
      false,
      "ultima-pessoa",
    ),
    atividadeId: "ultima-pessoa",
    naoLidas: 0,
    comunicacaoBloqueada: false,
  },
];
const assinarHidratacao = () => () => {};
const noCliente = () => true;
const noServidor = () => false;

export function ConversaDemo({
  compacta = false,
  cabecalho = true,
  respostaEmpresa = "Pode sim! Nosso cardápio está aqui na conversa.",
}: {
  compacta?: boolean;
  cabecalho?: boolean;
  respostaEmpresa?: string;
}) {
  const [pessoal, setPessoal] = useState(false);
  // Horários dos componentes reais usam o fuso do navegador; não são pré-renderizados em outro fuso.
  const hidratado = useSyncExternalStore(
    assinarHidratacao,
    noCliente,
    noServidor,
  );
  if (!hidratado)
    return (
      <div
        className={`lp-chat-carregando ${compacta ? "lp-chat-carregando-compacto" : ""}`}
        aria-busy="true"
      >
        <p>Conversas com pessoas e empresas</p>
      </div>
    );
  return (
    <div className="lp-conversa-demo">
      {cabecalho && (
        <div className="lp-tela-topo">
          <IconeConversa className="h-5 w-5 text-marca" />
          <strong>{compacta ? "Pizzaria · exemplo" : "Suas conversas"}</strong>
        </div>
      )}
      {!compacta && (
        <ListaConversas
          identidadeId="eu"
          itens={conversas}
          carregando={false}
          erro={null}
          temMais={false}
          carregandoMais={false}
          conversaAbertaId={pessoal ? "pessoa" : "empresa"}
          aoAbrir={(item) => setPessoal(item.id === "pessoa")}
          aoCarregarMais={() => {}}
        />
      )}
      <div
        className="chat-wallpaper lp-mensagens"
        key={pessoal ? "pessoa" : "empresa"}
      >
        <BalaoMensagem
          mensagem={mensagem(
            pessoal
              ? "Oi, Ana! Vamos combinar por aqui?"
              : "Oi! Posso pedir por aqui?",
            true,
            "1",
          )}
          identidadeAtualId="eu"
          nomeRemetente="Você"
        />
        <BalaoMensagem
          mensagem={mensagem(
            pessoal
              ? "Vamos sim! Me conta."
              : respostaEmpresa,
            false,
            "2",
          )}
          identidadeAtualId="eu"
          nomeRemetente={pessoal ? "Ana" : "Pizzaria"}
        />
        {!compacta && (
          <BalaoMensagem
            mensagem={mensagem(
              pessoal
                ? "Já te mando uma mensagem."
                : "Perfeito. Vou montar minha pizza!",
              true,
              "3",
            )}
            identidadeAtualId="eu"
            nomeRemetente="Você"
          />
        )}
      </div>
    </div>
  );
}
export function CardapioDemo({
  embutido = false,
  produto,
  aoSelecionarProduto: setProduto,
}: {
  embutido?: boolean;
  produto: ProdutoPublico | null;
  aoSelecionarProduto: (produto: ProdutoPublico | null) => void;
}) {
  const [secao, setSecao] = useState<string | null>(null);
  const [itens, setItens] = useState<string[]>([]);
  function adicionar(
    escolhido: ProdutoPublico,
    quantidade: number,
    opcaoIds: string[] = [],
  ) {
    const escolhas = grupos.flatMap((grupo) =>
      grupo.opcoes
        .filter((opcao) => opcaoIds.includes(opcao.id))
        .map((opcao) => opcao.nome),
    );
    setItens((anteriores) => [
      ...anteriores,
      `${quantidade} × ${escolhido.nome}${escolhas.length ? ` · ${escolhas.join(", ")}` : ""}`,
    ]);
    setProduto(null);
  }
  return (
    <div
      className={embutido ? "lp-cardapio-embutido" : "lp-tela lp-cardapio-demo"}
    >
      {!embutido && (
        <div className="lp-tela-topo">
          <IconeLoja className="h-5 w-5 text-marca" />
          <strong>Cardápio na conversa</strong>
          <span>Exemplo</span>
        </div>
      )}
      <div className="lp-tela-corpo">
        {produto ? (
          <DetalheProdutoCatalogo
            empresa={empresa}
            produto={produto}
            grupos={produto.personalizavel ? grupos : []}
            aoVoltar={() => setProduto(null)}
            aoAdicionar={adicionar}
          />
        ) : (
          <Cardapio
            empresa={empresa}
            secoes={secoes}
            secaoEscolhidaId={secao}
            aoEscolherSecao={setSecao}
            aoVer={setProduto}
            aoAdicionar={adicionar}
          />
        )}
        <div className="lp-carrinho" role="status">
          <IconeCesta className="h-5 w-5" />
          <div>
            <strong>Seu pedido</strong>
            <p>
              {itens.length
                ? itens.join(" · ")
                : "Explore o cardápio e monte seu produto."}
            </p>
          </div>
          {itens.length > 0 && (
            <button onClick={() => setItens([])} type="button">
              Limpar
            </button>
          )}
        </div>
        <p className="lp-nota">
          Demonstração interativa com os componentes do Jaaa. Nenhum pedido é
          enviado.
        </p>
      </div>
    </div>
  );
}
export function ConversaPedidoDemo() {
  const { ref, cardapio, cursor, clique, automatico, montagem, interromper, alternar } = useConversaCardapioDemo();
  const [produtoManual, setProdutoManual] = useState<ProdutoPublico | null>(null);
  const produto = automatico ? (montagem ? prato : null) : produtoManual;
  function assumirControle() {
    if (automatico) setProdutoManual(produto);
    interromper();
  }
  return (
    <div
      ref={ref}
      className="lp-tela lp-conversa-pedido-demo"
      data-revelar
      data-cursor={cursor}
      data-clique={clique}
      onPointerDownCapture={assumirControle}
      onFocusCapture={assumirControle}
      onKeyDownCapture={assumirControle}
      onWheelCapture={assumirControle}
    >
      <CabecalhoConversa
        outraIdentidade={conversas[0].outraIdentidade}
        presenca={null}
        digitando={false}
        acoes={
          <div className="lp-controle-cardapio-demo">
            <button
              type="button"
              className="lp-abrir-cardapio"
              aria-pressed={cardapio}
              onClick={alternar}
              aria-expanded={cardapio}
            >
              <IconeCesta className="h-4 w-4" />
              {cardapio ? "Conversa" : "Cardápio"}
            </button>
          </div>
        }
      />
      <div className="chat-wallpaper lp-conversa-pedido-corpo">
        <ConversaDemo
          compacta
          cabecalho={false}
          respostaEmpresa="Pode sim! Clique no cardápio."
        />
        {/* Reserva a altura e preserva produto/carrinho ao alternar a demonstração. */}
        <div className="lp-cardapio-demo-painel" data-aberto={cardapio} inert={!cardapio} aria-hidden={!cardapio}>
          <CardapioDemo embutido produto={produto} aoSelecionarProduto={setProdutoManual} />
        </div>
      </div>
      {cursor && (
        <span className="lp-cursor-demo" aria-hidden="true">
          <span className="lp-cursor-clique" />
          <svg viewBox="0 0 28 32" fill="none">
            <path d="M3 2L24 19L14 20L9 29L3 2Z" />
          </svg>
        </span>
      )}
    </div>
  );
}

export function MapaDemo({
  varias = false,
  zonas = false,
  animar = false,
}: {
  varias?: boolean;
  zonas?: boolean;
  animar?: boolean;
}) {
  return (
    <div
      className={`lp-mapa ${animar ? "lp-mapa-narrativa" : ""}`}
      aria-label={
        varias
          ? "Mapa ilustrativo de três paradas em uma rota organizada"
          : "Mapa ilustrativo do trecho entre entregador e cliente"
      }
      role="img"
    >
      <svg viewBox="0 0 500 270" fill="none" aria-hidden="true">
        <path
          d="M0 28L500 85M0 105L500 150M0 185L500 240M45 0L120 270M175 0L205 270M310 0L285 270M440 0L400 270"
          stroke="var(--cor-superficie)"
          strokeWidth="18"
        />
        <path
          d="M0 28L500 85M0 105L500 150M0 185L500 240M45 0L120 270M175 0L205 270M310 0L285 270M440 0L400 270"
          stroke="var(--cor-borda)"
          strokeWidth="1"
        />
        <path
          d="M212 58L277 67L270 120L223 113Z"
          fill="var(--cor-marca-suave)"
        />
        <path
          d="M335 170L377 175L367 216L330 212Z"
          fill="var(--cor-marca-suave)"
        />
        {zonas && (
          <g className="lp-zonas">
            <path
              d="M65 125L225 75L294 180L137 235Z"
              fill="var(--cor-marca)"
              fillOpacity=".08"
              stroke="var(--cor-marca)"
              strokeOpacity=".35"
            />
            <path
              d="M225 75L388 45L433 186L294 180Z"
              fill="var(--cor-marca)"
              fillOpacity=".06"
              stroke="var(--cor-marca)"
              strokeOpacity=".35"
            />
          </g>
        )}
        <g fill="var(--cor-conteudo-suave)" fontSize="9">
          <text x="230" y="48">
            JARDIM
          </text>
          <text x="330" y="251">
            CENTRO
          </text>
          <text x="32" y="86">
            VILA NOVA
          </text>
        </g>
        <path
          d={
            varias
              ? "M80 210L60 125Q58 116 74 118L185 127L177 52Q177 44 190 47L305 61L300 141L425 160L412 219"
              : "M80 210L60 125Q58 116 74 118L185 127L177 52Q177 44 190 47L305 61"
          }
          stroke="var(--cor-marca)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="lp-rota"
          pathLength="1"
        />
        {(varias
          ? [
              { x: 185, y: 127 },
              { x: 305, y: 61 },
              { x: 412, y: 219 },
            ]
          : [{ x: 305, y: 61 }]
        ).map((p, i) => (
          <g key={p.x} className="lp-parada-mapa">
            <circle
              cx={p.x}
              cy={p.y}
              r="15"
              fill="var(--cor-marca)"
              stroke="white"
              strokeWidth="3"
            />
            <text
              x={p.x}
              y={p.y + 5}
              fill="white"
              fontSize="13"
              textAnchor="middle"
            >
              {varias ? i + 1 : "⌂"}
            </text>
          </g>
        ))}
        <g className="lp-marcador">
          <circle
            cx="80"
            cy="210"
            r="16"
            fill="var(--cor-marca)"
            stroke="white"
            strokeWidth="3"
          />
          <path
            d="M73 214L80 206L86 214M75 201H81L85 211M71 214H88"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </g>
      </svg>
      <span className="lp-mapa-legenda">
        Mapa e rota ilustrativos · exemplo
      </span>
    </div>
  );
}

const etapasDemo: StatusPedido[] = [
  "recebido",
  "em_preparacao",
  "pronto",
  "saiu_para_entrega",
  "saiu_para_entrega",
];
export function EntregaDemo() {
  const { ref, passo, reduzido, escolher, repetir } = useNarrativa(4, 1100);
  const saiu = passo >= 3;
  const proxima = passo === 4;
  const acompanhamento: AcompanhamentoPedido = {
    fila: {
      pedidoId: "demo",
      situacao: proxima ? "indo_ate_voce" : "na_fila",
      entregasAntes: proxima ? 0 : 1,
    },
    entregador: {
      identidadeId: "demo-entregador",
      tipo: "pessoal",
      nomeExibicao: "Paulo · exemplo",
      nomeUsuario: "paulo_exemplo",
      fotoUrl: null,
    },
    posicaoEntregador: proxima
      ? {
          latitude: -19.92,
          longitude: -43.94,
          capturadaEm: agora.toISOString(),
        }
      : null,
    rota: proxima
      ? { geometria: [], distanciaMetros: 1200, duracaoSegundos: 300 }
      : null,
  };
  return (
    <div
      ref={ref}
      className="lp-tela lp-entrega-demo"
      data-revelar
      data-narrativa={proxima ? "proxima" : saiu ? "fila" : "preparo"}
    >
      <div className="lp-tela-topo">
        <IconeLoja className="h-5 w-5 text-marca" />
        <strong>Pizzaria · exemplo</strong>
        <span>Pedido na conversa</span>
      </div>
      <div className="lp-demo-controle" aria-label="Estado da demonstração">
        <button
          type="button"
          aria-pressed={saiu && !proxima}
          onClick={() => escolher(3)}
        >
          Na fila
        </button>
        <button
          type="button"
          aria-pressed={proxima}
          onClick={() => escolher(4)}
        >
          Sua vez
        </button>
        <button type="button" className="lp-repetir" onClick={repetir}>
          Rever etapas ↺
        </button>
      </div>
      <div className="chat-wallpaper lp-pedido-wallpaper">
        <div className="lp-entrega-grid">
          <div className="lp-tela-corpo lp-timeline-coluna">
            <h3 className="lp-demo-subtitulo">Acompanhamento</h3>
            <TimelinePedido
              pedido={{ status: etapasDemo[passo], historico: [] }}
              visaoCliente
            />
            <p className="lp-nota">
              Do recebimento à entrega, na mesma conversa.
            </p>
          </div>
          <div className="lp-entrega-mapa">
            <div className="lp-entregador-faixa">
              <h3 className="lp-demo-subtitulo">Entrega</h3>
              <EntregadorDaEntrega acompanhamento={acompanhamento} emDestaque />
            </div>
            <div className="lp-estado-entrega">
              {saiu ? (
                <AvisoDaEntrega acompanhamento={acompanhamento} agora={agora} />
              ) : (
                <div className="lp-espera-status">
                  {passo < 2
                    ? "Seu pedido está sendo preparado."
                    : "Pedido pronto. Aguardando coleta."}
                </div>
              )}
            </div>
            {proxima ? (
              <MapaDemo animar={!reduzido} />
            ) : (
              <div className="lp-espera-mapa">
                <IconeConversa className="h-6 w-6 text-marca" />
                <p>
                  {saiu
                    ? "O mapa aparece quando chega a sua vez."
                    : "O acompanhamento continua aqui na conversa."}
                </p>
                {saiu && (
                  <span>
                    Você vê sua posição, sem dados dos outros clientes.
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      <p className="lp-nota px-4 py-3">
        Demonstração com componentes reais. Pessoa, distância, previsão e mapa
        são exemplos.
      </p>
    </div>
  );
}

// Mesma apresentação usada na logística, em modo de leitura e sem ações operacionais.
const saidaExemplo: SaidaEntrega = {
  id: "saida-exemplo",
  empresa,
  entregador: null,
  status: "em_andamento",
  versaoSequencia: 1,
  paradas: ["Ana", "Lucas", "Marina"].map((nome, indice) => ({
    id: `parada-${indice}`,
    pedidoId: `pedido-${indice}`,
    numeroPedido: indice + 1,
    posicao: indice + 1,
    statusPedido: "saiu_para_entrega",
    destino: {
      enderecoId: `endereco-${indice}`,
      cep: "30123000",
      logradouro: "Rua de exemplo",
      numero: String(100 + indice),
      complemento: null,
      bairro: "Centro",
      cidade: "Belo Horizonte",
      uf: "MG",
      pontoReferencia: null,
      latitude: -19.92,
      longitude: -43.94,
      localizacaoConfirmadaEm: agora.toISOString(),
    },
    cliente: {
      identidadeId: `cliente-${indice}`,
      tipo: "pessoal",
      nomeExibicao: `${nome} · exemplo`,
      nomeUsuario: `${nome.toLowerCase()}_exemplo`,
    },
    totalCentavos: 3990,
    encerradaEm: null,
    motivoEncerramento: null,
  })),
  rota: null,
  zonaPrincipal: null,
  zonasCombinadas: [],
  automatica: false,
  exigeRetornoBase: false,
  criadoEm: agora.toISOString(),
  formacaoIniciadaEm: null,
  prazoFormacaoEm: null,
  fechadaEm: agora.toISOString(),
  atribuidaEm: agora.toISOString(),
  liberadaEm: agora.toISOString(),
  iniciadaEm: agora.toISOString(),
  concluidaEm: null,
};
export function RotaEntregadorDemo() {
  return (
    <div className="lp-rota-demo" data-revelar>
      <div className="lp-tela-topo">
        <strong>Sua rota organizada</strong>
        <span>Exemplo</span>
      </div>
      <MapaDemo varias zonas />
      <div className="lp-tela-corpo">
        <SequenciaDaSaida saida={saidaExemplo} mostrarPercurso={false} />
        <p className="lp-nota">
          Componente real de logística. Clientes, endereços e rota são exemplos.
        </p>
      </div>
    </div>
  );
}
