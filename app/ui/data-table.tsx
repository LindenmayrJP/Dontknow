import type { ReactNode } from "react";

/**
 * Tabela de dado.
 *
 * Colunas marcadas como `numerica` ganham alinhamento à direita e a
 * fonte condensada tabular — sem isso os dígitos não alinham entre as
 * linhas e a coluna vira ruído visual.
 *
 * O wrapper com rolagem horizontal é sempre aplicado: tabela densa não
 * pode fazer a página inteira rolar de lado no celular.
 */

export type Coluna<T> = {
  cabecalho: string;
  /** Como renderizar a célula desta coluna. */
  celula: (linha: T) => ReactNode;
  /** Alinha à direita e aplica a fonte tabular. */
  numerica?: boolean;
  /** Largura fixa opcional (ex: "60px"). */
  largura?: string;
};

export function DataTable<T>({
  colunas,
  linhas,
  chave,
  vazio = "Nenhum registro.",
}: {
  colunas: Coluna<T>[];
  linhas: T[];
  /** Identificador estável da linha, para a key do React. */
  chave: (linha: T, indice: number) => string | number;
  /** Mensagem quando não há dado — estado normal, não erro. */
  vazio?: ReactNode;
}) {
  if (linhas.length === 0) {
    return <div className="empty">{vazio}</div>;
  }

  return (
    <div className="table-scroll">
      <table className="plain">
        <thead>
          <tr>
            {colunas.map((c) => (
              <th
                key={c.cabecalho}
                className={c.numerica ? "col-num" : undefined}
                style={c.largura ? { width: c.largura } : undefined}
              >
                {c.cabecalho}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha, i) => (
            <tr key={chave(linha, i)}>
              {colunas.map((c) => (
                <td
                  key={c.cabecalho}
                  className={c.numerica ? "col-num num" : undefined}
                >
                  {c.celula(linha)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
