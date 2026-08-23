import Image from "next/image";

/**
 * Avatar de time ou jogador.
 *
 * Com `imagemUrl`, mostra o logo/foto real; sem ela, cai nas iniciais.
 * O fallback não é caso raro: a fonte tem logo para ~89% dos times, mas
 * foto para só ~21% dos jogadores.
 *
 * As iniciais são desenhadas SEMPRE, atrás da imagem. Se o arquivo do
 * CDN sumir ou falhar, elas reaparecem sozinhas — sem precisar de
 * JavaScript nem transformar isto num client component.
 */

type Tamanho = "sm" | "md" | "lg";

const PX: Record<Tamanho, number> = { sm: 26, md: 38, lg: 56 };

function corDe(nome: string) {
  let hash = 0;
  for (let i = 0; i < nome.length; i++) {
    hash = (hash * 31 + nome.charCodeAt(i)) | 0;
  }
  // Saturação e luminosidade fixas: garante contraste com texto branco
  // em qualquer matiz sorteada.
  return `hsl(${Math.abs(hash) % 360} 42% 38%)`;
}

function iniciaisDe(nome: string, sigla?: string | null) {
  if (sigla) return sigla.slice(0, 3).toUpperCase();
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export function Avatar({
  nome,
  sigla,
  imagemUrl,
  tamanho = "md",
  redondo = false,
}: {
  nome: string;
  /** Acrônimo do time, quando houver — melhor que iniciais derivadas. */
  sigla?: string | null;
  /**
   * Logo ou foto. Para time, passe a variante dark quando existir: a
   * `image_url` padrão às vezes é `_lightmode` e some no fundo escuro.
   */
  imagemUrl?: string | null;
  tamanho?: Tamanho;
  /** Redondo para pessoa, quadrado arredondado para organização. */
  redondo?: boolean;
}) {
  const px = PX[tamanho];

  return (
    <div
      className={`avatar avatar-${tamanho}${redondo ? " avatar-round" : ""}`}
      style={{ background: corDe(nome) }}
      // O nome sempre aparece ao lado; para leitor de tela as iniciais
      // (ou o logo) seriam ruído duplicado.
      aria-hidden="true"
    >
      {iniciaisDe(nome, sigla)}
      {imagemUrl && (
        <Image
          // Um logo `_lightmode` é desenhado escuro, para fundo claro —
          // sobre a nossa faixa escura ele sumiria. O nome do arquivo é
          // a única pista que a fonte dá, então serve de heurística.
          className={`avatar-img${/lightmode/i.test(imagemUrl) ? " avatar-img-claro" : ""}`}
          src={imagemUrl}
          alt=""
          width={px}
          height={px}
          // O logo tem proporção própria e fundo transparente: `contain`
          // evita cortar a marca para preencher o quadrado.
          style={{ objectFit: "contain" }}
        />
      )}
    </div>
  );
}

/** Escolhe a melhor imagem de time para o tema escuro. */
export function logoDeTime(time: {
  image_url?: string | null;
  dark_mode_image_url?: string | null;
}) {
  return time.dark_mode_image_url ?? time.image_url ?? null;
}
