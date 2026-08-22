# Prompts por módulo

Use cada bloco abaixo como prompt inicial pro Copilot/Gemini, na ordem.
Sempre cole o `contexto-projeto.md` junto no início da sessão de cada
módulo, mesmo que o assistente já tenha visto antes — evita ele perder o
fio da arquitetura (banco como fonte de verdade, não API direto no
frontend).

---

## Módulo 0 — Fundação técnica

```
Contexto: [colar contexto-projeto.md]

Preciso da base técnica do projeto. Configure:
- Projeto Next.js (TypeScript)
- Conexão com Postgres usando o driver nativo (`pg`), sem ORM — queries SQL
  diretas
- Estrutura de pastas separando: frontend (app/), worker de ingestão
  (worker/), schema de banco (db/ com os arquivos .sql de migration)
- Sistema de variáveis de ambiente (.env) para: chave PandaScore, chave
  Riot, string de conexão do banco
- Não crie nenhuma tabela ainda, só a infraestrutura de conexão

Critério de pronto: rodar `npm run dev` sobe o Next.js sem erro, e existe
um script separado que consegue conectar no banco e imprimir "conectado"
no console.
```

---

## Módulo 1 — Schema da wiki

```
Contexto: [colar contexto-projeto.md]

Crie o schema do banco (SQL puro, com migrations versionadas em arquivos
.sql) para a camada de wiki, cobrindo LoL e Valorant na mesma estrutura:
- Organization (nome, região)
- Team (pertence a uma Organization, tem um campo `game` = "lol" | "valorant")
- Player (nome, riot_id/puuid, pertence a um Team em um momento — considere
  histórico de transferência simples, tipo tabela de vínculo com data)
- Tournament (nome, jogo, datas)
- Match (torneio, times, data, resultado)

Depois de criar o schema e rodar a migration, escreva um script de seed
que insira manualmente uns 5 times de LoL e 5 de Valorant reais (pode
pegar nome/roster de organizações conhecidas) só para eu ter dado de
teste enquanto o Módulo 2 não está pronto.

Critério de pronto: tabelas criadas no banco, seed roda sem erro, consigo
ver os dados inseridos com uma query simples.
```

---

## Módulo 2 — Ingestão via API (PandaScore + Riot)

```
Contexto: [colar contexto-projeto.md]

Crie o worker de ingestão. Dois clientes de API separados:

1. Cliente PandaScore: busca calendário, resultados e dados de contexto
   (times, rosters, torneios) de LoL e Valorant, e grava/atualiza nas
   tabelas Organization, Team, Player, Tournament, Match do Módulo 1.
   Respeite o limite de 1000 req/hora — implemente um rate limiter simples.

2. Cliente Riot: recebe uma lista de Riot IDs (jogadores que eu quero
   rastrear) de um arquivo de config, e busca puuid, dados de
   summoner/conta e estado de partida ao vivo (Spectator-V4) pra cada um.
   Grave o resultado numa tabela nova `TrackedPlayerStatus` (puuid, em
   partida: sim/não, dados da partida atual se houver, atualizado_em).

Empacote os dois num único comando `npm run sync` que roda ambos em
sequência e loga quantos registros foram atualizados. Isso precisa rodar
rápido porque, até eu conseguir a chave pessoal da Riot, a chave de dev
expira em 24h.

Critério de pronto: `npm run sync` roda do zero e popula o banco real com
dado do PandaScore e do Riot, sem eu precisar tocar em nada manualmente.
```

---

## Módulo 3 — Páginas de wiki

```
Contexto: [colar contexto-projeto.md]

Crie o frontend da camada de wiki, lendo só do banco (nunca chamando
PandaScore ou Riot diretamente do frontend):
- Página de time: nome, organização, jogo, roster atual, últimos resultados
- Página de jogador: nome, time atual, histórico de times (se houver),
  status de "em partida agora" (vindo de TrackedPlayerStatus, se existir)
- Busca simples por nome de time ou jogador

Critério de pronto: consigo navegar entre as 3 telas usando o dado que o
Módulo 2 já colocou no banco, sem nenhuma chamada de API externa no
carregamento da página.
```

---

## Módulo 4 — Live tracker

```
Contexto: [colar contexto-projeto.md]

Crie a página "ao vivo agora", listando todos os jogadores de
TrackedPlayerStatus que estão em partida no momento, com atualização
periódica (polling a cada X segundos consultando o banco, não a API
externa direto).

Mostre: nome do jogador, time, campeão/agente (se disponível no dado do
Spectator-V4), tempo de partida.

Critério de pronto: a tela reflete o estado salvo no banco e atualiza
sozinha sem precisar recarregar a página manualmente.
```
