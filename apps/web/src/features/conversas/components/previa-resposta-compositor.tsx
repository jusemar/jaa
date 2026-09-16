import { ReferenciaResposta } from "./referencia-resposta";

// Interface TÉCNICA: mensagem escolhida para responder, acima do campo de composição. X cancela.

export type RespostaEmComposicao = {
  mensagemId: string;
  nomeAutor: string;
  previaConteudo: string;
  conteudoTruncado: boolean;
};

export function PreviaRespostaCompositor({ resposta, aoCancelar }: { resposta: RespostaEmComposicao; aoCancelar: () => void }) {
  return (
    <div aria-label="Resposta em composição" data-mensagem-respondida-id={resposta.mensagemId} className="flex items-start gap-2 rounded-lg bg-zinc-50 p-1.5">
      <div className="min-w-0 flex-1">
        <ReferenciaResposta nomeAutor={resposta.nomeAutor} previaConteudo={resposta.previaConteudo} conteudoTruncado={resposta.conteudoTruncado} />
      </div>
      <button
        type="button"
        aria-label="Cancelar resposta"
        title="Cancelar resposta"
        onClick={aoCancelar}
        className="shrink-0 rounded px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800"
      >
        ✕
      </button>
    </div>
  );
}
