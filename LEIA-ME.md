# Radar de Ofertas — passo a passo (sem programar)

O site busca sozinho os produtos, as fotos, os preços, as comissões e o seu link de afiliado, e se atualiza a cada 10 minutos. Você não baixa nada produto por produto.

## 1. Pegue as chaves da Shopee (a mais fácil)
Em affiliate.shopee.com.br, depois de aprovado no programa, abra a seção **Open API** do painel e copie o **App ID** e o **Secret**. Não compartilhe o Secret com ninguém.

## 2. Coloque os arquivos no GitHub
1. Crie uma conta em github.com e um repositório novo (ex.: radar-ofertas).
2. Em **Add file → Upload files**, envie os 5 arquivos desta pasta: `server.js`, `package.json`, `index.html`, `esportes.html` e `LEIA-ME.md`. Não envie o arquivo de chaves.

## 3. Publique no Render (grátis para começar)
1. Crie uma conta em render.com → **New → Web Service** → conecte o repositório.
2. Build Command: `npm install` · Start Command: `node server.js` · plano Free.
3. Em **Environment**, adicione: `SHOPEE_APP_ID` e `SHOPEE_SECRET` (valores do passo 1).
4. Clique em Deploy. O Render te dá um endereço: ele abre o site geral, e `/esportes.html` abre o de esportes.

No plano grátis o site pode demorar uns segundos para abrir depois de ficar parado.

## 4. Depois, ligue as outras plataformas (opcional)
Cada uma entra sozinha quando você adiciona as variáveis no Render:
- Amazon: `AMAZON_CREDENTIAL_ID`, `AMAZON_CREDENTIAL_SECRET`, `AMAZON_TOKEN_URL`, `AMAZON_PARTNER_TAG`
- Mercado Livre: `ML_AFFILIATE_PARAMS` (parâmetros do seu link de afiliado; valide com uma venda de teste)

Com pelo menos uma plataforma ligada, o site mostra só produtos reais. Sem nenhuma, mostra produtos de demonstração.
Veja o estado de cada plataforma em `/api/status`.

## Avisos
- Os nomes de campos das APIs vieram da documentação pública e não foram testados com a sua conta. Se aparecer "erro" no status, mande o texto para ajustarmos.
- Sinalize aos seguidores que os links são de afiliado.
