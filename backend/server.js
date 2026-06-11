require("dotenv").config();
const express = require("express");
const expressWs = require("express-ws");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const db = require("./db");

const app = express();
expressWs(app);

const JWT_SECRET = process.env.JWT_SECRET || "motoflash_secret_2024";
const TAXA_APP = 0.20;
const MENSALIDADE = 19.90;
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../frontend/public")));

// WebSocket por cidade
const wsClients = {};
function broadcast(cidade, tipo, dados) {
  if (!wsClients[cidade]) return;
  const msg = JSON.stringify({ tipo, dados });
  wsClients[cidade].forEach(ws => { if (ws.readyState === 1) ws.send(msg); });
}

// Auth
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ erro: "Token obrigatorio" });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ erro: "Token invalido" }); }
}

function calcTarifa(km) { return Math.max(5, 5 + parseFloat(km || 2) * 1.8); }

// WebSocket
app.ws("/ws/:cidade", (ws, req) => {
  const cidade = decodeURIComponent(req.params.cidade);
  if (!wsClients[cidade]) wsClients[cidade] = new Set();
  wsClients[cidade].add(ws);
  ws.on("close", () => wsClients[cidade]?.delete(ws));
});

// ── RESTAURANTE ────────────────────────────────────────────────────────────────
app.post("/api/restaurante/cadastro", async (req, res) => {
  try {
    const { nome, email, senha, telefone, endereco, cidade, estado, lat, lng, categoria, pix } = req.body;
    if (!nome || !email || !senha || !cidade) return res.status(400).json({ erro: "Preencha: nome, email, senha e cidade" });
    const existe = await db.prepare("SELECT id FROM restaurantes WHERE email=$1").get(email);
    if (existe) return res.status(400).json({ erro: "Email ja cadastrado" });
    const hash = await bcrypt.hash(senha, 10);
    const id = uuidv4();
    const venc = new Date(); venc.setMonth(venc.getMonth() + 1);
    await db.prepare("INSERT INTO restaurantes (id,nome,email,senha,telefone,endereco,cidade,estado,lat,lng,categoria,pix,plano_ativo,plano_vencimento) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,0,$13)")
      .run(id, nome, email, hash, telefone||"", endereco||"", cidade, estado||"SP", lat||0, lng||0, categoria||"Outros", pix||"", venc.toISOString());
    const token = jwt.sign({ id, tipo:"restaurante", cidade }, JWT_SECRET, { expiresIn:"30d" });
    res.json({ token, id, nome, email, cidade, plano_ativo: false });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

app.post("/api/restaurante/login", async (req, res) => {
  try {
    const { email, senha } = req.body;
    const r = await db.prepare("SELECT * FROM restaurantes WHERE email=$1").get(email);
    if (!r) return res.status(400).json({ erro: "Email nao encontrado" });
    const ok = await bcrypt.compare(senha, r.senha);
    if (!ok) return res.status(400).json({ erro: "Senha incorreta" });
    const token = jwt.sign({ id:r.id, tipo:"restaurante", cidade:r.cidade }, JWT_SECRET, { expiresIn:"30d" });
    res.json({ token, id:r.id, nome:r.nome, email:r.email, cidade:r.cidade, pix:r.pix, plano_ativo:!!r.plano_ativo, plano_vencimento:r.plano_vencimento });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

app.get("/api/restaurante/perfil", authMiddleware, async (req, res) => {
  try {
    const r = await db.prepare("SELECT id,nome,email,telefone,endereco,cidade,categoria,pix,plano_ativo,plano_vencimento FROM restaurantes WHERE id=$1").get(req.user.id);
    res.json(r);
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

app.post("/api/restaurante/ativar-plano", authMiddleware, async (req, res) => {
  try {
    const venc = new Date(); venc.setMonth(venc.getMonth() + 1);
    await db.prepare("UPDATE restaurantes SET plano_ativo=1, plano_vencimento=$1 WHERE id=$2").run(venc.toISOString(), req.user.id);
    res.json({ ok:true, vencimento:venc.toISOString() });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

app.post("/api/restaurante/gerar-pix-mensalidade", authMiddleware, async (req, res) => {
  try {
    const r = await db.prepare("SELECT * FROM restaurantes WHERE id=$1").get(req.user.id);
    if (!r) return res.status(404).json({ erro: "Restaurante nao encontrado" });
    if (process.env.MP_ACCESS_TOKEN && !process.env.MP_ACCESS_TOKEN.includes("seu_token")) {
      const MercadoPago = require("mercadopago");
      const mp = new MercadoPago.MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
      const payment = new MercadoPago.Payment(mp);
      const result = await payment.create({ body: {
        transaction_amount: 19.90, payment_method_id: "pix",
        payer: { email: r.email, first_name: r.nome },
        description: `MotoFlash - Mensalidade ${r.nome}`,
      }});
      const pix_data = result.point_of_interaction?.transaction_data;
      return res.json({ payment_id:result.id, status:result.status, qr_code:pix_data?.qr_code, copia_cola:pix_data?.qr_code, valor:19.90 });
    }
    res.json({ simulado:true, valor:19.90, chave_pix:"motoflash@pix.com.br", mensagem:"Envie R$19,90 para a chave PIX e clique em Ja paguei" });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ── MOTOBOY ────────────────────────────────────────────────────────────────────
app.post("/api/motoboy/cadastro", async (req, res) => {
  try {
    const { nome, email, senha, telefone, pix, placa, cnh, cidade, estado } = req.body;
    if (!nome || !email || !senha || !pix || !cidade) return res.status(400).json({ erro: "Preencha: nome, email, senha, pix e cidade" });
    const existe = await db.prepare("SELECT id FROM motoboys WHERE email=$1").get(email);
    if (existe) return res.status(400).json({ erro: "Email ja cadastrado" });
    const hash = await bcrypt.hash(senha, 10);
    const id = uuidv4();
    await db.prepare("INSERT INTO motoboys (id,nome,email,senha,telefone,pix,placa,cnh,cidade,estado) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)")
      .run(id, nome, email, hash, telefone||"", pix, placa||"", cnh||"", cidade, estado||"SP");
    const token = jwt.sign({ id, tipo:"motoboy", cidade }, JWT_SECRET, { expiresIn:"30d" });
    res.json({ token, id, nome, email, cidade, pix, corridas_total:0, ganhos_total:0 });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

app.post("/api/motoboy/login", async (req, res) => {
  try {
    const { email, senha } = req.body;
    const m = await db.prepare("SELECT * FROM motoboys WHERE email=$1").get(email);
    if (!m) return res.status(400).json({ erro: "Email nao encontrado" });
    const ok = await bcrypt.compare(senha, m.senha);
    if (!ok) return res.status(400).json({ erro: "Senha incorreta" });
    const token = jwt.sign({ id:m.id, tipo:"motoboy", cidade:m.cidade }, JWT_SECRET, { expiresIn:"30d" });
    res.json({ token, id:m.id, nome:m.nome, email:m.email, cidade:m.cidade, pix:m.pix, corridas_total:m.corridas_total, ganhos_total:m.ganhos_total, avaliacao:m.avaliacao });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

app.post("/api/motoboy/gps", authMiddleware, async (req, res) => {
  try {
    const { lat, lng } = req.body;
    await db.prepare("UPDATE motoboys SET lat=$1, lng=$2 WHERE id=$3").run(lat, lng, req.user.id);
    broadcast(req.user.cidade, "gps_update", { motoboy_id:req.user.id, lat, lng });
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ── ENTREGAS ────────────────────────────────────────────────────────────────────
app.post("/api/entrega", authMiddleware, async (req, res) => {
  try {
    if (req.user.tipo !== "restaurante") return res.status(403).json({ erro: "Apenas restaurantes" });
    const rest = await db.prepare("SELECT * FROM restaurantes WHERE id=$1").get(req.user.id);
    if (!rest.plano_ativo) return res.status(403).json({ erro: "Ative seu plano para publicar entregas" });
    const { cliente_nome, cliente_endereco, cliente_lat, cliente_lng, valor_pedido, distancia_km } = req.body;
    const km = distancia_km || 2;
    const tarifa = calcTarifa(km);
    const id = uuidv4();
    await db.prepare("INSERT INTO entregas (id,restaurante_id,cliente_nome,cliente_endereco,cliente_lat,cliente_lng,valor_pedido,distancia_km,tarifa,tarifa_motoboy,tarifa_app,cidade) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)")
      .run(id, req.user.id, cliente_nome, cliente_endereco, cliente_lat||0, cliente_lng||0, valor_pedido, km, tarifa, tarifa*0.8, tarifa*0.2, req.user.cidade);
    const entrega = await db.prepare("SELECT * FROM entregas WHERE id=$1").get(id);
    broadcast(req.user.cidade, "nova_entrega", entrega);
    res.json(entrega);
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

app.get("/api/entregas/disponiveis", authMiddleware, async (req, res) => {
  try {
    const cidade = req.user.cidade;
    let entregas = await db.prepare(`
      SELECT e.*, r.nome as restaurante_nome, r.endereco as restaurante_endereco, r.lat as rest_lat, r.lng as rest_lng
      FROM entregas e JOIN restaurantes r ON e.restaurante_id=r.id
      WHERE e.status='disponivel' AND lower(trim(e.cidade))=lower(trim($1))
      ORDER BY e.created_at DESC`).all(cidade);
    if (!entregas || entregas.length === 0) {
      entregas = await db.prepare(`
        SELECT e.*, r.nome as restaurante_nome, r.endereco as restaurante_endereco, r.lat as rest_lat, r.lng as rest_lng
        FROM entregas e JOIN restaurantes r ON e.restaurante_id=r.id
        WHERE e.status='disponivel' ORDER BY e.created_at DESC`).all();
    }
    res.json(entregas || []);
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

app.get("/api/entregas/restaurante", authMiddleware, async (req, res) => {
  try {
    const entregas = await db.prepare(`
      SELECT e.*, m.nome as motoboy_nome
      FROM entregas e LEFT JOIN motoboys m ON e.motoboy_id=m.id
      WHERE e.restaurante_id=$1 ORDER BY e.created_at DESC LIMIT 50`).all(req.user.id);
    res.json(entregas || []);
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

app.post("/api/entrega/:id/aceitar", authMiddleware, async (req, res) => {
  try {
    if (req.user.tipo !== "motoboy") return res.status(403).json({ erro: "Apenas motoboys" });
    const entrega = await db.prepare("SELECT * FROM entregas WHERE id=$1").get(req.params.id);
    if (!entrega) return res.status(404).json({ erro: "Entrega nao encontrada" });
    if (entrega.status !== "disponivel") return res.status(400).json({ erro: "Entrega nao disponivel" });
    await db.prepare("UPDATE entregas SET motoboy_id=$1, status='em_entrega', updated_at=NOW() WHERE id=$2").run(req.user.id, req.params.id);
    await db.prepare("UPDATE motoboys SET status='ocupado' WHERE id=$1").run(req.user.id);
    const atualizada = await db.prepare("SELECT * FROM entregas WHERE id=$1").get(req.params.id);
    broadcast(entrega.cidade, "entrega_aceita", { entrega_id:req.params.id, motoboy_id:req.user.id });
    res.json(atualizada);
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

app.post("/api/entrega/:id/status", authMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    if (!["coletado","entregue"].includes(status)) return res.status(400).json({ erro: "Status invalido" });
    const entrega = await db.prepare("SELECT * FROM entregas WHERE id=$1").get(req.params.id);
    if (!entrega) return res.status(404).json({ erro: "Nao encontrada" });
    await db.prepare("UPDATE entregas SET status=$1, updated_at=NOW() WHERE id=$2").run(status, req.params.id);
    if (status === "entregue") {
      await db.prepare("UPDATE motoboys SET status='livre', corridas_total=corridas_total+1, ganhos_total=ganhos_total+$1 WHERE id=$2").run(entrega.tarifa_motoboy, entrega.motoboy_id);
      broadcast(entrega.cidade, "entrega_concluida", { entrega_id:req.params.id });
    }
    res.json({ ok:true, status });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ── PIX ────────────────────────────────────────────────────────────────────────
app.post("/api/pix/pagar/:id", authMiddleware, async (req, res) => {
  try {
    const entrega = await db.prepare("SELECT * FROM entregas WHERE id=$1").get(req.params.id);
    if (!entrega) return res.status(404).json({ erro: "Nao encontrada" });
    if (entrega.pix_pago) return res.status(400).json({ erro: "PIX ja enviado" });
    const motoboy = await db.prepare("SELECT * FROM motoboys WHERE id=$1").get(entrega.motoboy_id);
    if (process.env.MP_ACCESS_TOKEN && !process.env.MP_ACCESS_TOKEN.includes("seu_token")) {
      const MercadoPago = require("mercadopago");
      const mp = new MercadoPago.MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
      const payment = new MercadoPago.Payment(mp);
      const result = await payment.create({ body: {
        transaction_amount: entrega.tarifa_motoboy, payment_method_id:"pix",
        payer: { email: motoboy?.email || "motoboy@motoflash.com" },
        description: `Corrida MotoFlash #${req.params.id.slice(0,8)}`,
      }});
      await db.prepare("UPDATE entregas SET pix_pago=1, pix_id=$1 WHERE id=$2").run(result.id?.toString(), req.params.id);
      return res.json({ ok:true, pix_pago:true, valor:entrega.tarifa_motoboy });
    }
    await db.prepare("UPDATE entregas SET pix_pago=1 WHERE id=$1").run(req.params.id);
    res.json({ ok:true, pix_pago:true, simulado:true, valor:entrega.tarifa_motoboy, chave:motoboy?.pix });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ── ADMIN ──────────────────────────────────────────────────────────────────────
app.get("/api/admin/dashboard", async (req, res) => {
  try {
    const senha = req.headers["x-admin-key"];
    if (senha !== (process.env.ADMIN_KEY || "motoflash_admin_2024")) return res.status(403).json({ erro: "Acesso negado" });
    const rest = await db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN plano_ativo=1 THEN 1 ELSE 0 END) as ativos FROM restaurantes").get();
    const motos = await db.prepare("SELECT COUNT(*) as total FROM motoboys").get();
    const entr = await db.prepare("SELECT COUNT(*) as total, COALESCE(SUM(tarifa_app),0) as receita FROM entregas WHERE status='entregue'").get();
    const hoje = await db.prepare("SELECT COUNT(*) as total FROM entregas WHERE DATE(created_at)=CURRENT_DATE").get();
    const cidades = await db.prepare("SELECT cidade, COUNT(*) as restaurantes, SUM(CASE WHEN plano_ativo=1 THEN 1 ELSE 0 END) as ativos FROM restaurantes GROUP BY cidade ORDER BY restaurantes DESC").all();
    const rest_lista = await db.prepare("SELECT id,nome,cidade,email,plano_ativo,plano_vencimento,created_at FROM restaurantes ORDER BY created_at DESC").all();
    const moto_lista = await db.prepare("SELECT id,nome,cidade,corridas_total,ganhos_total,status FROM motoboys ORDER BY created_at DESC").all();
    const ativos = parseInt(rest.ativos)||0;
    const receita_corridas = parseFloat(entr.receita)||0;
    const receita_mensalidades = ativos * MENSALIDADE;
    res.json({
      resumo: {
        restaurantes_total: parseInt(rest.total)||0, restaurantes_ativos: ativos,
        motoboys_total: parseInt(motos.total)||0, entregas_total: parseInt(entr.total)||0,
        receita_corridas: parseFloat(receita_corridas.toFixed(2)),
        receita_mensalidades: parseFloat(receita_mensalidades.toFixed(2)),
        receita_total: parseFloat((receita_corridas+receita_mensalidades).toFixed(2)),
        corridas_hoje: parseInt(hoje.total)||0,
      },
      cidades: cidades||[], rest_lista: rest_lista||[], moto_lista: moto_lista||[]
    });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

app.get("/api/admin/ativar/:id", async (req, res) => {
  try {
    const senha = req.headers["x-admin-key"];
    if (senha !== (process.env.ADMIN_KEY || "motoflash_admin_2024")) return res.status(403).json({ erro: "Acesso negado" });
    const venc = new Date(); venc.setMonth(venc.getMonth()+1);
    await db.prepare("UPDATE restaurantes SET plano_ativo=1, plano_vencimento=$1 WHERE id=$2").run(venc.toISOString(), req.params.id);
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

app.post("/api/webhook/mp", async (req, res) => {
  try {
    const { type, data } = req.body;
    if (type === "payment" && data?.id && process.env.MP_ACCESS_TOKEN) {
      const MercadoPago = require("mercadopago");
      const mp = new MercadoPago.MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
      const payment = new MercadoPago.Payment(mp);
      const p = await payment.get({ id: data.id });
      if (p.status === "approved" && p.transaction_amount === 19.90) {
        const venc = new Date(); venc.setMonth(venc.getMonth()+1);
        await db.prepare("UPDATE restaurantes SET plano_ativo=1, plano_vencimento=$1 WHERE email=$2").run(venc.toISOString(), p.payer?.email);
      }
    }
    res.json({ ok:true });
  } catch(e) { res.json({ ok:true }); }
});

// SPA fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/public/index.html"));
});

// Inicializar banco e subir servidor
db.initDB().then(() => {
  app.listen(PORT, () => console.log(`MotoFlash rodando na porta ${PORT}`));
}).catch(err => {
  console.error("Erro ao inicializar banco:", err);
  process.exit(1);
});
