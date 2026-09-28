"use client";

import type { CatalogoServicos, PerfilProfissionalDoDono } from "@jaa/contratos";
import { useCallback, useEffect, useState } from "react";
import { avisar } from "@/components/ui/avisos";
import { IconeCheck, IconeVoltar } from "@/components/ui/icones";
import { Aviso, Botao, BotaoIcone, Cartao, Carregando, Interruptor, Secao, Selo } from "@/components/ui/primitivos";
import {
  ativarPerfilProfissional,
  buscarCatalogoProfissional,
  buscarPerfilProfissional,
  pausarPerfil,
  salvarPreferencias,
  tornarPerfilAtivo,
} from "../lib/api-perfil-profissional";
import {
  ETAPAS,
  ROTULO_SITUACAO,
  descricaoArea,
  estadoEtapa,
  etapaInicial,
  etapaVizinha,
  textoPendencias,
  type Etapa,
} from "../lib/apresentacao-perfil-profissional";
import { executarComFeedback } from "../lib/feedback";
import { SecaoAreas } from "./secao-areas";
import { SecaoAtividades } from "./secao-atividades";
import { SecaoBase } from "./secao-base";
import type { Aplicar, PropsEtapa } from "./tipos";

/*
 * PERFIL PROFISSIONAL do próprio usuário (Perfil → Perfil profissional). Quatro etapas na ordem das
 * DEPENDÊNCIAS — Base (referência de tudo) → Atividades → Área → Resumo —, com progresso visível.
 * "Salvar" persiste (com aviso de sucesso/erro); "Continuar" só muda de etapa. O servidor segue sendo a
 * autoridade: a tela sempre passa a mostrar o que ele devolveu.
 */

const TOM_SITUACAO = { ativo: "marca", incompleto: "atencao", inativo: "neutro" } as const;

export function AreaPerfilProfissional({ aoVoltar }: { aoVoltar: () => void }) {
  // undefined = carregando; null = ainda não ativou.
  const [perfil, setPerfil] = useState<PerfilProfissionalDoDono | null | undefined>(undefined);
  const [catalogo, setCatalogo] = useState<CatalogoServicos | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  // Último erro de uma ação: além do toast, fica visível na tela até a próxima ação dar certo.
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [pendente, setPendente] = useState<string | null>(null);
  const [etapaEscolhida, setEtapaEscolhida] = useState<Etapa | null>(null);
  const [atividadesPendentes, setAtividadesPendentes] = useState(false);

  useEffect(() => {
    let ativo = true;
    void Promise.all([buscarPerfilProfissional(), buscarCatalogoProfissional()]).then(([respostaPerfil, respostaCatalogo]) => {
      if (!ativo) return;
      if (respostaPerfil.ok) setPerfil(respostaPerfil.dados.perfil);
      else setErroCarga(respostaPerfil.mensagem);
      if (respostaCatalogo.ok) setCatalogo(respostaCatalogo.dados);
      else setErroCarga(respostaCatalogo.mensagem);
    });
    return () => {
      ativo = false;
    };
  }, []);

  const aplicar: Aplicar = useCallback(async (requisicao, opcoes = {}) => {
    setPendente(opcoes.chave ?? "acao");
    const resposta = await executarComFeedback(requisicao, opcoes.sucesso, avisar);
    setPendente(null);
    if (!resposta.ok) {
      setErroAcao(resposta.status === 0 ? "Sem conexão. Tente de novo." : resposta.mensagem);
      return null;
    }
    setErroAcao(null);
    setPerfil(resposta.dados.perfil);
    return resposta.dados.perfil;
  }, []);

  const aoMudarPendenciasAtividades = useCallback((valor: boolean) => setAtividadesPendentes(valor), []);

  const cabecalho = (
    <div className="flex items-center gap-2">
      <BotaoIcone aria-label="Voltar ao perfil" onClick={aoVoltar}>
        <IconeVoltar className="h-5 w-5" />
      </BotaoIcone>
      <h1 className="fonte-display text-xl font-bold text-conteudo">Perfil profissional</h1>
      {perfil && <Selo tom={TOM_SITUACAO[perfil.situacao]}>{ROTULO_SITUACAO[perfil.situacao]}</Selo>}
    </div>
  );

  if (perfil === undefined || !catalogo) {
    return (
      <div className="flex flex-col gap-4">
        {cabecalho}
        {erroCarga ? <Aviso tom="erro">{erroCarga}</Aviso> : <Carregando />}
      </div>
    );
  }

  if (perfil === null) {
    return (
      <div className="flex flex-col gap-4">
        {cabecalho}
        {erroAcao && <Aviso tom="erro">{erroAcao}</Aviso>}
        <Cartao className="flex flex-col items-start gap-3 p-6">
          <p className="fonte-display text-lg font-bold text-conteudo">Ofereça seus serviços pelo Jaa</p>
          <p className="text-sm text-conteudo-suave">Até 3 atividades, com seus horários e onde você atende.</p>
          <Botao carregando={pendente !== null} textoCarregando="Ativando…" onClick={() => void aplicar(ativarPerfilProfissional(), { sucesso: "Perfil criado" })}>
            Ativar perfil
          </Botao>
        </Cartao>
      </div>
    );
  }

  const etapa = etapaEscolhida ?? etapaInicial(perfil);

  function irPara(destino: Etapa) {
    if (destino === etapa) return;
    // Sair de Atividades com alteração não salva perderia o que foi feito: avisa em vez de sair.
    if (etapa === "atividades" && atividadesPendentes) {
      avisar.alerta("Salve ou descarte as alterações da atividade.");
      return;
    }
    setErroAcao(null);
    setEtapaEscolhida(destino);
  }

  const anterior = etapaVizinha(etapa, -1);
  const proxima = etapaVizinha(etapa, 1);
  const rotuloDe = (id: Etapa) => ETAPAS.find((item) => item.id === id)?.rotulo ?? "";
  const props: PropsEtapa = { perfil, aplicar, pendente };

  return (
    <div className="flex flex-col gap-5">
      {cabecalho}

      <nav aria-label="Etapas do perfil profissional">
        <ol className="grid grid-cols-4 gap-1">
          {ETAPAS.map((item, indice) => {
            const estado = estadoEtapa(perfil, item.id, etapa);
            return (
              <li key={item.id} className="flex flex-col">
                <button
                  type="button"
                  aria-current={estado === "atual" ? "step" : undefined}
                  onClick={() => irPara(item.id)}
                  className="flex min-h-12 flex-col items-center gap-1 rounded-jaa-compacto px-1 py-1.5 text-center hover:bg-realce"
                >
                  <span
                    className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${
                      estado === "concluida" ? "bg-marca text-marca-conteudo" : estado === "atual" ? "border-2 border-marca text-marca" : "border border-borda text-conteudo-suave"
                    }`}
                  >
                    {estado === "concluida" ? <IconeCheck className="h-4 w-4" aria-hidden="true" /> : indice + 1}
                  </span>
                  <span className={`text-xs ${estado === "atual" ? "font-bold text-conteudo" : "text-conteudo-suave"}`}>{item.rotulo}</span>
                  <span className="sr-only">{estado === "concluida" ? "concluída" : estado === "atual" ? "etapa atual" : "pendente"}</span>
                </button>
                <span aria-hidden="true" className={`mx-2 h-0.5 rounded-full ${estado === "concluida" ? "bg-marca" : "bg-borda"}`} />
              </li>
            );
          })}
        </ol>
      </nav>

      {erroAcao && <Aviso tom="erro">{erroAcao}</Aviso>}

      <div>
        {etapa === "base" && <SecaoBase {...props} />}
        {etapa === "atividades" && <SecaoAtividades {...props} catalogo={catalogo} aoMudarPendencias={aoMudarPendenciasAtividades} />}
        {etapa === "areas" && <SecaoAreas {...props} />}
        {etapa === "resumo" && <SecaoResumo {...props} aoIrPara={irPara} />}
      </div>

      {/* Navegação entre etapas — não salva nada ("Salvar" fica em cada bloco). */}
      <div className="flex items-center justify-between gap-2 border-t border-borda pt-4">
        {anterior ? (
          <Botao aparencia="discreto" onClick={() => irPara(anterior)}>
            Voltar
          </Botao>
        ) : (
          <span />
        )}
        {proxima && (
          <Botao aparencia={estadoEtapa(perfil, etapa, "resumo") === "concluida" || etapa === "resumo" ? "principal" : "secundario"} onClick={() => irPara(proxima)}>
            Continuar para {rotuloDe(proxima).toLowerCase()}
          </Botao>
        )}
      </div>
    </div>
  );
}

function SecaoResumo({ perfil, aplicar, pendente, aoIrPara }: PropsEtapa & { aoIrPara: (etapa: Etapa) => void }) {
  const areasAtivas = perfil.areas.filter((area) => area.ativa);
  const pendencias = textoPendencias(perfil.pendencias);
  const linhas: Array<{ rotulo: string; valor: string; ok: boolean; etapa: Etapa }> = [
    {
      rotulo: "Base",
      valor: perfil.base ? `${perfil.base.cidade}–${perfil.base.uf}${perfil.base.coordenadas ? "" : " · falta confirmar no mapa"}` : "Não cadastrada",
      ok: Boolean(perfil.base?.coordenadas),
      etapa: "base",
    },
    {
      rotulo: "Atividades",
      valor: perfil.atividades.map((atividade) => `${atividade.nome}${atividade.permiteAgendamento ? " (agenda)" : ""}`).join(", ") || "Nenhuma",
      ok: perfil.atividades.length > 0,
      etapa: "atividades",
    },
    { rotulo: "Área de atuação", valor: areasAtivas.map(descricaoArea).join(" · ") || "Nenhuma", ok: areasAtivas.length > 0, etapa: "areas" },
  ];

  return (
    <Secao titulo="Resumo">
      <Cartao>
        <dl className="flex flex-col divide-y divide-borda">
          {linhas.map((linha) => (
            <div key={linha.rotulo} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <dt className="flex items-center gap-1.5 text-xs text-conteudo-suave">
                  {linha.ok && <IconeCheck className="h-3.5 w-3.5 text-marca" aria-hidden="true" />}
                  {linha.rotulo}
                  <span className="sr-only">{linha.ok ? " (pronto)" : " (pendente)"}</span>
                </dt>
                <dd className="text-sm text-conteudo">{linha.valor}</dd>
              </div>
              <Botao aparencia="discreto" onClick={() => aoIrPara(linha.etapa)}>
                Alterar
              </Botao>
            </div>
          ))}
          <div className="px-4 py-3">
            <Interruptor
              id="oportunidades-outras-regioes"
              rotulo="Oportunidades de outras regiões"
              descricao="Empresas de fora da sua área podem te chamar."
              ligado={perfil.recebeOportunidadesOutrasRegioes}
              disabled={pendente !== null}
              aoMudar={(ligado) => void aplicar(salvarPreferencias(ligado), { sucesso: "Preferência salva", chave: "oportunidades" })}
            />
          </div>
        </dl>
      </Cartao>

      <Cartao className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="flex items-center gap-2 text-sm font-bold text-conteudo">
            Situação <Selo tom={TOM_SITUACAO[perfil.situacao]}>{ROTULO_SITUACAO[perfil.situacao]}</Selo>
          </span>
          {pendencias && <span className="text-sm text-aviso">{pendencias}</span>}
        </div>
        {perfil.ativo ? (
          <Botao aparencia="secundario" carregando={pendente === "situacao"} textoCarregando="Pausando…" disabled={pendente !== null} onClick={() => void aplicar(pausarPerfil(), { sucesso: "Perfil pausado", chave: "situacao" })}>
            Pausar perfil
          </Botao>
        ) : (
          <Botao
            carregando={pendente === "situacao"}
            textoCarregando="Ativando…"
            disabled={pendente !== null || perfil.pendencias.length > 0}
            onClick={() => void aplicar(tornarPerfilAtivo(), { sucesso: "Perfil ativo", chave: "situacao" })}
          >
            Ativar perfil
          </Botao>
        )}
      </Cartao>
    </Secao>
  );
}
