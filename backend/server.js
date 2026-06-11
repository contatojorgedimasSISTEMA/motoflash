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

// WebSocket clients por cidade
const wsClients = {};

function broadcast(cidade, tipo, dados) {
  if (!wsClients[cidade]) return;
  const msg = JSON.stringify({ tipo, dados });
  wsClients[cidade].forEach(ws => {
    if (ws.readyState === 1) ws.send(msg);
  });
}

// ─── MIDDLEWARE AUTH ───────────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ erro: "Token obrigatorio" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ erro: "Token invalido" });
  }
}

function calcTarifa(km) {
  return Math.max(5, 5 + km * 1.8);
}

// ─── WEBSOCKET ─────────────────────────────────────────────────────────────────
app.ws("/ws/:cidade", (ws, req) => {
  const cidade = decodeURIComponent(req.params.cidade);
  if (!wsClients[cidade]) wsClients[cidade] = new Set();
  wsClients[cidade].add(ws);
  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.tipo === "gps" && msg.motoboy_id) {
        db.prepare("UPDATE motoboys SET lat=?, lng=? WHERE id=?")
          .run(msg.lat, msg.lng, msg.motoboy_id);
        broadcast(cidade, "gps_update", {
          motoboy_id: msg.motoboy_id,
          lat: msg.lat,
          lng: msg.lng
        });
      }
    } catch {}
  });
  ws.on("close", () => wsClients[cidade]?.delete(ws));
});

// ─── AUTH RESTAURANTE ──────────────────────────────────────────────────────────
app.post("/api/restaurante/cadastro", async (req, res) => {
  try {
    const { nome, email, senha, telefone, endereco, cidade, estado, lat, lng, categoria, pix } = req.body;
    if (!nome || !email || !senha || !cidade) return res.status(400).json({ erro: "Campos obrigatorios: nome, email, senha, cidade" });
    const existe = db.prepare("SELECT id FROM restaurantes WHERE email=?").get(email);
    if (existe) return res.status(400).json({ erro: "Email ja cadastrado" });
    const hash = await bcrypt.hash(senha, 10);
    const id = uuidv4();
    const vencimento = new Date();
    vencimento.setMonth(vencimento.getMonth() + 1);
    db.prepare(`INSERT INTO restaurantes (id,nome,email,senha,telefone,endereco,cidade,estado,lat,lng,categoria,pix,plano_ativo,plano_vencimento)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,?)`).run(id,nome,email,hash,telefone||"",endereco||"",cidade,estado||"SP",lat||0,lng||0,categoria||"Outros",pix||"",vencimento.toISOString());
    const token = jwt.sign({ id, tipo: "restaurante", cidade }, JWT_SECRET, { expiresIn: "30d" });
    res.json({ token, id, nome, cidade, plano_ativo: false, mensagem: "Cadastro realizado! Ative seu plano para comecar." });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

app.post("/api/restaurante/login", async (req, res) => {
  try {
    const { email, senha } = req.body;
    const r = db.prepare("SELECT * FROM restaurantes WHERE email=?").get(email);
    if (!r) return res.status(400).json({ erro: "Email nao encontrado" });
    const ok = await bcrypt.compare(senha, r.senha);
    if (!ok) return res.status(400).json({ erro: "Senha incorreta" });
    const token = jwt.sign({ id: r.id, tipo: "restaurante", cidade: r.cidade }, JWT_SECRET, { expiresIn: "30d" });
    res.json({ token, id: r.id, nome: r.nome, cidade: r.cidade, plano_ativo: !!r.plano_ativo });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// ─── AUTH MOTOBOY ──────────────────────────────────────────────────────────────
app.post("/api/motoboy/cadastro", async (req, res) => {
  try {
    const { nome, email, senha, telefone, pix, placa, cnh, cidade, estado } = req.body;
    if (!nome || !email || !senha || !pix || !cidade) return res.status(400).json({ erro: "Campos obrigatorios: nome, email, senha, pix, cidade" });
    const existe = db.prepare("SELECT id FROM motoboys WHERE email=?").get(email);
    if (existe) return res.status(400).json({ erro: "Email ja cadastrado" });
    const hash = await bcrypt.hash(senha, 10);
    const id = uuidv4();
    db.prepare(`INSERT INTO motoboys (id,nome,email,senha,telefone,pix,placa,cnh,cidade,estado)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(id,nome,email,hash,telefone||"",pix,placa||"",cnh||"",cidade,estado||"SP");
    const token = jwt.sign({ id, tipo: "motoboy", cidade }, JWT_SECRET, { expiresIn: "30d" });
    res.json({ token, id, nome, cidade, mensagem: "Cadastro realizado! Boas corridas." });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

app.post("/api/motoboy/login", async (req, res) => {
  try {
    const { email, senha } = req.body;
    const m = db.prepare("SELECT * FROM motoboys WHERE email=?").get(email);
    if (!m) return res.status(400).json({ erro: "Email nao encontrado" });
    const ok = await bcrypt.compare(senha, m.senha);
    if (!ok) return res.status(400).json({ erro: "Senha incorreta" });
    const token = jwt.sign({ id: m.id, tipo: "motoboy", cidade: m.cidade }, JWT_SECRET, { expiresIn: "30d" });
    res.json({ token, id: m.id, nome: m.nome, cidade: m.cidade, pix: m.pix, corridas_total: m.corridas_total, ganhos_total: m.ganhos_total });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// ─── ENTREGAS ──────────────────────────────────────────────────────────────────
app.post("/api/entrega", authMiddleware, (req, res) => {
  try {
    if (req.user.tipo !== "restaurante") return res.status(403).json({ erro: "Apenas restaurantes podem criar entregas" });
    const rest = db.prepare("SELECT * FROM restaurantes WHERE id=?").get(req.user.id);
    if (!rest.plano_ativo) return res.status(403).json({ erro: "Ative seu plano para publicar entregas" });
    const { cliente_nome, cliente_endereco, cliente_lat, cliente_lng, valor_pedido, distancia_km } = req.body;
    const km = distancia_km || 2;
    const tarifa = calcTarifa(km);
    const tarifa_motoboy = tarifa * (1 - TAXA_APP);
    const tarifa_app = tarifa * TAXA_APP;
    const id = uuidv4();
    db.prepare(`INSERT INTO entregas (id,restaurante_id,cliente_nome,cliente_endereco,cliente_lat,cliente_lng,valor_pedido,distancia_km,tarifa,tarifa_motoboy,tarifa_app,cidade)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,req.user.id,cliente_nome,cliente_endereco,cliente_lat||0,cliente_lng||0,valor_pedido,km,tarifa,tarifa_motoboy,tarifa_app,req.user.cidade);
    const entrega = db.prepare("SELECT * FROM entregas WHERE id=?").get(id);
    broadcast(req.user.cidade, "nova_entrega", entrega);
    res.json(entrega);
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

app.get("/api/entregas/disponiveis", authMiddleware, (req, res) => {
  const cidade = req.user.cidade;
  const entregas = db.prepare(`
    SELECT e.*, r.nome as restaurante_nome, r.endereco as restaurante_endereco, r.lat as rest_lat, r.lng as rest_lng
    FROM entregas e JOIN restaurantes r ON e.restaurante_id=r.id
    WHERE e.status='disponivel' AND e.cidade=?
    ORDER BY e.created_at DESC`).all(cidade);
  res.json(entregas);
});

app.get("/api/entregas/restaurante", authMiddleware, (req, res) => {
  const entregas = db.prepare(`
    SELECT e.*, m.nome as motoboy_nome, m.telefone as motoboy_tel
    FROM entregas e LEFT JOIN motoboys m ON e.motoboy_id=m.id
    WHERE e.restaurante_id=?
    ORDER BY e.created_at DESC LIMIT 50`).all(req.user.id);
  res.json(entregas);
});

app.post("/api/entrega/:id/aceitar", authMiddleware, (req, res) => {
  if (req.user.tipo !== "motoboy") return res.status(403).json({ erro: "Apenas motoboys podem aceitar corridas" });
  const entrega = db.prepare("SELECT * FROM entregas WHERE id=?").get(req.params.id);
  if (!entrega) return res.status(404).json({ erro: "Entrega nao encontrada" });
  if (entrega.status !== "disponivel") return res.status(400).json({ erro: "Entrega nao disponivel" });
  db.prepare("UPDATE entregas SET motoboy_id=?, status='em_entrega', updated_at=datetime('now') WHERE id=?").run(req.user.id, req.params.id);
  db.prepare("UPDATE motoboys SET status='ocupado' WHERE id=?").run(req.user.id);
  const atualizada = db.prepare("SELECT * FROM entregas WHERE id=?").get(req.params.id);
  broadcast(entrega.cidade, "entrega_aceita", { entrega_id: req.params.id, motoboy_id: req.user.id });
  res.json(atualizada);
});

app.post("/api/entrega/:id/status", authMiddleware, (req, res) => {
  const { status } = req.body;
  const validos = ["coletado", "entregue"];
  if (!validos.includes(status)) return res.status(400).json({ erro: "Status invalido" });
  const entrega = db.prepare("SELECT * FROM entregas WHERE id=?").get(req.params.id);
  if (!entrega) return res.status(404).json({ erro: "Entrega nao encontrada" });
  db.prepare("UPDATE entregas SET status=?, updated_at=datetime('now') WHERE id=?").run(status, req.params.id);
  if (status === "entregue") {
    db.prepare("UPDATE motoboys SET status='livre', corridas_total=corridas_total+1, ganhos_total=ganhos_total+? WHERE id=?").run(entrega.tarifa_motoboy, entrega.motoboy_id);
    const pagId = uuidv4();
    db.prepare("INSERT INTO pagamentos (id,entrega_id,motoboy_id,valor,status) VALUES (?,?,?,?,'pendente')").run(pagId, req.params.id, entrega.motoboy_id, entrega.tarifa_motoboy);
    broadcast(entrega.cidade, "entrega_concluida", { entrega_id: req.params.id });
  }
  res.json({ ok: true, status });
});

// ─── PIX MERCADO PAGO ──────────────────────────────────────────────────────────
app.post("/api/pix/pagar/:entrega_id", authMiddleware, async (req, res) => {
  try {
    const entrega = db.prepare("SELECT * FROM entregas WHERE id=?").get(req.params.entrega_id);
    if (!entrega) return res.status(404).json({ erro: "Entrega nao encontrada" });
    if (entrega.pix_pago) return res.status(400).json({ erro: "PIX ja enviado" });
    const motoboy = db.prepare("SELECT * FROM motoboys WHERE id=?").get(entrega.motoboy_id);
    if (!motoboy) return res.status(404).json({ erro: "Motoboy nao encontrado" });

    if (process.env.MP_ACCESS_TOKEN) {
      const MercadoPago = require("mercadopago");
      const mp = new MercadoPago.MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
      const payment = new MercadoPago.Payment(mp);
      const result = await payment.create({
        body: {
          transaction_amount: entrega.tarifa_motoboy,
          payment_method_id: "pix",
          payer: { email: motoboy.email || "motoboy@motoflash.com.br" },
          description: `Corrida MotoFlash #${entrega.id.slice(0,8)}`,
        }
      });
      db.prepare("UPDATE entregas SET pix_pago=1, pix_id=? WHERE id=?").run(result.id?.toString(), req.params.entrega_id);
      db.prepare("UPDATE pagamentos SET status='pago', mp_payment_id=? WHERE entrega_id=?").run(result.id?.toString(), req.params.entrega_id);
      return res.json({ ok: true, pix_pago: true, mp_id: result.id, valor: entrega.tarifa_motoboy });
    }

    // Simulado (sem token MP configurado)
    db.prepare("UPDATE entregas SET pix_pago=1 WHERE id=?").run(req.params.entrega_id);
    db.prepare("UPDATE pagamentos SET status='pago' WHERE entrega_id=?").run(req.params.entrega_id);
    res.json({ ok: true, pix_pago: true, simulado: true, valor: entrega.tarifa_motoboy, chave_pix: motoboy.pix, mensagem: `PIX de R$${entrega.tarifa_motoboy.toFixed(2)} para ${motoboy.pix}` });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// ─── GPS MOTOBOY ───────────────────────────────────────────────────────────────
app.post("/api/motoboy/gps", authMiddleware, (req, res) => {
  if (req.user.tipo !== "motoboy") return res.status(403).json({ erro: "Apenas motoboys" });
  const { lat, lng } = req.body;
  db.prepare("UPDATE motoboys SET lat=?, lng=? WHERE id=?").run(lat, lng, req.user.id);
  broadcast(req.user.cidade, "gps_update", { motoboy_id: req.user.id, lat, lng });
  res.json({ ok: true });
});

app.get("/api/motoboy/posicao/:id", authMiddleware, (req, res) => {
  const m = db.prepare("SELECT id, nome, lat, lng, status FROM motoboys WHERE id=?").get(req.params.id);
  if (!m) return res.status(404).json({ erro: "Motoboy nao encontrado" });
  res.json(m);
});

// ─── ADMIN ─────────────────────────────────────────────────────────────────────
app.get("/api/admin/dashboard", (req, res) => {
  const senha = req.headers["x-admin-key"];
  if (senha !== (process.env.ADMIN_KEY || "motoflash_admin_2024")) return res.status(403).json({ erro: "Acesso negado" });
  const restaurantes = db.prepare("SELECT COUNT(*) as total, SUM(plano_ativo) as ativos FROM restaurantes").get();
  const motoboys = db.prepare("SELECT COUNT(*) as total FROM motoboys").get();
  const entregas = db.prepare("SELECT COUNT(*) as total, SUM(tarifa_app) as receita_app FROM entregas WHERE status='entregue'").get();
  const mensalidades = (restaurantes.ativos||0) * MENSALIDADE;
  const cidades = db.prepare("SELECT cidade, COUNT(*) as restaurantes, SUM(plano_ativo) as ativos FROM restaurantes GROUP BY cidade ORDER BY restaurantes DESC").all();
  const rest_lista = db.prepare("SELECT id,nome,cidade,email,plano_ativo,plano_vencimento,created_at FROM restaurantes ORDER BY created_at DESC LIMIT 50").all();
  const moto_lista = db.prepare("SELECT id,nome,cidade,corridas_total,ganhos_total,status FROM motoboys ORDER BY corridas_total DESC LIMIT 50").all();
  const corridas_hoje = db.prepare("SELECT COUNT(*) as total FROM entregas WHERE date(created_at)=date('now')").get();
  res.json({
    resumo: {
      restaurantes_total: restaurantes.total,
      restaurantes_ativos: restaurantes.ativos||0,
      motoboys_total: motoboys.total,
      entregas_total: entregas.total,
      receita_corridas: parseFloat((entregas.receita_app||0).toFixed(2)),
      receita_mensalidades: parseFloat(mensalidades.toFixed(2)),
      receita_total: parseFloat(((entregas.receita_app||0) + mensalidades).toFixed(2)),
      corridas_hoje: corridas_hoje.total,
    },
    cidades, rest_lista, moto_lista
  });
});

app.get("/api/admin/ativar/:id", (req, res) => {
  const senha = req.headers["x-admin-key"];
  if (senha !== (process.env.ADMIN_KEY || "motoflash_admin_2024")) return res.status(403).json({ erro: "Acesso negado" });
  const vencimento = new Date();
  vencimento.setMonth(vencimento.getMonth() + 1);
  db.prepare("UPDATE restaurantes SET plano_ativo=1, plano_vencimento=? WHERE id=?").run(vencimento.toISOString(), req.params.id);
  res.json({ ok: true });
});

// ─── GERAR PIX MENSALIDADE ────────────────────────────────────────────────────
app.post("/api/restaurante/gerar-pix-mensalidade", authMiddleware, async (req, res) => {
  try {
    const rest = db.prepare("SELECT * FROM restaurantes WHERE id=?").get(req.user.id);
    if (!rest) return res.status(404).json({ erro: "Restaurante nao encontrado" });

    if (process.env.MP_ACCESS_TOKEN && !process.env.MP_ACCESS_TOKEN.includes("seu_token")) {
      const MercadoPago = require("mercadopago");
      const mp = new MercadoPago.MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
      const payment = new MercadoPago.Payment(mp);
      const result = await payment.create({
        body: {
          transaction_amount: 19.90,
          payment_method_id: "pix",
          payer: { email: rest.email, first_name: rest.nome },
          description: `MotoFlash - Mensalidade ${rest.nome}`,
          notification_url: process.env.APP_URL ? `${process.env.APP_URL}/api/webhook/mp` : undefined,
        }
      });
      const pix_data = result.point_of_interaction?.transaction_data;
      return res.json({
        payment_id: result.id,
        status: result.status,
        qr_code: pix_data?.qr_code,
        qr_code_base64: pix_data?.qr_code_base64,
        valor: 19.90,
        copia_cola: pix_data?.qr_code,
      });
    }

    // Simulado sem token MP real
    res.json({
      simulado: true,
      valor: 19.90,
      chave_pix: "motoflash@pix.com.br",
      mensagem: "Envie R$19,90 para a chave PIX abaixo e envie o comprovante",
    });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// ─── WEBHOOK MERCADO PAGO ──────────────────────────────────────────────────────
app.post("/api/webhook/mp", async (req, res) => {
  try {
    const { type, data } = req.body;
    if (type === "payment" && data?.id) {
      if (process.env.MP_ACCESS_TOKEN) {
        const MercadoPago = require("mercadopago");
        const mp = new MercadoPago.MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
        const payment = new MercadoPago.Payment(mp);
        const p = await payment.get({ id: data.id });
        if (p.status === "approved" && p.transaction_amount === 19.90) {
          const email = p.payer?.email;
          if (email) {
            const vencimento = new Date();
            vencimento.setMonth(vencimento.getMonth() + 1);
            db.prepare("UPDATE restaurantes SET plano_ativo=1, plano_vencimento=? WHERE email=?")
              .run(vencimento.toISOString(), email);
          }
        }
      }
    }
    res.json({ ok: true });
  } catch(e) { res.json({ ok: true }); }
});

// ─── ATIVAR PLANO (simulado) ───────────────────────────────────────────────────
app.post("/api/restaurante/ativar-plano", authMiddleware, (req, res) => {
  const vencimento = new Date();
  vencimento.setMonth(vencimento.getMonth() + 1);
  db.prepare("UPDATE restaurantes SET plano_ativo=1, plano_vencimento=? WHERE id=?").run(vencimento.toISOString(), req.user.id);
  res.json({ ok: true, vencimento: vencimento.toISOString(), mensagem: "Plano ativado com sucesso!" });
});

app.get("/api/restaurante/perfil", authMiddleware, (req, res) => {
  const r = db.prepare("SELECT id,nome,email,telefone,endereco,cidade,categoria,pix,plano_ativo,plano_vencimento,created_at FROM restaurantes WHERE id=?").get(req.user.id);
  res.json(r);
});

app.get("/api/motoboy/perfil", authMiddleware, (req, res) => {
  const m = db.prepare("SELECT id,nome,email,telefone,pix,placa,cidade,status,corridas_total,ganhos_total,avaliacao FROM motoboys WHERE id=?").get(req.user.id);
  res.json(m);
});

// SPA fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/public/index.html"));
});

app.listen(PORT, () => console.log(`MotoFlash rodando na porta ${PORT}`));
