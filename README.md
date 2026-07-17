# Ponto da Carne — site com backend real

Site completo do açougue com carrinho, finalização pelo WhatsApp, entrega/retirada
e um painel de administração **de verdade**, protegido por servidor:

- Senha do admin guardada com **hash bcrypt** (nunca em texto puro)
- Login com **sessão segura** (cookie httpOnly, expira em 8h)
- **Bloqueio automático** depois de várias tentativas erradas de senha (8 tentativas / 15 min por IP)
- Banco de dados próprio (SQLite) guardando produtos e configurações da loja

## O que você precisa antes de publicar

1. Uma conta de hospedagem que rode **Node.js** (não é um site "estático" comum — precisa
   rodar um servidor). Recomendações fáceis e com plano gratuito/barato:
   - **Railway** (railway.app) — mais fácil, e tem disco persistente mesmo no plano grátis/hobby
   - **Render** (render.com) — fácil, mas no plano free o disco **não é persistente**
     (se reiniciar o servidor, os produtos cadastrados voltam ao padrão). Se for usar o
     Render, contrate o plano com "Persistent Disk" pra não perder os dados.
2. Um domínio (ex: pontodacarne.com.br) — opcional no começo, dá pra testar com o link
   que o próprio serviço de hospedagem fornece.

## Passo a passo (usando a Railway como exemplo)

1. Crie uma conta em https://railway.app
2. Crie um novo projeto e escolha "Deploy from GitHub repo" (envie esta pasta para um
   repositório no GitHub) ou "Empty Project" e depois use o comando `railway up` pelo
   terminal apontando para esta pasta.
3. Nas variáveis de ambiente do projeto (Settings → Variables), adicione:
   - `JWT_SECRET` → gere um valor aleatório rodando no seu computador:
     ```
     node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
     ```
     e cole o resultado aqui.
   - `INITIAL_ADMIN_PASSWORD` → a senha que você quer usar no primeiro acesso ao painel
     (troque depois pelo próprio site).
   - `NODE_ENV` → `production`
4. Adicione um **Volume** (disco persistente) apontando para a pasta do projeto, para
   que o arquivo `data.sqlite` não seja apagado a cada novo deploy.
5. A Railway detecta automaticamente que é um projeto Node e roda `npm install` seguido
   de `npm start`.
6. Depois de publicado, acesse a URL gerada, clique em "Área do dono" no rodapé, entre
   com a senha inicial e troque tudo (WhatsApp, endereço, horários e a própria senha)
   na aba "Configurações da loja".

## Rodando localmente (para testar antes de publicar)

```bash
npm install
cp .env.example .env
# edite o .env e preencha JWT_SECRET e INITIAL_ADMIN_PASSWORD
npm start
```

Acesse http://localhost:3000

## Estrutura do projeto

```
server.js        → servidor Express (rotas da API e autenticação)
db.js             → banco de dados SQLite (produtos e configurações)
public/           → site (HTML, CSS, JS e imagens) servido pelo próprio servidor
.env.example      → modelo das variáveis de ambiente necessárias
```

## Sobre a segurança

- A senha do admin nunca é salva como texto puro — só o hash (bcrypt) fica no banco.
- O login gera um token de sessão assinado (JWT) guardado em cookie `httpOnly`
  (não pode ser lido por JavaScript no navegador, o que dificulta roubo de sessão).
- Tentativas de login são limitadas por IP para dificultar ataques de força bruta.
- Ainda assim, nenhum site é 100% inviolável — boas práticas complementares incluem:
  usar uma senha forte e exclusiva, trocar o `JWT_SECRET` periodicamente, manter o
  `NODE_ENV=production` (isso obriga o cookie de sessão a só funcionar via HTTPS) e
  sempre usar HTTPS no domínio final (a maioria dos serviços de hospedagem já
  fornece isso de graça).
