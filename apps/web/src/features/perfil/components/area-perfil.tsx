"use client";

import {
  ROTULO_STATUS,
  ROTULO_VISIBILIDADE,
  statusEscolhidoSchema,
  visibilidadePerfilSchema,
  type MeuPerfil,
  type StatusEscolhido,
  type VisibilidadePerfil,
} from "@jaa/contratos";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { AvatarIdentidade } from "@/components/avatar-identidade";
import { Aviso, Botao, CampoSelecao, CampoTexto, CampoTextoLongo, Cartao, Carregando, Secao } from "@/components/ui/primitivos";
import { buscarMeuPerfil, enviarFotoPerfil, removerFoto, salvarPerfil, salvarPrivacidade } from "../lib/api-perfil";
import { FormularioSenha } from "./formulario-senha";

/*
 * PERFIL da identidade ATUANTE — pessoa ou empresa, a mesma tela.
 *
 * Três blocos, na ordem em que as pessoas pensam: quem eu sou (foto, nome, frase), como estou
 * (status escolhido) e quem vê o quê (privacidade). A conta (senha) fica por último porque é
 * configuração, não identidade.
 */

export function AreaPerfil({ ehEmpresa }: { ehEmpresa: boolean }) {
  const [perfil, setPerfil] = useState<MeuPerfil | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let ativo = true;
    void buscarMeuPerfil().then((resposta) => {
      if (!ativo) return;
      if (resposta.ok) setPerfil(resposta.dados);
      else setErro(resposta.mensagem);
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

  function enviarDados(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    setSalvando(true);
    void salvarPerfil({
      nomeExibicao: String(dados.get("nomeExibicao") ?? ""),
      fraseStatus: String(dados.get("fraseStatus") ?? ""),
      cidade: String(dados.get("cidade") ?? ""),
      sobre: String(dados.get("sobre") ?? ""),
    })
      .then((resposta) => aplicar(resposta, "Perfil salvo."))
      .finally(() => setSalvando(false));
  }

  function mudarPrivacidade(campo: string, valor: string) {
    setSalvando(true);
    void salvarPrivacidade({ [campo]: valor } as never)
      .then((resposta) => aplicar(resposta, "Preferência salva."))
      .finally(() => setSalvando(false));
  }

  if (!perfil) return erro ? <Aviso tom="erro">{erro}</Aviso> : <Carregando />;

  return (
    <div className="flex flex-col gap-8">
      <Secao titulo={ehEmpresa ? "Perfil da empresa" : "Meu perfil"} descricao={ehEmpresa ? "É isto que seus clientes veem na conversa." : "É isto que as outras pessoas veem de você."}>
        <Cartao className="flex flex-col gap-4 p-4">
          <FotoDoPerfil perfil={perfil} aoTrocar={(atualizado) => setPerfil(atualizado)} aoErrar={setErro} />

          <form onSubmit={enviarDados} className="flex flex-col gap-4">
            <CampoTexto id="perfil-nome" rotulo="Nome" name="nomeExibicao" defaultValue={perfil.nomeExibicao} maxLength={50} required autoComplete="name" />
            <CampoTexto id="perfil-usuario" rotulo="@usuario" value={`@${perfil.nomeUsuario}`} readOnly disabled dica="O @usuario é seu endereço no Jaa e não muda por aqui." />
            <CampoTexto
              id="perfil-frase"
              rotulo="Frase de status"
              name="fraseStatus"
              defaultValue={perfil.fraseStatus ?? ""}
              maxLength={140}
              placeholder={ehEmpresa ? "Entregamos até 22h" : "Respondo à noite"}
              dica="Texto curto que aparece junto do seu nome. Opcional."
            />
            <CampoTexto id="perfil-cidade" rotulo="Cidade" name="cidade" defaultValue={perfil.cidade ?? ""} maxLength={80} placeholder="Belo Horizonte" dica="Opcional." />
            <CampoTextoLongo id="perfil-sobre" rotulo={ehEmpresa ? "Sobre a empresa" : "Sobre você"} name="sobre" defaultValue={perfil.sobre ?? ""} maxLength={500} dica="Opcional, até 500 caracteres." />
            <Botao type="submit" disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar perfil"}
            </Botao>
          </form>
        </Cartao>
      </Secao>

      <Secao titulo="Status" descricao="Você escolhe como aparece. É diferente de estar conectado agora — isso o Jaa detecta sozinho.">
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
                setSalvando(true);
                void salvarPrivacidade({ buscavelPorTelefone: evento.target.checked })
                  .then((resposta) => aplicar(resposta, "Preferência salva."))
                  .finally(() => setSalvando(false));
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

      {!ehEmpresa && (
        <Secao titulo="Conta" descricao="Sua senha para entrar sem esperar código.">
          <FormularioSenha />
        </Secao>
      )}

      {aviso && <p role="status" className="text-sm text-marca">{aviso}</p>}
      {erro && <Aviso tom="erro">{erro}</Aviso>}
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
                void removerFoto()
                  .then(() => buscarMeuPerfil())
                  .then((atualizado) => {
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
