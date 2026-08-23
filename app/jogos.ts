import { GAME_LABEL, type Game } from "@/db/queries";

/**
 * Quais jogos o **frontend** mostra hoje.
 *
 * Esta é a única linha que decide isso. O worker continua sincronizando
 * LoL e Valorant nos bastidores (ver `contexto-projeto.md`) — o recorte
 * aqui é de interface, não de ingestão: preferimos um jogo completo a
 * dois pela metade.
 *
 * Para ligar LoL, acrescente `"lol"` à lista. Nada mais precisa mudar:
 * as queries recebem esta lista como filtro em vez de ter o jogo escrito
 * dentro delas, e a navegação passa a mostrar o seletor de jogo sozinha
 * (ver `MULTI_JOGO`). Se algum dia isso deixar de ser verdade, é sinal
 * de que alguém escreveu "valorant" num lugar onde caberia a lista.
 */
export const JOGOS_HABILITADOS: Game[] = ["valorant"];

/**
 * Com um jogo só, um seletor de jogo seria ruído: toda opção levaria ao
 * mesmo lugar. As telas usam isto para esconder o filtro enquanto ele
 * não significar nada, sem que ninguém precise lembrar de religá-lo.
 */
export const MULTI_JOGO = JOGOS_HABILITADOS.length > 1;

/** Rótulo de um recorte de jogo, para subtítulos e textos de estado vazio. */
export function rotuloDoRecorte() {
  return JOGOS_HABILITADOS.map((j) => GAME_LABEL[j]).join(" e ");
}

/** Aceita um `?jogo=` da URL só se for um jogo realmente habilitado. */
export function jogoDaUrl(valor: string | undefined): Game | undefined {
  return JOGOS_HABILITADOS.find((j) => j === valor);
}
