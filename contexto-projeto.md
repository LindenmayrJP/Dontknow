# Contexto do projeto

## O que é
Um híbrido entre SofaScore e Liquipedia, focado em esports. SofaScore resolve
placar ao vivo e estatísticas em tempo real, mas quase não cobre esports.
Liquipedia tem profundidade de wiki (times, jogadores, torneios, histórico),
mas não tem experiência de partida ao vivo. O projeto junta os dois: uma
plataforma de esports com camada de wiki estruturada + acompanhamento de
partidas ao vivo.

## Escopo de jogos (MVP)
- League of Legends
- Valorant

Ambos são da Riot, o que permite reaproveitar boa parte da integração de dados
entre os dois jogos e modelar organizações que têm time em ambos sob uma
mesma entidade.

## Pilares do produto
1. **Partidas ao vivo** — estado de partida em tempo real, calendário, resultados.
2. **Camada de wiki** — organizações, times, jogadores, torneios, histórico,
   dados estruturados (não texto livre).
3. **Comunidade** (fora do MVP) — previsões, comentários. Fica pra v2.

## Fontes de dados
- **PandaScore (tier gratuito)** — 1000 requisições/hora, sem cartão de
  crédito. Cobre calendário, resultados e dados de contexto (times, rosters,
  formato de torneio) de LoL e Valorant. É a fonte principal da camada de
  wiki — dado oficial de cena pro, de graça. Estatísticas granulares em
  tempo real e histórico profundo ficam em planos pagos, fora do MVP.
  Uso não pode ser relacionado a apostas.
- **Riot API (chave pessoal, não a de dev de 24h)** — usada para dados de
  conta/partida de jogadores específicos rastreados (contas pro em
  ranqueada), via Account-V1, Summoner, Match-V5 e Spectator-V4. Aplicar
  para chave pessoal junto à Riot para eliminar a expiração diária —
  continua sendo gratuita, só precisa de aprovação.

## Decisão de arquitetura chave
O frontend **nunca** consulta as APIs externas diretamente. Um worker de
ingestão consulta PandaScore e Riot e grava tudo no banco (Postgres). O app
lê só do banco. Isso isola o produto de rate limit, instabilidade das APIs
externas e (antes da chave pessoal) da expiração diária da chave da Riot.

## Stack técnica
- Next.js (React) — frontend
- Postgres — dado estruturado da wiki
- Worker/script de sync (`npm run sync`) — ingestão periódica das APIs
- WebSockets/SSE — push de estado de partida ao vivo pro frontend
- Fluxo de desenvolvimento: vibecoding com Copilot (VS Code) + Gemini Pro,
  mesmo processo usado no AutoDraft

## Fora do escopo do MVP
- Camada de comunidade (previsões, comentários)
- Estatísticas granulares em tempo real (draft pick, kills por round) —
  dependem de plano pago do PandaScore
- Mais de dois jogos
- Monetização

## Módulos do MVP (resumo — detalhe em prompts-modulos.md)
0. Fundação técnica
1. Schema da wiki
2. Ingestão via API (PandaScore + Riot)
3. Páginas de wiki
4. Live tracker
