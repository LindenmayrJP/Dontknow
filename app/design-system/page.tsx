import { getAmostrasAvatar } from "@/db/queries";
import {
  Avatar,
  Card,
  DataTable,
  EmDesenvolvimento,
  LacunaInline,
  Secao,
  Stat,
  Tag,
  TagJogo,
  TagStatus,
  type Coluna,
  EstadoVazio,
} from "../ui";
import { logoDeTime } from "../ui/avatar";

export const metadata = { title: "Sistema de design — Esports Hub" };

// Lê amostras reais do banco para a seção de Avatar, então não pode ser
// pré-renderizada no build.
export const dynamic = "force-dynamic";

const pct = (parte: number, total: number) =>
  total ? ((parte / total) * 100).toFixed(0) : "0";

/* --------------------------- amostras --------------------------- */

const CORES = [
  { grupo: "Superfície", itens: ["--bg", "--surface", "--surface-2", "--surface-3", "--border"] },
  { grupo: "Texto", itens: ["--text", "--text-2", "--text-3"] },
  { grupo: "Destaque", itens: ["--accent", "--accent-hover"] },
  { grupo: "Estado", itens: ["--success", "--warning", "--danger"] },
  { grupo: "Jogo", itens: ["--lol", "--valorant"] },
];

const ESPACOS = ["--space-1", "--space-2", "--space-3", "--space-4", "--space-5", "--space-6", "--space-7"];

type LinhaExemplo = {
  pos: number;
  time: string;
  sigla: string;
  vitorias: number;
  derrotas: number;
  saldo: number;
};

const TABELA: LinhaExemplo[] = [
  { pos: 1, time: "Team Vitality", sigla: "VIT", vitorias: 8, derrotas: 1, saldo: 14 },
  { pos: 2, time: "FUT Esports", sigla: "FUT", vitorias: 7, derrotas: 2, saldo: 9 },
  { pos: 3, time: "Karmine Corp", sigla: "KC", vitorias: 5, derrotas: 4, saldo: 2 },
  { pos: 4, time: "BBL Esports", sigla: "BBL", vitorias: 2, derrotas: 7, saldo: -8 },
];

const COLUNAS: Coluna<LinhaExemplo>[] = [
  { cabecalho: "#", celula: (l) => l.pos, numerica: true, largura: "48px" },
  {
    cabecalho: "Time",
    celula: (l) => (
      <span className="row" style={{ gap: "var(--space-2)" }}>
        <Avatar nome={l.time} sigla={l.sigla} tamanho="sm" />
        <span style={{ fontWeight: 600 }}>{l.time}</span>
      </span>
    ),
  },
  { cabecalho: "V", celula: (l) => l.vitorias, numerica: true },
  { cabecalho: "D", celula: (l) => l.derrotas, numerica: true },
  {
    cabecalho: "Saldo",
    numerica: true,
    celula: (l) => (
      <span className={l.saldo > 0 ? "up" : l.saldo < 0 ? "down" : undefined}>
        {l.saldo > 0 ? `+${l.saldo}` : l.saldo}
      </span>
    ),
  },
];

/* ---------------------------- página ---------------------------- */

export default async function DesignSystem() {
  const {
    timesComLogo,
    timesSemLogo,
    timesLightmode,
    jogadoresComFoto,
    jogadoresSemFoto,
    cobertura,
  } = await getAmostrasAvatar();

  return (
    <>
      <h1>Sistema de design</h1>
      <p className="muted small" style={{ marginTop: 4 }}>
        Fundação visual reutilizável. Tema escuro, denso em dado, destaque
        pontual. Tudo aqui é servido do próprio domínio — nenhuma
        requisição externa no carregamento.
      </p>

      {/* ---------------- Cor ---------------- */}
      <Secao titulo="Paleta">
        <div className="stack stack-4">
          {CORES.map(({ grupo, itens }) => (
            <div key={grupo}>
              <div className="xs muted" style={{ marginBottom: "var(--space-2)" }}>
                {grupo}
              </div>
              <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(128px, 1fr))" }}>
                {itens.map((token) => (
                  <div className="swatch" key={token}>
                    <div className="swatch-cor" style={{ background: `var(${token})` }} />
                    <div className="swatch-nome">
                      <div className="swatch-valor">{token}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="notice" style={{ marginTop: "var(--space-4)" }}>
          A cor de destaque marca o que é acionável ou primário — nunca
          decora. E cor sozinha nunca carrega significado: o vermelho da
          marca Valorant e o vermelho de erro são próximos de propósito, o
          que os separa é sempre o texto ao lado.
        </p>
      </Secao>

      {/* ---------------- Tipografia ---------------- */}
      <Secao titulo="Tipografia">
        <div className="grid grid-2">
          <Card titulo="Inter — texto corrido">
            <div className="stack">
              <div style={{ fontSize: "var(--text-2xl)", fontWeight: 700, letterSpacing: "-0.02em" }}>
                Título de página
              </div>
              <div style={{ fontSize: "var(--text-lg)", fontWeight: 600 }}>Subtítulo de seção</div>
              <div>
                Texto padrão em 14px. Alta legibilidade em tamanho pequeno,
                que é o que uma wiki densa exige.
              </div>
              <div className="small muted">Secundário, 13px — contexto e apoio.</div>
              <div className="xs dim">Terciário, 11px — metadado discreto.</div>
            </div>
          </Card>

          <Card titulo="Barlow Semi Condensed — números">
            <div className="stack">
              <div className="num" style={{ fontSize: "var(--text-3xl)", fontWeight: 700 }}>
                13 : 11
              </div>
              <div className="small muted">
                Condensada e tabular: os dígitos têm largura fixa, então
                colunas de número alinham entre as linhas.
              </div>
              <div
                className="num"
                style={{ fontSize: "var(--text-xl)", lineHeight: 1.3, fontWeight: 600 }}
              >
                1 111 111 111
                <br />
                0 000 000 000
              </div>
              <div className="xs dim">
                As duas linhas terminam no mesmo ponto, apesar de dígitos
                diferentes — é isso que a fonte tabular garante, e o que
                mantém uma coluna de placar legível.
              </div>
            </div>
          </Card>
        </div>
      </Secao>

      {/* ---------------- Espaçamento ---------------- */}
      <Secao titulo="Espaçamento e grid">
        <Card>
          <div className="stack">
            {ESPACOS.map((token) => (
              <div className="spec-linha" key={token}>
                <span className="xs num dim" style={{ width: 74 }}>
                  {token}
                </span>
                <span className="spec-barra" style={{ width: `var(${token})` }} />
              </div>
            ))}
          </div>
          <p className="xs muted" style={{ marginTop: "var(--space-3)", marginBottom: 0 }}>
            Escala de 4px. O grid usa <code>auto-fill</code> com largura
            mínima, então as listagens reflowam sozinhas — reduza a janela
            para ver.
          </p>
        </Card>
      </Secao>

      {/* ---------------- Avatar ---------------- */}
      <Secao titulo="Avatar">
        <p className="notice">
          Com imagem, mostra o logo ou a foto real; sem, cai nas iniciais.
          O fallback não é caso raro: no banco de hoje,{" "}
          <strong>
            {pct(cobertura.times_com, cobertura.times)}% dos {cobertura.times} times
          </strong>{" "}
          têm logo, mas só{" "}
          <strong>
            {pct(cobertura.jogadores_com, cobertura.jogadores)}% dos{" "}
            {cobertura.jogadores} jogadores
          </strong>{" "}
          têm foto.
        </p>

        <div className="grid grid-pares">
          <Card titulo="Time — com logo real">
            <div className="stack stack-4">
              <div className="row wrapped" style={{ gap: "var(--space-4)" }}>
                {timesComLogo.slice(0, 3).map((t) => (
                  <div className="row" key={t.id}>
                    <Avatar
                      nome={t.name}
                      sigla={t.acronym}
                      imagemUrl={logoDeTime(t)}
                      tamanho="lg"
                    />
                    <span className="small">{t.name}</span>
                  </div>
                ))}
              </div>
              <div className="row" style={{ gap: "var(--space-3)" }}>
                {timesComLogo.slice(0, 4).map((t) => (
                  <Avatar
                    key={`sm-${t.id}`}
                    nome={t.name}
                    sigla={t.acronym}
                    imagemUrl={logoDeTime(t)}
                    tamanho="sm"
                  />
                ))}
                <span className="xs dim">nos três tamanhos</span>
              </div>
            </div>
          </Card>

          <Card titulo="Time — sem logo na fonte (fallback)">
            <div className="row wrapped" style={{ gap: "var(--space-4)" }}>
              {timesSemLogo.map((t) => (
                <div className="row" key={t.id}>
                  <Avatar nome={t.name} sigla={t.acronym} tamanho="lg" />
                  <span className="small">{t.name}</span>
                </div>
              ))}
            </div>
            <p className="xs muted" style={{ marginTop: "var(--space-3)", marginBottom: 0 }}>
              Iniciais com cor derivada de um hash do nome — o mesmo time
              tem sempre a mesma cor, entre sessões e entre páginas.
            </p>
          </Card>

          <Card titulo="Jogador — com foto real">
            <div className="row wrapped" style={{ gap: "var(--space-4)" }}>
              {jogadoresComFoto.map((p) => (
                <div className="row" key={p.id}>
                  <Avatar nome={p.name} imagemUrl={p.image_url} tamanho="lg" redondo />
                  <span className="small">{p.name}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card titulo="Jogador — sem foto (fallback)">
            <div className="row wrapped" style={{ gap: "var(--space-4)" }}>
              {jogadoresSemFoto.map((p) => (
                <div className="row" key={p.id}>
                  <Avatar nome={p.name} tamanho="lg" redondo />
                  <span className="small">{p.name}</span>
                </div>
              ))}
            </div>
            <p className="xs muted" style={{ marginTop: "var(--space-3)", marginBottom: 0 }}>
              Quadrado para organização, redondo para pessoa.
            </p>
          </Card>

          {timesLightmode.length > 0 && (
            <Card titulo="Caso limite — logo feito para fundo claro">
              <div className="row wrapped" style={{ gap: "var(--space-4)" }}>
                {timesLightmode.map((t) => (
                  <div className="row" key={t.id}>
                    <Avatar
                      nome={t.name}
                      sigla={t.acronym}
                      imagemUrl={logoDeTime(t)}
                      tamanho="lg"
                    />
                    <span className="small">{t.name}</span>
                  </div>
                ))}
              </div>
              <p className="xs muted" style={{ marginTop: "var(--space-3)", marginBottom: 0 }}>
                Estes têm a marca desenhada em tom escuro e a fonte não
                oferece variante dark — sobre a faixa escura padrão eles
                sumiriam. O nome do arquivo (<code>_lightmode</code>) é a
                única pista disponível, e é o que dispara a faixa clara.
              </p>
            </Card>
          )}
        </div>

        <p className="xs muted" style={{ marginTop: "var(--space-3)" }}>
          As imagens vêm do CDN da fonte, mas o navegador nunca fala com
          ele: o servidor busca, redimensiona e serve de{" "}
          <code>/_next/image</code>, no nosso domínio. As iniciais ficam
          desenhadas atrás da imagem, então um arquivo que suma no CDN
          revela o fallback sozinho, sem JavaScript.{" "}
          {cobertura.times_dark > 0 && (
            <>
              Para {cobertura.times_dark} times a fonte oferece uma variante
              de logo para fundo escuro, e é ela que usamos.
            </>
          )}
        </p>
      </Secao>

      {/* ---------------- Tags ---------------- */}
      <Secao titulo="Tags e badges">
        <div className="grid grid-2">
          <Card titulo="Jogo e estado">
            <div className="row wrapped">
              <TagJogo jogo="lol" />
              <TagJogo jogo="valorant" />
              <TagStatus status="live" />
              <TagStatus status="scheduled" />
              <TagStatus status="finished" />
            </div>
          </Card>
          <Card titulo="Tons disponíveis">
            <div className="row wrapped">
              <Tag>Neutro</Tag>
              <Tag tom="accent">Destaque</Tag>
              <Tag tom="success">Sucesso</Tag>
              <Tag tom="warning">Aviso</Tag>
              <Tag tom="danger">Erro</Tag>
            </div>
          </Card>
        </div>
      </Secao>

      {/* ---------------- Stats ---------------- */}
      <Secao titulo="Cards de estatística">
        <div className="grid grid-stats">
          <Stat valor="14" rotulo="Partidas" />
          <Stat valor="8–1" rotulo="Vitórias" tom="up" />
          <Stat valor="+14" rotulo="Saldo de mapas" tom="up" dica="últimos 30 dias" />
          <Stat valor="−8" rotulo="Saldo de mapas" tom="down" dica="últimos 30 dias" />
          <Stat valor="5" rotulo="No elenco" />
        </div>
        <p className="xs muted" style={{ marginTop: "var(--space-3)" }}>
          O número é o dado primário e usa a fonte condensada; o rótulo é
          secundário. Verde e vermelho só entram quando existe leitura de
          bom/ruim — não como enfeite.
        </p>
      </Secao>

      {/* ---------------- Tabela ---------------- */}
      <Secao titulo="Tabela de dado">
        <Card titulo="Classificação (exemplo)" acao={<Tag>Amostra</Tag>}>
          <DataTable colunas={COLUNAS} linhas={TABELA} chave={(l) => l.sigla} />
        </Card>
        <p className="xs muted" style={{ marginTop: "var(--space-3)" }}>
          Colunas numéricas alinham à direita com fonte tabular. Em telas
          estreitas a tabela rola dentro do próprio card, nunca empurra a
          página de lado.
        </p>
      </Secao>

      {/* ---------------- Em desenvolvimento ---------------- */}
      <Secao titulo="Em desenvolvimento">
        <p className="notice">
          Boa parte do que a wiki quer mostrar ainda não existe — e as
          razões são diferentes. Prometer &ldquo;em breve&rdquo; para um
          dado que a fonte nunca vai ter seria mentira, então o componente
          tem três motivos, cada um com cor e selo próprios.
        </p>

        <div className="stack stack-4">
          <div>
            <div className="xs muted" style={{ marginBottom: "var(--space-2)" }}>
              Planejado — o dado existe ou é derivável, falta a tela
            </div>
            <div className="stack">
              <EmDesenvolvimento lacuna="chaveamento" />
              <EmDesenvolvimento lacuna="classificacao" />
              <EmDesenvolvimento lacuna="tempo-carreira" />
            </div>
          </div>

          <div>
            <div className="xs muted" style={{ marginBottom: "var(--space-2)" }}>
              Bloqueado — depende de plano pago ou chave de API
            </div>
            <div className="stack">
              <EmDesenvolvimento lacuna="stats-jogador" />
              <EmDesenvolvimento lacuna="status-ao-vivo" />
            </div>
          </div>

          <div>
            <div className="xs muted" style={{ marginBottom: "var(--space-2)" }}>
              Sem dado na fonte — não está no roadmap
            </div>
            <div className="stack">
              <EmDesenvolvimento lacuna="coach" />
              <EmDesenvolvimento lacuna="titular-reserva" />
            </div>
          </div>
        </div>

        <h3 style={{ margin: "var(--space-5) 0 var(--space-3)", fontSize: "var(--text-base)" }}>
          Versão de uma linha
        </h3>
        <Card>
          <div className="table-scroll">
            <table className="plain">
              <tbody>
                <tr>
                  <td className="muted" style={{ width: 150 }}>
                    Técnico
                  </td>
                  <td>
                    <LacunaInline lacuna="coach" />
                  </td>
                </tr>
                <tr>
                  <td className="muted">Idade</td>
                  <td>
                    <LacunaInline lacuna="idade-jogador" />
                  </td>
                </tr>
                <tr>
                  <td className="muted">K/D/A</td>
                  <td>
                    <LacunaInline lacuna="stats-jogador" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="xs muted" style={{ marginTop: "var(--space-3)", marginBottom: 0 }}>
            Para um campo solto dentro de uma ficha, onde o bloco completo
            pesaria demais. O texto da explicação vem no <code>title</code>.
          </p>
        </Card>
      </Secao>

      {/* ---------------- Vazio x lacuna ---------------- */}
      <Secao titulo="Vazio não é lacuna">
        <div className="grid grid-2">
          <div>
            <div className="xs muted" style={{ marginBottom: "var(--space-2)" }}>
              Estado vazio — a consulta rodou, não há registro
            </div>
            <EstadoVazio titulo="Nenhuma partida registrada">
              Este time não tem partida no banco ainda.
            </EstadoVazio>
          </div>
          <div>
            <div className="xs muted" style={{ marginBottom: "var(--space-2)" }}>
              Lacuna — a funcionalidade não existe ainda
            </div>
            <EmDesenvolvimento lacuna="catalogo" />
          </div>
        </div>
        <p className="xs muted" style={{ marginTop: "var(--space-3)" }}>
          Distinção deliberada: &ldquo;não há dado&rdquo; e &ldquo;não
          construímos isso&rdquo; pedem reações diferentes de quem lê.
        </p>
      </Secao>
    </>
  );
}
