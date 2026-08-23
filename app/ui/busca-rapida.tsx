"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SearchResults } from "@/db/queries";
import { Avatar, logoDeTime } from "./avatar";
import { TagJogo } from "./tag";

/**
 * Busca do cabeçalho, com painel de resultados enquanto se digita.
 *
 * Continua sendo um `<form>` que aponta para `/busca`: o painel é um
 * atalho por cima, não um substituto. Sem JavaScript, ou com Enter
 * antes de o painel abrir, a página de resultados responde igual.
 */

const DEBOUNCE_MS = 180;
const MIN_CARACTERES = 2;

type Item =
  | { tipo: "time"; id: number; href: string }
  | { tipo: "jogador"; id: number; href: string };

const VAZIO: SearchResults = { teams: [], players: [] };

export function BuscaRapida({ valorInicial = "" }: { valorInicial?: string }) {
  const router = useRouter();
  const [termo, setTermo] = useState(valorInicial);
  const [resultados, setResultados] = useState<SearchResults>(VAZIO);
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [selecionado, setSelecionado] = useState(-1);

  const raiz = useRef<HTMLDivElement>(null);
  // Guarda a requisição em voo para cancelar quando outra tecla chega:
  // sem isso uma resposta lenta de "fur" pode chegar depois de "furia"
  // e sobrescrever o resultado certo com o antigo.
  const emVoo = useRef<AbortController | null>(null);
  const idPainel = useId();

  const consultar = useCallback(async (q: string) => {
    emVoo.current?.abort();

    if (q.trim().length < MIN_CARACTERES) {
      setResultados(VAZIO);
      setCarregando(false);
      return;
    }

    const ctrl = new AbortController();
    emVoo.current = ctrl;
    setCarregando(true);

    try {
      const r = await fetch(`/api/busca?q=${encodeURIComponent(q.trim())}`, {
        signal: ctrl.signal,
      });
      if (!r.ok) throw new Error(String(r.status));
      setResultados((await r.json()) as SearchResults);
    } catch (e) {
      // Abortar é o fluxo normal de quem digita rápido, não uma falha.
      if ((e as Error).name !== "AbortError") setResultados(VAZIO);
    } finally {
      if (!ctrl.signal.aborted) setCarregando(false);
    }
  }, []);

  useEffect(() => {
    // Só consulta com o painel aberto. Sem isto, chegar em /busca?q=furia
    // dispararia uma consulta a mais só para preencher um campo cujo
    // resultado ninguém veria — a página já traz os resultados.
    if (!aberto) return;
    const t = setTimeout(() => void consultar(termo), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [termo, aberto, consultar]);

  // Ao cair em /busca?q=..., o campo do cabeçalho reflete o termo da
  // página. Lido do `window` num efeito, e não de `useSearchParams`,
  // para não exigir uma fronteira de Suspense no layout inteiro.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q && window.location.pathname === "/busca") setTermo(q);
    // Só na montagem: depois disso quem manda no campo é quem digita.
  }, []);

  // Clique fora fecha o painel.
  useEffect(() => {
    if (!aberto) return;
    const aoClicar = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", aoClicar);
    return () => document.removeEventListener("mousedown", aoClicar);
  }, [aberto]);

  const itens: Item[] = [
    ...resultados.teams.map((t) => ({
      tipo: "time" as const,
      id: t.id,
      href: `/times/${t.id}`,
    })),
    ...resultados.players.map((p) => ({
      tipo: "jogador" as const,
      id: p.id,
      href: `/jogadores/${p.id}`,
    })),
  ];

  const temAlgo = itens.length > 0;
  const buscou = termo.trim().length >= MIN_CARACTERES;

  function irPara(href: string) {
    setAberto(false);
    setSelecionado(-1);
    router.push(href);
  }

  function aoTeclar(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setAberto(false);
      setSelecionado(-1);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!temAlgo) return;
      e.preventDefault();
      setAberto(true);
      setSelecionado((i) => {
        const passo = e.key === "ArrowDown" ? 1 : -1;
        // Circula nas pontas: da última volta para a primeira.
        return (i + passo + itens.length) % itens.length;
      });
      return;
    }
    if (e.key === "Enter" && selecionado >= 0 && itens[selecionado]) {
      // Só intercepta o Enter quando há item destacado; sem seleção o
      // form segue para a página de resultados, como sempre.
      e.preventDefault();
      irPara(itens[selecionado].href);
    }
  }

  // Nomes que aparecem mais de uma vez: é o caso "FURIA Esports" em LoL
  // e em Valorant, ou os quatro MIBR. Quando isso acontece a linha de
  // apoio deixa de ser decorativa — é ela que separa uma da outra.
  const nomesRepetidos = new Set(
    resultados.teams
      .map((t) => t.name.toLowerCase())
      .filter((n, i, todos) => todos.indexOf(n) !== i)
  );

  return (
    <div className="busca-rapida" ref={raiz}>
      <form className="searchbox" action="/busca">
        {/* O papel de combobox é do campo, não do form: quem recebe foco
            e navega a lista com as setas é o input. */}
        <input
          name="q"
          role="combobox"
          aria-expanded={aberto && buscou}
          aria-controls={idPainel}
          aria-haspopup="listbox"
          value={termo}
          onChange={(e) => {
            setTermo(e.target.value);
            setAberto(true);
            setSelecionado(-1);
          }}
          onFocus={() => setAberto(true)}
          onKeyDown={aoTeclar}
          placeholder="Buscar time ou jogador…"
          aria-label="Buscar time ou jogador"
          aria-autocomplete="list"
          autoComplete="off"
        />
        <button type="submit">Buscar</button>
      </form>

      {aberto && buscou && (
        <div className="painel-busca" id={idPainel} role="listbox">
          {carregando && !temAlgo && (
            <div className="painel-nota">Buscando…</div>
          )}

          {!carregando && !temAlgo && (
            <div className="painel-nota">
              Nada encontrado para <strong>{termo.trim()}</strong>.
            </div>
          )}

          {resultados.teams.length > 0 && (
            <>
              <div className="painel-grupo">Times</div>
              {resultados.teams.map((t, i) => (
                <button
                  type="button"
                  key={`t${t.id}`}
                  role="option"
                  aria-selected={selecionado === i}
                  className={`painel-item${selecionado === i ? " ativo" : ""}`}
                  onMouseEnter={() => setSelecionado(i)}
                  onClick={() => irPara(`/times/${t.id}`)}
                >
                  <Avatar
                    nome={t.name}
                    sigla={t.acronym}
                    imagemUrl={logoDeTime(t)}
                    tamanho="sm"
                  />
                  <span className="painel-texto">
                    <span className="painel-nome">{t.name}</span>
                    <span
                      className={`painel-meta${
                        nomesRepetidos.has(t.name.toLowerCase())
                          ? " painel-meta-chave"
                          : ""
                      }`}
                    >
                      {[
                        t.acronym,
                        t.region,
                        t.roster_size > 0 ? `${t.roster_size} no elenco` : null,
                        t.partidas > 0 ? `${t.partidas} partidas` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <TagJogo jogo={t.game} />
                </button>
              ))}
            </>
          )}

          {resultados.players.length > 0 && (
            <>
              <div className="painel-grupo">Jogadores</div>
              {resultados.players.map((p, i) => {
                const idx = resultados.teams.length + i;
                return (
                  <button
                    type="button"
                    key={`p${p.id}`}
                    role="option"
                    aria-selected={selecionado === idx}
                    className={`painel-item${selecionado === idx ? " ativo" : ""}`}
                    onMouseEnter={() => setSelecionado(idx)}
                    onClick={() => irPara(`/jogadores/${p.id}`)}
                  >
                    <Avatar nome={p.name} imagemUrl={p.image_url} tamanho="sm" redondo />
                    <span className="painel-texto">
                      <span className="painel-nome">{p.name}</span>
                      <span className="painel-meta">
                        {p.team_name ?? "sem time ativo"}
                      </span>
                    </span>
                    {p.game && <TagJogo jogo={p.game} />}
                  </button>
                );
              })}
            </>
          )}

          {temAlgo && (
            <button
              type="button"
              className="painel-rodape"
              onClick={() => irPara(`/busca?q=${encodeURIComponent(termo.trim())}`)}
            >
              Ver todos os resultados de “{termo.trim()}”
            </button>
          )}
        </div>
      )}
    </div>
  );
}
