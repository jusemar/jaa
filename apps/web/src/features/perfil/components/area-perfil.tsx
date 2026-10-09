"use client";

import {
  ROTULO_STATUS,
  ROTULO_VISIBILIDADE,
  perfilFoiAlterado,
  statusEscolhidoSchema,
  visibilidadePerfilSchema,
  type CamposPerfilEditados,
  type MeuPerfil,
  type StatusEscolhido,
  type VisibilidadePerfil,
} from "@jaa/contratos";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { AvatarIdentidade } from "@/components/avatar-identidade";
import { avisar } from "@/components/ui/avisos";
import { Aviso, Botao, CampoSelecao, CampoTexto, CampoTextoLongo, Cartao, Carregando, Secao } from "@/components/ui/primitivos";
import { executarComFeedback } from "@/features/profissional/lib/feedback";
import { buscarMeuPerfil, enviarFotoPerfil, removerFoto, salvarPerfil, salvarPrivacidade } from "../lib/api-perfil";
import { AreaPerfilProfissional } from "@/features/profissional/components/area-perfil-profissional";
import { EntradaPerfilProfissional } from "@/features/profissional/components/entrada-perfil-profissional";
import { LinkDoJaa } from "@/features/link/components/link-do-jaa";
import { ContaESeguranca } from "./conta-e-seguranca";

/*
 * PERFIL da identidade ATUANTE — pessoa ou empresa, a mesma tela.
 *
 * ORGANIZADO POR ÁREAS (abas): só UMA aparece por vez, então a página deixa de ser uma coluna longa
 * com tudo aberto. Cada aba responde a uma pergunta:
 *   Perfil              → quem eu sou (foto, nome, frase, link) e como estou (status);
 *   Privacidade         → quem vê o quê;
 *   Conta e segurança   → como eu entro (telefone, e-mail, senha, PIN) — só da pessoa;
 *   Perfil profissional → o que eu ofereço — só da pessoa;
 *   Minhas empresas     → as empresas desta conta — só da pessoa;
 *   Horários            → quando a empresa recebe pedidos — só da empresa.
 * Nenhuma funcionalidade saiu: mudou só onde cada uma fica.
 */

type AbaPerfil = "perfil" | "privacidade" | "conta" | "profissional" | "empresas" | "horarios";

const ROTULO_DA_ABA: Record<AbaPerfil, string> = {
  perfil: "Perfil",
  privacidade: "Privacidade",
  conta: "Conta e segurança",
  profissional: "Perfil profissional",
  empresas: "Minhas empresas",
  horarios: "Horários",
};

/** As abas de cada identidade, na ordem em que aparecem. */
export function abasDoPerfil(ehEmpresa: boolean, tem: { empresas: boolean; horarios: boolean }): AbaPerfil[] {
  if (ehEmpresa) return ["perfil", "privacidade", ...(tem.horarios ? (["horarios"] as const) : [])];
  return ["perfil", "privacidade", "conta", "profissional", ...(tem.empresas ? (["empresas"] as const) : [])];
}

export function AreaPerfil({
  ehEmpresa,
  empresas,
  horarios,
}: {
  ehEmpresa: boolean;
  /** "Minhas empresas" da conta (pessoa) e "Horários de funcionamento" (empresa): montados por quem conhece a conta/empresa. */
  empresas?: ReactNode;
  horarios?: ReactNode;
}) {
  const [aba, setAba] = useState<AbaPerfil>("perfil");
  const [perfil, setPerfil] = useState<MeuPerfil | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  /*
   * Campos do bloco "Meu perfil" como estão na tela. O botão Salvar compara isto com o ÚLTIMO estado
   * salvo (`perfil`): sem diferença fica desabilitado — a mesma regra do app (`perfilFoiAlterado`).
   */
  const [campos, setCampos] = useState<CamposPerfilEditados | null>(null);
  const [salvandoPerfil, setSalvandoPerfil] = useState(false);
  // Perfil profissional abre DENTRO de Perfil (sem item novo no menu); só para a pessoa.
  const [profissionalAberto, setProfissionalAberto] = useState(false);

  useEffect(() => {
    let ativo = true;
    void buscarMeuPerfil().then((resposta) => {
      if (!ativo) return;
      if (resposta.ok) {
        setPerfil(resposta.dados);
        setCampos(camposDe(resposta.dados));
      } else setErro(resposta.mensagem);
    });
    return () => {
      ativo = false;
    };
  }, []);

  function aplicar(resposta: Awaited<ReturnType<typeof salvarPerfil>>, mensagem: string) {
    if (resposta.ok) {
      setPerfil(resposta.dados);
      setErro(null);
      setAviso(mensagem);
    } else {
      setErro(resposta.mensagem);
    }
  }

  // Toast (mesmo sistema do resto do Jaa) + o aviso inline de sempre, que continua na tela.
  function enviarDados(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    // Um envio por vez, e só quando algo mudou (Enter no campo não burla o botão desabilitado).
    if (salvandoPerfil || !perfil || !campos || !perfilFoiAlterado(perfil, campos)) return;
    setSalvandoPerfil(true);
    setAviso(null);
    void executarComFeedback(salvarPerfil({ nomeExibicao: campos.nome, fraseStatus: campos.frase, cidade: campos.cidade, sobre: campos.sobre }), "Perfil salvo", avisar)
      .then((resposta) => {
        aplicar(resposta, "Perfil salvo.");
        // A resposta da API vira o novo "último estado salvo": o botão desabilita até a próxima edição.
        // Em erro, os campos ficam como a pessoa deixou.
        if (resposta.ok) setCampos(camposDe(resposta.dados));
      })
      .finally(() => setSalvandoPerfil(false));
  }

  const editar = (campo: keyof CamposPerfilEditados) => (evento: { target: { value: string } }) => {
    setAviso(null);
    setCampos((atuais) => (atuais ? { ...atuais, [campo]: evento.target.value } : atuais));
  };

  function mudarPrivacidade(campo: string, valor: string) {
    void executarComFeedback(salvarPrivacidade({ [campo]: valor } as never), "Preferência salva", avisar)
      .then((resposta) => aplicar(resposta, "Preferência salva."));
  }

  if (profissionalAberto && !ehEmpresa) return <AreaPerfilProfissional aoVoltar={() => setProfissionalAberto(false)} />;

  if (!perfil || !campos) return erro ? <Aviso tom="erro">{erro}</Aviso> : <Carregando />;
  const alterado = perfilFoiAlterado(perfil, campos);

  const abas = abasDoPerfil(ehEmpresa, { empresas: Boolean(empresas), horarios: Boolean(horarios) });

  function trocarDeAba(proxima: AbaPerfil) {
    // Mensagens de uma área não acompanham a pessoa para a outra.
    setAviso(null);
    setErro(null);
    setAba(proxima);
  }

  return (
    <div className="flex flex-col gap-6">
      <div role="tablist" aria-label="Áreas do perfil" className="flex overflow-x-auto border-b border-borda">
        {abas.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            id={`aba-perfil-${item}`}
            aria-selected={aba === item}
            aria-controls={`painel-perfil-${item}`}
            onClick={() => trocarDeAba(item)}
            className={`shrink-0 border-b-2 px-4 py-2 text-sm font-medium ${aba === item ? "border-marca text-marca" : "border-transparent text-conteudo-suave"}`}
          >
            {ROTULO_DA_ABA[item]}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`painel-perfil-${aba}`} aria-labelledby={`aba-perfil-${aba}`} className="flex flex-col gap-8">
      {aba === "perfil" && (
      <>
      <Secao titulo={ehEmpresa ? "Perfil da empresa" : "Meu perfil"} descricao={ehEmpresa ? "É isto que seus clientes veem na conversa." : "É isto que as outras pessoas veem de você."}>
        <Cartao className="flex flex-col gap-4 p-4">
          <FotoDoPerfil perfil={perfil} aoTrocar={(atualizado) => setPerfil(atualizado)} aoErrar={setErro} />

          <form onSubmit={enviarDados} className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
            <CampoTexto id="perfil-nome" rotulo="Nome" name="nomeExibicao" value={campos.nome} onChange={editar("nome")} maxLength={50} required autoComplete="name" />
            <CampoTexto id="perfil-usuario" rotulo="@usuario" value={`@${perfil.nomeUsuario}`} readOnly disabled dica="O @usuario é seu endereço no Jaaa e não muda por aqui." />
            <CampoTexto
              id="perfil-frase"
              rotulo="Frase de status"
              name="fraseStatus"
              value={campos.frase}
              onChange={editar("frase")}
              maxLength={140}
              placeholder={ehEmpresa ? "Entregamos até 22h" : "Respondo à noite"}
              dica="Texto curto que aparece junto do seu nome. Opcional."
            />
            <CampoTexto id="perfil-cidade" rotulo="Cidade" name="cidade" value={campos.cidade} onChange={editar("cidade")} maxLength={80} placeholder="Belo Horizonte" dica="Opcional." />
            <div className="sm:col-span-2">
              <CampoTextoLongo id="perfil-sobre" rotulo={ehEmpresa ? "Sobre a empresa" : "Sobre você"} name="sobre" value={campos.sobre} onChange={editar("sobre")} maxLength={500} dica="Opcional, até 500 caracteres." />
            </div>
            <div className="sm:col-span-2">
              <Botao type="submit" data-salvar-perfil disabled={salvandoPerfil || !alterado || campos.nome.trim() === ""}>
                {salvandoPerfil ? "Salvando…" : "Salvar perfil"}
              </Botao>
            </div>
          </form>
        </Cartao>
      </Secao>

      <Secao
        titulo="Link do Jaaa"
        descricao={
          ehEmpresa
            ? "Envie este endereço para seus clientes: ele abre a conversa com a empresa (e o cardápio) direto no navegador."
            : "Envie este endereço para quem quiser falar com você: ele abre a conversa direto no navegador."
        }
      >
        <Cartao className="p-4">
          <LinkDoJaa nomeUsuario={perfil.nomeUsuario} />
        </Cartao>
      </Secao>

      <Secao titulo="Status" descricao="Você escolhe como aparece. É diferente de estar conectado agora — isso o Jaaa detecta sozinho.">
        <Cartao className="flex flex-col gap-3 p-4">
          <div role="radiogroup" aria-label="Status" className="flex flex-wrap gap-2">
            {statusEscolhidoSchema.options.map((status: StatusEscolhido) => (
              <button
                key={status}
                type="button"
                role="radio"
                aria-checked={perfil.statusEscolhido === status}
                data-status={status}
                onClick={() => mudarPrivacidade("statusEscolhido", status)}
                className={`min-h-11 rounded-jaa-compacto border px-4 text-sm font-medium sm:min-h-10 ${
                  perfil.statusEscolhido === status ? "border-marca bg-marca-suave text-marca" : "border-borda bg-superficie text-conteudo-suave"
                }`}
              >
                {ROTULO_STATUS[status]}
              </button>
            ))}
          </div>
          {perfil.statusEscolhido === "invisivel" && (
            <Aviso tom="atencao">Invisível: ninguém vê seu status nem se você está conectado. Você continua conversando normalmente.</Aviso>
          )}
        </Cartao>
      </Secao>
      </>
      )}

      {aba === "privacidade" && (
      <Secao titulo="Privacidade" descricao="Quem pode ver cada coisa. Nada aqui muda quem pode falar com você.">
        <Cartao className="flex flex-col gap-4 p-4">
          <SeletorVisibilidade id="visibilidadeFoto" rotulo="Quem vê minha foto" valor={perfil.privacidade.visibilidadeFoto} aoMudar={mudarPrivacidade} />
          <SeletorVisibilidade id="visibilidadeStatus" rotulo="Quem vê meu status e minha frase" valor={perfil.privacidade.visibilidadeStatus} aoMudar={mudarPrivacidade} />
          <SeletorVisibilidade id="visibilidadePresenca" rotulo="Quem vê quando estou conectado" valor={perfil.privacidade.visibilidadePresenca} aoMudar={mudarPrivacidade} />

          <label className="flex items-start gap-3 rounded-jaa bg-superficie-suave p-3 text-sm">
            <input
              type="checkbox"
              name="buscavelPorTelefone"
              checked={perfil.privacidade.buscavelPorTelefone}
              onChange={(evento) => {
                void executarComFeedback(salvarPrivacidade({ buscavelPorTelefone: evento.target.checked }), "Preferência salva", avisar)
                  .then((resposta) => aplicar(resposta, "Preferência salva."));
              }}
              className="mt-0.5 h-5 w-5 shrink-0"
            />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">Deixar que me encontrem pelo meu celular</span>
              <span className="text-conteudo-suave">Desligado, ninguém acha você digitando seu número. Seu telefone nunca aparece no resultado da busca.</span>
            </span>
          </label>
        </Cartao>
      </Secao>
      )}

      {aba === "conta" && !ehEmpresa && <ContaESeguranca />}

      {aba === "profissional" && !ehEmpresa && <EntradaPerfilProfissional aoAbrir={() => setProfissionalAberto(true)} />}

      {aba === "empresas" && !ehEmpresa && empresas}

      {aba === "horarios" && ehEmpresa && horarios}

      {aviso && <p role="status" className="text-sm text-marca">{aviso}</p>}
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      </div>
    </div>
  );
}

function SeletorVisibilidade({ id, rotulo, valor, aoMudar }: { id: string; rotulo: string; valor: VisibilidadePerfil; aoMudar: (campo: string, valor: string) => void }) {
  return (
    <CampoSelecao id={id} rotulo={rotulo} name={id} value={valor} onChange={(evento) => aoMudar(id, evento.target.value)}>
      {visibilidadePerfilSchema.options.map((opcao: VisibilidadePerfil) => (
        <option key={opcao} value={opcao}>
          {ROTULO_VISIBILIDADE[opcao]}
        </option>
      ))}
    </CampoSelecao>
  );
}

function FotoDoPerfil({ perfil, aoTrocar, aoErrar }: { perfil: MeuPerfil; aoTrocar: (perfil: MeuPerfil) => void; aoErrar: (erro: string | null) => void }) {
  const entrada = useRef<HTMLInputElement | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function trocar(arquivo: File) {
    setEnviando(true);
    aoErrar(null);
    const resposta = await enviarFotoPerfil(arquivo);
    if (!resposta.ok) aoErrar(resposta.mensagem);
    else {
      const atualizado = await buscarMeuPerfil();
      if (atualizado.ok) aoTrocar(atualizado.dados);
    }
    setEnviando(false);
  }

  return (
    <div className="flex items-center gap-4">
      <AvatarIdentidade identidade={perfil} fotoUrl={perfil.fotoUrl} tamanho="grande" />
      <div className="flex flex-col gap-2">
        <input
          ref={entrada}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          aria-label="Escolher imagem do perfil"
          onChange={(evento) => {
            const arquivo = evento.target.files?.[0];
            if (arquivo) void trocar(arquivo);
            evento.target.value = "";
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Botao aparencia="secundario" disabled={enviando} onClick={() => entrada.current?.click()}>
            {enviando ? "Enviando…" : perfil.fotoUrl ? "Trocar foto" : "Adicionar foto"}
          </Botao>
          {perfil.fotoUrl && (
            <Botao
              aparencia="discreto"
              disabled={enviando}
              onClick={() => {
                setEnviando(true);
                aoErrar(null);
                void removerFoto()
                  .then(async (remocao) => {
                    if (!remocao.ok) return aoErrar(remocao.mensagem);
                    const atualizado = await buscarMeuPerfil();
                    if (atualizado.ok) aoTrocar(atualizado.dados);
                  })
                  .finally(() => setEnviando(false));
              }}
            >
              Remover
            </Botao>
          )}
        </div>
        <p className="text-xs text-conteudo-suave">JPEG, PNG ou WebP, até 8 MB. Sem foto, aparecem suas iniciais.</p>
      </div>
    </div>
  );
}

// O que está salvo, na forma dos campos da tela (vazio no lugar de `null`).
function camposDe(perfil: MeuPerfil): CamposPerfilEditados {
  return { nome: perfil.nomeExibicao, frase: perfil.fraseStatus ?? "", cidade: perfil.cidade ?? "", sobre: perfil.sobre ?? "" };
}
