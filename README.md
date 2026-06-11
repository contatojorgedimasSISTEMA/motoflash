# MotoFlash — Plataforma de Entregas

App completo para restaurantes e motoboys com GPS em tempo real, rota pelas ruas e PIX automatico.

---

## ESTRUTURA

```
motoflash/
├── backend/
│   ├── server.js       # API Node.js + WebSocket
│   ├── db.js           # Banco SQLite
│   ├── package.json
│   └── .env.example
├── frontend/
│   └── public/
│       ├── index.html  # PWA completo
│       ├── manifest.json
│       └── sw.js       # Service Worker
└── Dockerfile
```

---

## DEPLOY NO RAILWAY (passo a passo)

### 1. Subir para GitHub

```bash
cd motoflash
git init
git add .
git commit -m "MotoFlash v1.0"
git remote add origin https://github.com/SEU_USUARIO/motoflash.git
git push -u origin main
```

### 2. Criar projeto no Railway

1. Acesse railway.app
2. Clique em "New Project"
3. Selecione "Deploy from GitHub repo"
4. Escolha o repositorio motoflash
5. Railway detecta o Dockerfile automaticamente

### 3. Configurar variaveis de ambiente no Railway

No painel do Railway, va em "Variables" e adicione:

```
JWT_SECRET=troque_por_uma_chave_segura_aleatoria
MP_ACCESS_TOKEN=seu_token_do_mercado_pago
PORT=3000
```

### 4. Mercado Pago — obter token

1. Acesse mercadopago.com.br/developers
2. Crie um app
3. Copie o "Access Token" de producao
4. Cole em MP_ACCESS_TOKEN no Railway

### 5. Dominio

No Railway, va em "Settings > Domains" e gere um dominio gratuito (*.up.railway.app) ou conecte seu proprio dominio.

---

## MODELO DE RECEITA

| Fonte | Valor |
|-------|-------|
| Mensalidade restaurante | R$ 19,90/mes |
| Taxa por corrida | 20% do valor |

Exemplo com 50 restaurantes e 200 corridas/dia de R$15 cada:
- Mensalidades: 50 x R$19,90 = R$ 995/mes
- Corridas: 200 x R$15 x 20% x 30 dias = R$ 18.000/mes
- **Total: R$ 18.995/mes**

---

## TABELA DE TARIFAS (base iFood/Uber)

| Distancia | Tarifa | Motoboy (80%) | App (20%) |
|-----------|--------|----------------|-----------|
| 1 km | R$ 6,80 | R$ 5,44 | R$ 1,36 |
| 2 km | R$ 8,60 | R$ 6,88 | R$ 1,72 |
| 3 km | R$ 10,40 | R$ 8,32 | R$ 2,08 |
| 5 km | R$ 14,00 | R$ 11,20 | R$ 2,80 |

Formula: R$5,00 base + R$1,80/km (minimo R$5,00)

---

## PWA — INSTALAR NO CELULAR

### Android (Chrome):
1. Abra o app no Chrome
2. Aparece banner "Adicionar a tela inicial"
3. Clique em Instalar

### iPhone (Safari):
1. Abra o app no Safari
2. Toque no icone de compartilhar
3. Selecione "Adicionar a tela de inicio"

---

## PUBLICAR NAS LOJAS (Capacitor.js)

Apos validar o app como PWA:

```bash
npm install -g @capacitor/cli
npm install @capacitor/core @capacitor/android @capacitor/ios
npx cap init MotoFlash com.motoflash.app
npx cap add android
npx cap add ios
npx cap copy
npx cap open android  # abre Android Studio
npx cap open ios      # abre Xcode
```

- Google Play: taxa unica de U$25
- App Store: U$99/ano

---

## APIS UTILIZADAS

- **OpenRouteService**: rota real pelas ruas (gratuito — 2000 req/dia)
  - Para mais: openrouteservice.org — cadastre chave propria
- **OpenStreetMap**: mapa base (gratuito e ilimitado)
- **Mercado Pago**: PIX automatico ao motoboy
- **WebSocket**: GPS em tempo real

---

## CONTATO / SUPORTE

Panka Hits Producoes — @jorgedimasoficial
