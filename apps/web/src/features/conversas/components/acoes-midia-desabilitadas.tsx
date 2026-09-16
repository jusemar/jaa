// Interface TÉCNICA: lembrete visual de funcionalidades FUTURAS. Propositalmente desabilitadas:
// não há seletor de arquivo, upload, armazenamento nem endpoint. Não é o design final.

const MIDIAS_FUTURAS = ["Foto", "Vídeo", "Áudio", "Documento"] as const;

export function AcoesMidiaDesabilitadas() {
  return (
    <div role="group" aria-label="Anexos (em breve)" className="flex flex-wrap items-center gap-1.5 text-xs">
      {MIDIAS_FUTURAS.map((rotulo) => (
        <button
          key={rotulo}
          type="button"
          disabled
          aria-disabled="true"
          title={`${rotulo}: em breve`}
          data-midia-futura={rotulo}
          className="inline-flex cursor-not-allowed items-center gap-1 rounded border border-dashed border-zinc-300 px-2 py-1 text-zinc-400"
        >
          + {rotulo}
        </button>
      ))}
      <span className="text-zinc-400">Em breve</span>
    </div>
  );
}
