import { tocarSom } from "@/lib/sons/tocar-som";

/*
 * Toque de NOVA ROTA: o som 03 da identidade sonora do Jaaa (`lib/sons`) — o alerta mais forte e mais
 * longo, no volume máximo do PLAYER do app (o volume de mídia do aparelho é da pessoa; o app não mexe
 * nele). Toca UMA vez por chamada, sem laço; quem decide QUANDO é `aviso-nova-rota.ts`, com a
 * deduplicação por rota. Só existe com o app ABERTO: não é notificação do sistema.
 */
export function tocarSomNovaRota(): void {
  tocarSom("novaRota");
}
