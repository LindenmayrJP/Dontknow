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

**Decisão (pós Módulo 3.6): frontend foca só em Valorant por enquanto.**
O worker continua sincronizando LoL e Valorant nos bastidores — nada é
descartado. Mas a interface (design system, páginas, busca) é construída
e lançada primeiro só pra Valorant, de forma genérica o suficiente pra
"ligar" LoL depois sem reconstruir telas do zero. Motivo: preferimos um
produto completo e polido num jogo só do que dois jogos pela metade.

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
- **Estatísticas de player (K/D/A, tempo de partida)** — confirmado via
  auditoria (Módulo 3.5) que os endpoints de stats retornam 403 no tier
  gratuito. Decisão: ficar no tier gratuito e remover stats do MVP por
  agora. Reavaliar se decidir migrar de plano no futuro.
- **Coach de time** — confirmado que não existe na API do PandaScore
  (nem como campo no time, nem como `role` no roster). Não é limitação
  temporária, é ausência de dado na fonte — não reabrir essa pergunta.
- **Tempo de carreira do jogador** — não vem pronto na API, precisaria
  ser calculado a partir da partida/torneio mais antigo do jogador.
  Adiado pra um módulo futuro.
- **Idade do jogador (birthday/age)** — existe na API mas com cobertura
  baixa (~27% em rosters de times ativos). Decisão: não adicionar ao
  schema por enquanto, esperar cobertura melhorar.
- Mais de dois jogos
- Monetização

## Módulos do MVP (resumo — detalhe em prompts-modulos.md)
0. Fundação técnica
1. Schema da wiki
2. Ingestão via API (PandaScore + Riot)
3. Páginas de wiki (versão inicial)
3.5. Auditoria de dados (PandaScore x banco, escopo Valorant)
3.6. Correções de worker e catálogo estático
3.7. Design system + padrão "em desenvolvimento"
3.7.5. Logos e fotos (times e jogadores)
3.8. Estrutura de navegação + home page
3.9. Busca global
3.10. Página de time (redesenhada)
3.11. Página de jogador (redesenhada)
3.12. Página de campeonato (calendário, standings, chaveamento)
3.13. Páginas de catálogo do jogo (mapas, agentes, armas, habilidades)
4. Live tracker
