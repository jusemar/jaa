import Image from "next/image";
import Link from "next/link";
import { IconeConversa, IconeLoja, IconeCesta } from "@/components/ui/icones";
import {
  ConversaPedidoDemo,
  ConversaDemo,
  EntregaDemo,
  MapaDemo,
  RotaEntregadorDemo,
} from "./demonstracoes";
import { MovimentoLanding } from "./movimento-landing";
import "../landing.css";

function CriarConta({ texto = "Criar conta grátis" }: { texto?: string }) {
  return (
    <Link className="lp-botao" href="/cadastro">
      {texto}
      <span aria-hidden="true">↗</span>
    </Link>
  );
}
export function LandingPage() {
  const downloadConfigurado = process.env.NEXT_PUBLIC_APP_DOWNLOAD_URL;
  // Somente endereços HTTPS completos; nunca há link para um APK inexistente.
  let download: string | null = null;
  try {
    if (
      downloadConfigurado &&
      new URL(downloadConfigurado).protocol === "https:"
    )
      download = downloadConfigurado;
  } catch {
    /* Configuração ausente ou inválida: estado indisponível. */
  }
  return (
    <div className="lp">
      <MovimentoLanding />
      <a className="lp-pular" href="#conteudo">
        Pular para o conteúdo
      </a>
      <header className="lp-header">
        <Link href="/" aria-label="Jaaa, página inicial">
          <Image
            src="/jaaa-logo-login.png"
            alt="Jaaa"
            width={1020}
            height={275}
            priority
            className="lp-logo"
          />
        </Link>
        <nav aria-label="Navegação pública">
          <a href="#para-voce">Para você</a>
          <a href="#empresas">Empresas</a>
          <a href="#entregadores">Entregadores</a>
        </nav>
        <div className="lp-header-acoes">
          <Link href="/entrar">Entrar</Link>
          <CriarConta />
        </div>
      </header>
      <main id="conteudo">
        <section className="lp-hero" aria-labelledby="hero-titulo">
          <div className="lp-hero-texto">
            <p className="lp-eyebrow">
              <span /> Seu dia tem um ponto de encontro.
            </p>
            <h1 id="hero-titulo">
              Tudo que você precisa.
              <br />
              <em>No mesmo lugar.</em>
            </h1>
            <p className="lp-hero-descricao">
              A conversa vira pedido. O pedido chega até você.
              <br className="lp-desktop" /> Pessoas, empresas e entregas se
              encontram no Jaaa.
            </p>
            <div className="lp-hero-acoes">
              <CriarConta />
              <a className="lp-link" href="#como-funciona">
                Conheça o Jaaa <span aria-hidden="true">↓</span>
              </a>
            </div>
            <p className="lp-pequeno">
              Use no navegador. No celular ou no computador.
            </p>
          </div>
          <div
            className="lp-universo"
            aria-label="Conversas, empresas e entregas conectadas pelo Jaaa"
          >
            <div className="lp-orbita lp-orbita-1" />
            <div className="lp-orbita lp-orbita-2" />
            <div className="lp-fragmento lp-fragmento-chat">
              <ConversaDemo compacta />
            </div>
            <div className="lp-marca-centro">
              <Image
                src="/landing/jaaa-simbolo.webp"
                alt="Símbolo oficial do Jaaa"
                width={400}
                height={400}
                priority
                sizes="(max-width: 600px) 110px, 150px"
              />
            </div>
            <div className="lp-fragmento lp-fragmento-pedido">
              <div className="lp-tela-topo">
                <IconeCesta className="h-5 w-5 text-marca" />
                <strong>Seu pedido</strong>
              </div>
              <p>Monte sua pizza</p>
              <div className="lp-mini-categorias">
                <span>Pizzas</span>
                <span>Bebidas</span>
              </div>
              <div className="lp-mini-pedido">
                <span>1 item · exemplo</span>
                <strong>Em preparação</strong>
              </div>
            </div>
            <div className="lp-fragmento lp-fragmento-rota">
              <MapaDemo />
              <p>
                <span className="lp-dot" /> Sua entrega é a próxima
              </p>
            </div>
            <span className="lp-universo-legenda">
              Um encontro de possibilidades.
            </span>
          </div>
        </section>
        <div className="lp-faixa" aria-label="Recursos do Jaaa">
          <span>
            <IconeConversa /> Converse
          </span>
          <i aria-hidden="true">↗</i>
          <span>
            <IconeLoja /> Encontre empresas
          </span>
          <i aria-hidden="true">↗</i>
          <span>
            <IconeCesta /> Faça seu pedido
          </span>
          <i aria-hidden="true">↗</i>
          <span>Acompanhe a entrega</span>
        </div>
        <section
          id="como-funciona"
          className="lp-intro lp-container"
          data-revelar
        >
          <p className="lp-eyebrow">Menos idas e vindas. Mais conexão.</p>
          <h2>
            Começa com um “oi”.
            <br />
            Continua com muito mais.
          </h2>
          <p>
            Fale com pessoas e empresas da sua região, conheça produtos e
            serviços locais e faça pedidos. Tudo conectado à conversa que você
            já está tendo.
          </p>
        </section>
        <section id="para-voce" className="lp-historia lp-container">
          <div className="lp-historia-texto" data-revelar>
            <p className="lp-eyebrow">01 / Para o seu dia a dia</p>
            <h2>
              Você conversa.
              <br />E compra por ali mesmo.
            </h2>
            <p>
              Do “qual é o cardápio?” ao seu pedido, sem sair da conversa.
              Explore categorias, escolha produtos e monte do seu jeito.
            </p>
            <ul className="lp-lista">
              <li>Conversas com pessoas e empresas</li>
              <li>Produtos e cardápio dentro do chat</li>
              <li>Montagem do produto e carrinho</li>
            </ul>
            <CriarConta texto="Começar pelo navegador" />
          </div>
          <ConversaPedidoDemo />
        </section>
        <section className="lp-acompanhamento">
          <div className="lp-container">
            <div className="lp-secao-titulo" data-revelar>
              <p className="lp-eyebrow">02 / Do pedido até a sua porta</p>
              <h2>
                Acompanhe cada etapa.
                <br />
                <em>Saiba quando é a sua vez.</em>
              </h2>
              <p>
                Veja o progresso do pedido e quem faz a entrega. Quando houver
                uma fila, o Jaaa mostra sua posição. Na sua vez, acompanhe o
                entregador no mapa, com distância e previsão quando disponíveis.
              </p>
            </div>
            <EntregaDemo />
          </div>
        </section>
        <section id="empresas" className="lp-historia lp-container">
          <div className="lp-historia-texto" data-revelar>
            <p className="lp-eyebrow">03 / Para quem empreende</p>
            <h2>
              Sua empresa.
              <br />
              Mais perto do cliente.
            </h2>
            <p>
              Restaurante, pizzaria ou outro negócio local: apresente seus
              produtos e receba pedidos onde a conversa já acontece.
            </p>
            <ul className="lp-lista">
              <li>Atendimento e produtos no mesmo ambiente</li>
              <li>Pedidos organizados para acompanhar a operação</li>
              <li>Logística conectada aos entregadores</li>
            </ul>
            <CriarConta texto="Trazer minha empresa" />
          </div>
          <div className="lp-empresa-visual" data-revelar>
            <span className="lp-eyebrow">Uma conversa conecta a operação</span>
            <div className="lp-operacao">
              <div>
                <IconeConversa />
                <strong>Cliente</strong>
                <span>Conversa</span>
              </div>
              <span aria-hidden="true">→</span>
              <div>
                <IconeLoja />
                <strong>Sua empresa</strong>
                <span>Cardápio → pedido</span>
              </div>
              <span aria-hidden="true">→</span>
              <div>
                <IconeCesta />
                <strong>Entrega</strong>
                <span>Organização da saída</span>
              </div>
            </div>
            <p>
              Da primeira mensagem à entrega.
              <br />
              <strong>Tudo no mesmo ecossistema.</strong>
            </p>
            <Image
              src="/jaaa-logo-login.png"
              alt="Jaaa"
              width={1020}
              height={275}
              sizes="180px"
              className="lp-empresa-logo"
            />
          </div>
        </section>
        <section id="entregadores" className="lp-entregadores">
          <div className="lp-container lp-historia">
            <RotaEntregadorDemo />
            <div className="lp-historia-texto" data-revelar>
              <p className="lp-eyebrow">04 / Para quem faz acontecer</p>
              <h2>
                Mais entregas.
                <br />
                Menos caminho
                <br />
                desnecessário.
              </h2>
              <p>
                Receba e execute entregas com uma rota organizada. Veja a
                sequência das paradas, a próxima entrega e as informações
                necessárias para seguir.
              </p>
              <p>
                O Jaaa reúne múltiplas entregas em uma saída e ajuda a otimizar
                o percurso.
              </p>
              <CriarConta texto="Usar como entregador" />
            </div>
          </div>
        </section>
        <section id="acessar" className="lp-acessar lp-container" data-revelar>
          <Image
            src="/landing/jaaa-simbolo.webp"
            alt=""
            width={400}
            height={400}
            sizes="80px"
          />
          <p className="lp-eyebrow">Seu próximo “oi” pode começar aqui.</p>
          <h2>
            Abra o Jaaa.
            <br />O resto se conecta.
          </h2>
          <p>Use pelo navegador ou baixe o aplicativo.</p>
          <div className="lp-acesso-opcoes">
            <div>
              <h3>Use no navegador</h3>
              <p>
                No computador ou no celular.
                <br />
                Sem precisar instalar.
              </p>
              <CriarConta texto="Criar conta e começar" />
              <Link className="lp-link" href="/entrar">
                Já tenho conta · Entrar
              </Link>
            </div>
            <div>
              <h3>Baixar o aplicativo</h3>
              <p>Tenha o Jaaa também em aplicativo.</p>
              {download ? (
                <a href={download} className="lp-botao">
                  Baixar aplicativo <span aria-hidden="true">↓</span>
                </a>
              ) : (
                <span className="lp-app-indisponivel">Download em breve</span>
              )}
              <p className="lp-pequeno">
                {download
                  ? "Download oficial do Jaaa."
                  : "Enquanto isso, use todos os recursos pela Web."}
              </p>
            </div>
          </div>
        </section>
      </main>
      <footer className="lp-footer lp-container">
        <Image
          src="/jaaa-logo-login.png"
          alt="Jaaa"
          width={1020}
          height={275}
          className="lp-logo"
        />
        <p>Pessoas, empresas e entregas. Tudo conectado.</p>
        <Link href="/entrar">Entrar</Link>
        <a href="#conteudo">Voltar ao topo ↑</a>
      </footer>
    </div>
  );
}
