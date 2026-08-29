# CLAUDE.md

Instruções para o Claude Code neste repositório. Mantenha este arquivo
curto: ele é lido em toda sessão. Detalhe vive nos dois arquivos abaixo.

## Leia isto antes de qualquer trabalho

Dois arquivos na raiz são as fontes de verdade. **Leia os dois antes de
começar qualquer módulo ou alteração**, mesmo que a tarefa pareça
pequena:

- **`contexto-projeto.md`** — visão do produto, escopo do MVP e as
  decisões de "fora do escopo". Se um pedido esbarra em algo listado lá
  como descartado, não reabra a questão sem falar.
- **`estado-atual.md`** — estado técnico real: o que já roda, decisões
  técnicas tomadas, pendências e armadilhas conhecidas.

Complementares, leia quando o assunto encostar: `prompts-modulos.md`
(prompt de cada módulo) e `auditoria-pandascore.md` (o que a API do
PandaScore entrega e o que ela não tem).

**Não duplique conteúdo desses arquivos aqui.** Eles mudam a cada
módulo; copiar cria duas versões da verdade e uma delas fica velha.

## Stack

- **Next.js (App Router) + TypeScript** — frontend em `app/`.
- **Postgres no Neon**, acessado pelo driver `pg`. **Sem ORM**, SQL
  escrito à mão em `db/queries.ts`. Migrations numeradas em
  `db/migrations/`, aplicadas por `npm run db:migrate`.
- **Worker de ingestão separado** em `worker/` — consome PandaScore e
  Riot API e grava no banco. Roda por `npm run sync` (e
  `npm run sync:catalog` para o catálogo estático do jogo).

## Regras que valem para qualquer módulo

**O frontend lê só do banco.** Nenhuma página, rota de API ou componente
chama PandaScore ou Riot diretamente. Quem fala com API externa é o
worker, e só ele. Isso isola o produto de rate limit e instabilidade das
fontes — é decisão de arquitetura, não preferência.

**Escopo atual: só Valorant no frontend.** O worker continua
sincronizando LoL e Valorant nos bastidores — nada foi descartado. A
interface é construída de forma genérica o suficiente para "ligar" LoL
sem reconstruir telas; evite escrever o nome de um jogo onde caberia a
lista de jogos habilitados.

**Confirme antes de "corrigir" ou "implementar".** Já aconteceu mais de
uma vez de um prompt pedir como novo algo que já existia por inteiro no
código. Antes de criar coluna, componente ou query que um pedido
descreve como faltando, verifique o estado atual — leia o arquivo, rode
a query, cheque a migration. Se já existir, diga isso em vez de
reimplementar; se o pedido partir de uma premissa errada sobre o banco
ou a API, aponte a diferença antes de seguir.

**Meça em vez de supor.** Cobertura de dado neste projeto é quase sempre
parcial. Antes de afirmar percentual, contagem ou "está tudo
preenchido", rode a consulta e use o número real.

## Ao final de um módulo

Atualize `estado-atual.md` com o que foi **de fato** feito: decisões
tomadas, números medidos, pendências que sobraram e o que ficou
verificado versus não verificado. Acrescente e ajuste só o que mudou —
**não reescreva seções intactas**.

## Cuidado com edição concorrente

Não edite `estado-atual.md`, `contexto-projeto.md` ou
`prompts-modulos.md` manualmente enquanto uma sessão do Claude Code
estiver rodando. Isso já causou o arquivo parecer revertido no meio de
uma sessão e perdeu o registro de um módulo inteiro.

## Segredos

Chave do PandaScore e credencial do Neon ficam só no `.env` (fora do
versionamento). Não escreva valor de credencial em código, em commit,
nem na saída do terminal.
