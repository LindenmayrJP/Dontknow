import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    /**
     * Logos e fotos vêm do CDN do PandaScore, mas o navegador nunca fala
     * com ele: o otimizador do Next busca no servidor, converte e serve
     * de `/_next/image`, no nosso próprio domínio. Isso mantém a decisão
     * de arquitetura do projeto (o frontend não depende de serviço
     * externo em runtime) e ainda evita baixar um PNG de 800px para
     * desenhar um avatar de 38px.
     */
    remotePatterns: [
      { protocol: "https", hostname: "cdn-api.pandascore.co" },
    ],
    // Os avatares são pequenos e de tamanho fixo; não precisamos da
    // escada completa de larguras que o Next gera por padrão.
    imageSizes: [26, 38, 56, 112],
  },
};

export default nextConfig;
