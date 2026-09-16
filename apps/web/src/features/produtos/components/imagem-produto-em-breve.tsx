// Interface TÉCNICA: lembrete de funcionalidade FUTURA. Sem seletor de arquivo, upload ou storage
// (provedor ainda não decidido). Não é o design final.

export function ImagemProdutoEmBreve() {
  return (
    <fieldset disabled aria-label="Imagem do produto" className="flex flex-col gap-1 rounded border border-dashed border-zinc-300 p-2 text-sm text-zinc-400">
      <legend className="px-1">Imagem do produto</legend>
      <span className="flex items-center gap-2">
        <button type="button" disabled aria-disabled="true" data-imagem-produto-em-breve className="cursor-not-allowed rounded border border-dashed border-zinc-300 px-2 py-1">
          + Adicionar imagem
        </button>
        <span>Em breve</span>
      </span>
    </fieldset>
  );
}
