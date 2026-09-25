import { IconeAnexo } from "@/components/ui/icones";

/*
 * ANEXAR, dentro do compositor: lembrete visual de uma funcionalidade FUTURA, propositalmente
 * desabilitado. Não há seletor de arquivo, upload, armazenamento nem endpoint para mídia em mensagem.
 *
 * UM ÍCONE, como no WhatsApp: quatro botões (foto, vídeo, áudio, documento) ocupavam a linha inteira
 * do compositor — a área mais usada da tela — para dizer apenas "em breve". Os quatro tipos
 * continuam ANUNCIADOS no rótulo acessível e na dica ao passar o mouse, então nada da informação se
 * perde; o que saiu foi o peso visual. Quando o anexo existir de verdade, este mesmo botão abre a
 * escolha do tipo.
 */

const MIDIAS_FUTURAS = ["Foto", "Vídeo", "Áudio", "Documento"] as const;

const ROTULO = `Anexar ${MIDIAS_FUTURAS.join(", ").toLowerCase()}: em breve`;

export function AcoesMidiaDesabilitadas() {
  return (
    <>
      <button
        type="button"
        disabled
        aria-disabled="true"
        aria-label={ROTULO}
        title={ROTULO}
        data-midia-futura="anexar"
        className="grid h-9 w-9 shrink-0 cursor-not-allowed place-items-center rounded-full text-conteudo-suave/50"
      >
        <IconeAnexo className="h-5 w-5" />
      </button>
      <span className="sr-only">Em breve</span>
    </>
  );
}
