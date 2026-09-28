import { exigirBancoDeTeste } from "@jaa/banco/banco-de-teste";

/*
 * GUARDA dos testes que usam banco: importado PRIMEIRO pelo apoio de integração e por todo teste que
 * cria conexão própria. Fora do banco descartável criado pelo `npm test` (executor de @jaa/banco), o
 * teste é recusado antes de conectar — inclusive quando alguém roda um arquivo isolado direto com tsx.
 */
exigirBancoDeTeste();
