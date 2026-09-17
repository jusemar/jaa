"use client";

import type { Contato } from "@jaa/contratos";
import { useEffect, useState } from "react";
import { AvatarIdentidade } from "@/components/avatar-identidade";
import { Aviso, Botao, Cartao, Carregando, EstadoVazio, Secao, Selo } from "@/components/ui/primitivos";
import { listarContatos, removerContato } from "../lib/api-contatos";
import { PesquisaJaa } from "./pesquisa-jaa";

/*
 * AGENDA da identidade atuante. A lista é UNILATERAL: são as pessoas e empresas que EU salvei —
 * salvar alguém não me coloca na agenda dela, e remover não avisa ninguém.
 *
 * A pesquisa fica no topo porque é assim que se usa uma agenda: procura-se antes de rolar.
 */
export function AreaContatos({ aoAbrirConversa }: { aoAbrirConversa: (nomeUsuario: string) => void }) {
  const [contatos, setContatos] = useState<Contato[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function recarregar() {
    const resposta = await listarContatos();
    if (resposta.ok) {
      setContatos(resposta.dados.contatos);
      setErro(null);
    } else setErro(resposta.mensagem);
  }

  useEffect(() => {
    let ativo = true;
    void listarContatos().then((resposta) => {
      if (!ativo) return;
      if (resposta.ok) setContatos(resposta.dados.contatos);
      else setErro(resposta.mensagem);
    });
    return () => {
      ativo = false;
    };
  }, []);

  async function remover(contato: Contato) {
    const resposta = await removerContato(contato.identidade.identidadeId);
    if (!resposta.ok) {
      setErro(resposta.mensagem);
      return;
    }
    setContatos((atual) => atual?.filter((outro) => outro.identidade.identidadeId !== contato.identidade.identidadeId) ?? null);
  }

  return (
    <div className="flex flex-col gap-6">
      <Secao titulo="Pesquisar no Jaa" descricao="Procure pelo nome ou @usuario. Seus contatos aparecem primeiro.">
        <PesquisaJaa
          aoAbrirConversa={aoAbrirConversa}
          aoSalvarContato={() => {
            void recarregar();
          }}
        />
      </Secao>

      <Secao titulo="Meus contatos" descricao={contatos ? `${contatos.length} salvo${contatos.length === 1 ? "" : "s"}` : undefined}>
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        {contatos === null && !erro && <Carregando texto="Carregando contatos…" />}
        {contatos?.length === 0 && (
          <EstadoVazio
            titulo="Sua agenda está vazia"
            descricao="Procure alguém pelo nome ou @usuario na busca acima e toque em Salvar. Você pode conversar com qualquer pessoa mesmo sem salvá-la."
          />
        )}
        {contatos && contatos.length > 0 && (
          <Cartao>
            <ul aria-label="Meus contatos" className="flex flex-col divide-y divide-borda">
              {contatos.map((contato) => (
                <li key={contato.identidade.identidadeId} data-contato={contato.identidade.identidadeId} className="flex items-center gap-2 px-2">
                  <button
                    type="button"
                    onClick={() => aoAbrirConversa(contato.identidade.nomeUsuario)}
                    className="flex min-h-16 min-w-0 flex-1 items-center gap-3 px-1 text-left hover:bg-superficie-suave"
                  >
                    <AvatarIdentidade identidade={contato.identidade} />
                    <span className="flex min-w-0 flex-col">
                      <span className="flex items-center gap-1.5 truncate text-sm font-medium">
                        {contato.apelido ?? contato.identidade.nomeExibicao}
                        {contato.identidade.tipo === "empresarial" && <Selo>Empresa</Selo>}
                      </span>
                      <span className="truncate text-xs text-conteudo-suave">@{contato.identidade.nomeUsuario}</span>
                    </span>
                  </button>
                  <Botao
                    aparencia="discreto"
                    data-remover-contato={contato.identidade.identidadeId}
                    aria-label={`Remover ${contato.identidade.nomeExibicao} dos contatos`}
                    onClick={() => void remover(contato)}
                  >
                    Remover
                  </Botao>
                </li>
              ))}
            </ul>
          </Cartao>
        )}
      </Secao>
    </div>
  );
}
