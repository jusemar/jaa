/*
 * Lembrete visual de funcionalidades FUTURAS, dentro do compositor. Propositalmente desabilitadas:
 * não há seletor de arquivo, upload, armazenamento nem endpoint para mídia em mensagem.
 *
 * Viraram ícones compactos (como no compositor da referência de UI/UX aprovada) em vez de quatro
 * botões escritos: o compositor é a área mais usada da tela e não pode virar uma barra de avisos.
 * "Em breve" continua existindo para quem usa leitor de tela e como dica ao passar o mouse.
 */

const MIDIAS_FUTURAS = [
  { rotulo: "Foto", icone: "🖼" },
  { rotulo: "Vídeo", icone: "🎬" },
  { rotulo: "Áudio", icone: "🎤" },
  { rotulo: "Documento", icone: "📄" },
] as const;

export function AcoesMidiaDesabilitadas() {
  return (
    <div role="group" aria-label="Anexos (em breve)" className="flex shrink-0 items-center">
      {MIDIAS_FUTURAS.map(({ rotulo, icone }) => (
        <button
          key={rotulo}
          type="button"
          disabled
          aria-disabled="true"
          aria-label={`${rotulo}: em breve`}
          title={`${rotulo}: em breve`}
          data-midia-futura={rotulo}
          className="grid h-9 w-9 cursor-not-allowed place-items-center rounded-full text-sm text-conteudo-suave/45"
        >
          <span aria-hidden>{icone}</span>
        </button>
      ))}
      <span className="sr-only">Em breve</span>
    </div>
  );
}
