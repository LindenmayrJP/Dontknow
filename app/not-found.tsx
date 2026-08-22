import Link from "next/link";

export default function NotFound() {
  return (
    <>
      <h1>Não encontrado</h1>
      <div className="empty">
        Essa página não existe no banco. <Link href="/">Voltar para os times</Link>.
      </div>
    </>
  );
}
