import type { ReactNode } from "react";

/**
 * "Em desenvolvimento" — o espaço reservado padrão da wiki.
 *
 * Existe porque muita coisa que o produto quer mostrar simplesmente não
 * está disponível hoje, e um espaço em branco parece bug. Mas nem toda
 * ausência é igual, e prometer "em breve" para um dado que a fonte NUNCA
 * vai ter seria mentira. Daí três motivos distintos:
 *
 * - `planejado`    — o dado existe (ou é derivável) e a tela virá.
 * - `bloqueado`    — depende de algo externo: plano pago, chave de API.
 * - `indisponivel` — a fonte não tem esse dado. Não está no roadmap.
 */

export type MotivoLacuna = "planejado" | "bloqueado" | "indisponivel";

const SELO: Record<MotivoLacuna, string> = {
  planejado: "Em breve",
  bloqueado: "Bloqueado",
  indisponivel: "Sem dado na fonte",
};

function Icone({ motivo }: { motivo: MotivoLacuna }) {
  const comum = {
    width: 13,
    height: 13,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (motivo === "planejado") {
    // Relógio: está a caminho.
    return (
      <svg {...comum} aria-hidden="true">
        <circle cx="8" cy="8" r="6.2" />
        <path d="M8 4.6V8l2.2 1.4" />
      </svg>
    );
  }
  if (motivo === "bloqueado") {
    // Cadeado: existe, mas há uma trava fora do nosso controle.
    return (
      <svg {...comum} aria-hidden="true">
        <rect x="3.2" y="7" width="9.6" height="6.2" rx="1.4" />
        <path d="M5.6 7V5.2a2.4 2.4 0 0 1 4.8 0V7" />
      </svg>
    );
  }
  // Traço: não há o que esperar.
  return (
    <svg {...comum} aria-hidden="true">
      <circle cx="8" cy="8" r="6.2" />
      <path d="M5.4 8h5.2" />
    </svg>
  );
}

/**
 * Catálogo das lacunas conhecidas (ver `estado-atual.md`).
 *
 * Centralizar aqui é o que mantém o texto consistente: a página de
 * jogador e a de time explicam a ausência de estatística com a mesma
 * frase, e mudar a explicação é mexer em um lugar só.
 */
export const LACUNAS = {
  "stats-jogador": {
    titulo: "Estatísticas de partida",
    motivo: "bloqueado",
    detalhe:
      "K/D/A, tempo de jogo e desempenho por mapa exigem um plano pago do PandaScore. Os endpoints existem, mas respondem 403 no tier atual.",
  },
  "status-ao-vivo": {
    titulo: "Status em partida",
    motivo: "bloqueado",
    detalhe:
      "Depende de uma chave da Riot API, ainda não configurada. O resto da ficha não é afetado.",
  },
  coach: {
    titulo: "Comissão técnica",
    motivo: "indisponivel",
    detalhe:
      "A fonte de dados não expõe coach: não há campo no time, nem entrada de comissão técnica no elenco.",
  },
  "funcao-valorant": {
    titulo: "Função do jogador",
    motivo: "indisponivel",
    detalhe:
      "A fonte não estrutura posição em Valorant — o campo vem vazio em 100% dos jogadores. Em LoL ele existe (top, mid, adc), então isto é limite do jogo na origem, não do nosso schema.",
  },
  "titular-reserva": {
    titulo: "Titulares e reservas",
    motivo: "indisponivel",
    detalhe:
      "A fonte não distingue titular de reserva, então o elenco aparece completo, sem inferência nossa.",
  },
  "habilidade-agente": {
    titulo: "Habilidades por agente",
    motivo: "indisponivel",
    detalhe:
      "A fonte lista habilidades e agentes em coleções separadas, sem nenhum campo ligando uma à outra.",
  },
  "idade-jogador": {
    titulo: "Idade",
    motivo: "planejado",
    detalhe:
      "A fonte tem data de nascimento, mas preenchida para uma minoria dos jogadores. Fica para quando a cobertura justificar.",
  },
  "tempo-carreira": {
    titulo: "Tempo de carreira",
    motivo: "planejado",
    detalhe:
      "Não é um campo da fonte: precisa ser calculado a partir do primeiro torneio registrado do jogador.",
  },
  chaveamento: {
    titulo: "Chaveamento do torneio",
    motivo: "planejado",
    detalhe:
      "A topologia da chave já está no banco, incluindo quem cai para a chave inferior. Falta a tela.",
  },
  classificacao: {
    titulo: "Classificação",
    motivo: "planejado",
    detalhe:
      "As posições já são sincronizadas. A fonte fornece apenas a colocação — sem vitórias, derrotas ou saldo.",
  },
  catalogo: {
    titulo: "Mapas, agentes e armas",
    motivo: "planejado",
    detalhe: "O catálogo do jogo já está sincronizado no banco. Falta a tela.",
  },
} as const satisfies Record<
  string,
  { titulo: string; motivo: MotivoLacuna; detalhe: string }
>;

export type ChaveLacuna = keyof typeof LACUNAS;

type Props =
  | { lacuna: ChaveLacuna; titulo?: string; motivo?: never; detalhe?: never; children?: never }
  | {
      lacuna?: never;
      titulo: string;
      motivo: MotivoLacuna;
      detalhe?: ReactNode;
      children?: never;
    };

/** Bloco completo — para uma seção inteira que ainda não existe. */
export function EmDesenvolvimento(props: Props) {
  const base = props.lacuna ? LACUNAS[props.lacuna] : null;
  const motivo: MotivoLacuna = base ? base.motivo : props.motivo!;
  const titulo = props.titulo ?? base!.titulo;
  const detalhe = base ? base.detalhe : props.detalhe;

  return (
    <div className={`roadmap roadmap-${motivo}`}>
      <span className="roadmap-icone">
        <Icone motivo={motivo} />
      </span>
      <div>
        <div className="roadmap-titulo">
          {titulo}
          <span className="roadmap-selo">{SELO[motivo]}</span>
        </div>
        {detalhe && <div className="roadmap-detalhe">{detalhe}</div>}
      </div>
    </div>
  );
}

/**
 * Versão de uma linha — para um campo isolado dentro de uma ficha, onde
 * o bloco completo pesaria demais (ex: a célula "Coach" de uma tabela).
 */
export function LacunaInline({
  lacuna,
  rotulo,
}: {
  lacuna: ChaveLacuna;
  /** Sobrescreve o texto; por padrão usa o selo do motivo. */
  rotulo?: string;
}) {
  const { motivo } = LACUNAS[lacuna];
  return (
    <span className={`roadmap-inline roadmap-${motivo}`} title={LACUNAS[lacuna].detalhe}>
      <span style={{ color: "var(--roadmap-cor)", display: "inline-flex" }}>
        <Icone motivo={motivo} />
      </span>
      {rotulo ?? SELO[motivo]}
    </span>
  );
}
