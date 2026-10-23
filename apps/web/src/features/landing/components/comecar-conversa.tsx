"use client";

import { TERMO_BUSCA_TAMANHO_MINIMO, type IdentidadePublica, type IdentidadeVisivel } from "@jaa/contratos";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useContext, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { AvatarIdentidade } from "@/components/avatar-identidade";
import { IconeBusca, IconeCalendario, IconeConversa, IconeLoja, IconeSacola } from "@/components/ui/icones";
import { pesquisarNoJaa } from "@/features/contatos/lib/api-contatos";
import { garantirSessaoDeVisitante } from "@/features/link/lib/api-visitante";
import type { DestinoDoLink } from "@/features/link/lib/link-do-jaa";
import { buscarIdentidadePublica } from "@/features/perfil/lib/api-perfil";
import { agruparPorIntencao, usuariosSugeridosNaHome, type IntencaoHome } from "../lib/sugestoes-home";
import { ComecarConversaNaHome } from "./entrada-publica";

/*
 * "COM QUEM VOCÊ QUER FALAR?" — a porta de entrada REAL da Home. Nada aqui é demonstração:
 * - antes de digitar: sugestões de perfis reais (consulta pública, sem sessão);
 * - ao digitar: a sessão de VISITANTE de sempre é reaproveitada ou aberta (`garantirSessaoDeVisitante`)
 *   e a pesquisa é a mesma do mensageiro (`/busca`: pessoas e empresas, sem visitantes, sem telefone);
 * - ao escolher: o app real abre já na conversa, pelo mesmo caminho do Link do Jaa.
 * A sessão só nasce quando a pessoa realmente pesquisa ou escolhe alguém: olhar a Home não cria nada.
 */
type Pessoa = Pick<IdentidadeVisivel, "identidadeId" | "tipo" | "nomeExibicao" | "nomeUsuario" | "fotoUrl">;
type Busca =
  | { fase: "parado" }
  | { fase: "buscando" }
  | { fase: "pronta"; termo: string; resultados: Pessoa[] }
  | { fase: "falha"; mensagem: string };

const ESPERA_DIGITACAO_MS = 350;

export function ComecarConversa() {
  const comecarNaHome = useContext(ComecarConversaNaHome);
  const router = useRouter();
  const idCampo = useId();
  const [termo, setTermo] = useState("");
  const [busca, setBusca] = useState<Busca>({ fase: "parado" });
  const [sugestoes, setSugestoes] = useState<IdentidadePublica[]>([]);
  const [abrindo, setAbrindo] = useState<string | null>(null);
  const [erroAoAbrir, setErroAoAbrir] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const ultimaBusca = useRef(0);

  // Sugestões: só leitura pública, na ordem da curadoria; quem não existe mais fica de fora.
  useEffect(() => {
    let ativo = true;
    const usuarios = usuariosSugeridosNaHome(process.env.NEXT_PUBLIC_JAA_SUGESTOES_HOME);
    void Promise.all(usuarios.map((usuario) => buscarIdentidadePublica(usuario))).then((respostas) => {
      if (ativo) setSugestoes(respostas.flatMap((resposta) => (resposta.ok ? [resposta.dados] : [])));
    });
    return () => {
      ativo = false;
    };
  }, []);

  const termoLimpo = termo.trim().replace(/^@/, "");
  const deveBuscar = termoLimpo.length >= TERMO_BUSCA_TAMANHO_MINIMO;

  useEffect(() => {
    if (!deveBuscar) return;
    const numero = ++ultimaBusca.current;
    const atual = () => numero === ultimaBusca.current;
    const espera = window.setTimeout(() => {
      setBusca({ fase: "buscando" });
      void garantirSessaoDeVisitante().then(async (sessao) => {
        if (!atual()) return;
        if (!sessao.ok) {
          setBusca({ fase: "falha", mensagem: sessao.mensagem });
          return;
        }
        const resposta = await pesquisarNoJaa(termo.trim());
        if (!atual()) return;
        if (!resposta.ok) {
          setBusca({ fase: "falha", mensagem: resposta.mensagem });
          return;
        }
        const resultados = [...resposta.dados.contatos, ...resposta.dados.externos].map((item) => item.identidade);
        setBusca({ fase: "pronta", termo: termo.trim(), resultados });
      });
    }, ESPERA_DIGITACAO_MS);
    return () => window.clearTimeout(espera);
  }, [termo, deveBuscar, tentativa]);

  async function escolher(pessoa: Pick<Pessoa, "nomeUsuario" | "nomeExibicao">, temCardapio?: boolean) {
    setErroAoAbrir(null);
    setAbrindo(pessoa.nomeUsuario);
    // Cardápio só se souber: resultado de pesquisa não traz isso, a consulta pública traz.
    let abrirCardapio = temCardapio;
    if (abrirCardapio === undefined) {
      const publica = await buscarIdentidadePublica(pessoa.nomeUsuario);
      if (!publica.ok) {
        setAbrindo(null);
        setErroAoAbrir(publica.status === 404 ? "Este perfil não está disponível para conversa." : publica.mensagem);
        return;
      }
      abrirCardapio = publica.dados.temCardapio;
    }
    const destino: DestinoDoLink = { nomeUsuario: pessoa.nomeUsuario, nomeExibicao: pessoa.nomeExibicao, abrirCardapio };
    if (comecarNaHome) comecarNaHome(destino);
    else router.push(`/@${pessoa.nomeUsuario}`);
  }

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    // Enter conversa com o primeiro resultado (o mesmo que aparece em destaque na lista).
    if (busca.fase === "pronta" && busca.resultados[0] && !abrindo) void escolher(busca.resultados[0]);
  }

  const mostrandoResultados = deveBuscar && busca.fase !== "parado";
  const idStatus = `${idCampo}-status`;

  return (
    <section className="lp-comecar" aria-labelledby={`${idCampo}-titulo`} data-comecar-conversa>
      <div className="lp-comecar-mascote" aria-hidden="true">
        <Image src="/landing/jaaa-simbolo.webp" alt="" width={400} height={400} sizes="72px" priority />
        {/* "Digitando…": a marca já está pronta para conversar. */}
        <span className="lp-comecar-digitando">
          <i />
          <i />
          <i />
        </span>
      </div>
      <h2 id={`${idCampo}-titulo`} className="lp-comecar-titulo">
        Com quem você quer falar?
      </h2>
      <p className="lp-comecar-apoio">Digite quem você procura — uma pessoa ou empresa — e comece a conversar agora. Sem cadastro.</p>

      <form role="search" className="lp-comecar-form" onSubmit={enviar}>
        <label htmlFor={idCampo} className="lp-comecar-campo">
          <IconeBusca className="lp-comecar-icone" aria-hidden="true" />
          <span className="sr-only">Nome ou @usuario de quem você quer encontrar</span>
          <input
            id={idCampo}
            data-campo-comecar
            className="campo-sem-contorno"
            // Texto (não "search"): o "×" nativo do navegador não tem a cara do Jaaa; o formulário já é role="search".
            type="text"
            inputMode="search"
            value={termo}
            onChange={(evento) => {
              setTermo(evento.target.value);
              setErroAoAbrir(null);
            }}
            placeholder="Digite um nome ou @usuario"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="search"
            aria-describedby={idStatus}
          />
        </label>
      </form>

      <p id={idStatus} role="status" className="lp-comecar-status">
        {abrindo
          ? "Abrindo a conversa…"
          : !deveBuscar
            ? ""
            : busca.fase === "buscando"
              ? "Procurando no Jaaa…"
              : busca.fase === "pronta"
                ? busca.resultados.length === 0
                  ? `Ninguém encontrado com “${busca.termo}”. Confira o nome ou o @usuario.`
                  : `${busca.resultados.length} resultado${busca.resultados.length === 1 ? "" : "s"}`
                : ""}
      </p>

      {(erroAoAbrir || (deveBuscar && busca.fase === "falha")) && (
        <div role="alert" className="lp-comecar-falha" data-falha-comecar>
          <span>{erroAoAbrir ?? (busca.fase === "falha" ? busca.mensagem : "")}</span>
          {!erroAoAbrir && (
            <button type="button" onClick={() => setTentativa((atual) => atual + 1)}>
              Tentar novamente
            </button>
          )}
        </div>
      )}

      {mostrandoResultados && busca.fase === "pronta" && busca.resultados.length > 0 && (
        <ul aria-label="Resultados no Jaaa" className="lp-comecar-lista" data-resultados-comecar>
          {busca.resultados.map((pessoa) => (
            <li key={pessoa.identidadeId}>
              <ItemPessoa pessoa={pessoa} abrindo={abrindo === pessoa.nomeUsuario} desativado={abrindo !== null} aoEscolher={() => void escolher(pessoa)} />
            </li>
          ))}
        </ul>
      )}

      {!mostrandoResultados && sugestoes.length > 0 && (
        /*
         * ATALHOS por intenção: ensinam em um olhar o que dá para fazer (pessoa, restaurante, empresa,
         * serviço) — leves, abaixo do campo, que continua sendo a ação principal.
         */
        <div className="lp-comecar-atalhos" data-sugestoes-comecar>
          <p className="lp-comecar-atalhos-legenda">Ou comece por um destes:</p>
          <ul aria-label="Atalhos para começar">
            {agruparPorIntencao(sugestoes).map(({ intencao, perfis }) => {
              const { pergunta, Icone } = INTENCOES[intencao];
              return (
                <li key={intencao} className="lp-comecar-intencao" data-intencao={intencao}>
                  <span className="lp-comecar-intencao-icone" aria-hidden="true">
                    <Icone />
                  </span>
                  <span className="lp-comecar-intencao-pergunta">{pergunta}</span>
                  <span className="lp-comecar-chips">
                    {perfis.map((perfil) => (
                      <Atalho
                        key={perfil.identidadeId}
                        perfil={perfil}
                        intencao={intencao}
                        abrindo={abrindo === perfil.nomeUsuario}
                        desativado={abrindo !== null}
                        aoEscolher={() => void escolher(perfil, perfil.temCardapio)}
                      />
                    ))}
                  </span>
                </li>
              );
            })}
            {/* Serviço: profissionais ainda só se encontram com conta (o perfil público não diz o serviço). */}
            <li className="lp-comecar-intencao" data-intencao="servico">
              <span className="lp-comecar-intencao-icone" aria-hidden="true">
                <IconeCalendario />
              </span>
              <span className="lp-comecar-intencao-pergunta">Precisa de um serviço?</span>
              <span className="lp-comecar-servico">
                Cabeleireiro, manicure, eletricista… <Link href="/cadastro">Com uma conta</Link>, você encontra profissionais perto de você.
              </span>
            </li>
          </ul>
        </div>
      )}
    </section>
  );
}

const INTENCOES: Record<IntencaoHome, { pergunta: string; Icone: typeof IconeConversa }> = {
  conversar: { pergunta: "Quer falar com alguém?", Icone: IconeConversa },
  "pedir-comida": { pergunta: "Quer pedir comida?", Icone: IconeSacola },
  "falar-com-empresa": { pergunta: "Quer falar com uma empresa?", Icone: IconeLoja },
};

function Atalho({ perfil, intencao, abrindo, desativado, aoEscolher }: { perfil: IdentidadePublica; intencao: IntencaoHome; abrindo: boolean; desativado: boolean; aoEscolher: () => void }) {
  const acao = intencao === "pedir-comida" ? "Ver cardápio de" : "Conversar com";
  return (
    <button
      type="button"
      className="lp-comecar-chip"
      data-pessoa-comecar={perfil.nomeUsuario}
      disabled={desativado}
      aria-busy={abrindo || undefined}
      aria-label={`${acao} ${perfil.nomeExibicao} (@${perfil.nomeUsuario})`}
      onClick={aoEscolher}
    >
      <AvatarIdentidade identidade={perfil} tamanho="pequeno" />
      <span>{abrindo ? "Abrindo…" : perfil.nomeExibicao}</span>
      {intencao === "pedir-comida" && <em>Cardápio</em>}
    </button>
  );
}

function ItemPessoa({ pessoa, abrindo, desativado, aoEscolher }: { pessoa: Pessoa; abrindo: boolean; desativado: boolean; aoEscolher: () => void }) {
  return (
    <button
      type="button"
      className="lp-comecar-item"
      data-pessoa-comecar={pessoa.nomeUsuario}
      disabled={desativado}
      aria-busy={abrindo || undefined}
      aria-label={`Conversar com ${pessoa.nomeExibicao} (@${pessoa.nomeUsuario})`}
      onClick={aoEscolher}
    >
      <AvatarIdentidade identidade={pessoa} tamanho="pequeno" />
      <span className="lp-comecar-item-texto">
        <strong>{pessoa.nomeExibicao}</strong>
        <span>
          @{pessoa.nomeUsuario}
          {pessoa.tipo === "empresarial" && <em>Empresa</em>}
        </span>
      </span>
      <span className="lp-comecar-item-acao" aria-hidden="true">
        {abrindo ? "Abrindo…" : "Conversar"}
      </span>
    </button>
  );
}
