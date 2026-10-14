const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

// envolve a rota num try/catch único
const rota = (msg, fn) => async (req, res) => {
  try { await fn(req, res); }
  catch (e) { console.error(e); res.status(500).json({ erro: msg }); }
};

// lê data_inicial e data_final; devolve null se faltar alguma
const periodo = (req, res) => {
  const { data_inicial, data_final } = req.query;
  if (!data_inicial || !data_final) {
    res.status(400).json({ erro: 'A data inicial e a data final são obrigatórias' });
    return null;
  }
  return [`${data_inicial.trim()} 00:00:00`, `${data_final.trim()} 23:59:59`];
};

// Etapa 6 - listar produtos
app.get('/produtos', rota('Erro ao buscar produtos', async (req, res) => {
  const [produtos] = await db.query('SELECT * FROM produtos');
  res.status(200).json(produtos);
}));

// Etapa 7 - cadastrar produto com validações
app.post('/produtos', rota('Erro ao cadastrar produto', async (req, res) => {
  const { nome, categoria, quantidade, valor_unidade } = req.body;
  if (!nome || !nome.trim()) return res.status(400).json({ erro: 'O nome do produto é obrigatório' });
  if (!categoria || categoria.trim().length < 2) return res.status(400).json({ erro: 'A categoria do produto é obrigatória' });
  if (!Number.isInteger(Number(quantidade)) || Number(quantidade) < 0) return res.status(400).json({ erro: 'Quantidade inválida' });
  if (!(Number(valor_unidade) > 0)) return res.status(400).json({ erro: 'O valor deve ser maior que zero' });

  await db.execute(
    'INSERT INTO produtos (nome, categoria, quantidade, valor_unidade) VALUES (?, ?, ?, ?)',
    [nome.trim(), categoria.trim(), quantidade, valor_unidade]
  );
  res.status(201).json({ mensagem: 'Produto cadastrado com sucesso!' });
}));

// Etapa 8 - registrar entrada
app.post('/movimentacoes/entrada', rota('Erro ao registrar entrada', async (req, res) => {
  const { id_produto, quantidade } = req.body;
  if (!id_produto || !(Number(quantidade) > 0)) return res.status(400).json({ erro: 'Informe o produto e uma quantidade maior que zero' });

  const [r] = await db.execute('UPDATE produtos SET quantidade = quantidade + ? WHERE id = ?', [quantidade, id_produto]);
  if (r.affectedRows === 0) return res.status(404).json({ erro: 'Produto não encontrado' });

  await db.execute(
    "INSERT INTO movimentacoes (dt, tipo, quantidade, id_produtos) VALUES (NOW(), 'Entrada', ?, ?)",
    [quantidade, id_produto]
  );
  res.status(201).json({ mensagem: 'Entrada registrada com sucesso' });
}));

// Etapa 9 - valor total por categoria
app.get('/categorias/valor-total', rota('Erro ao calcular valor por categoria', async (req, res) => {
  const [r] = await db.query(`
    SELECT categoria,
           SUM(quantidade) AS quantidade_total,
           ROUND(SUM(quantidade * valor_unidade), 2) AS valor_total
    FROM produtos GROUP BY categoria ORDER BY valor_total DESC`);
  res.status(200).json(r);
}));

// Etapa 10 - saídas, da mais recente para a mais antiga
app.get('/movimentacoes/saidas', rota('Erro ao buscar saídas', async (req, res) => {
  const [r] = await db.query(`
    SELECT m.id, p.nome, m.quantidade, m.dt
    FROM movimentacoes m INNER JOIN produtos p ON p.id = m.id_produtos
    WHERE m.tipo = 'Saída' ORDER BY m.dt DESC`);
  res.status(200).json(r);
}));

// Etapa 11 - limites mínimo (0) e máximo (100)
app.get('/produtos/limites', rota('Erro ao identificar limites', async (req, res) => {
  const [r] = await db.query(`
    SELECT id, nome, categoria, quantidade,
           CASE WHEN quantidade <= 0 THEN 'Mínimo' ELSE 'Máximo' END AS status_limite,
           ROUND((quantidade / 100) * 100, 2) AS percentual
    FROM produtos WHERE quantidade <= 0 OR quantidade >= 100
    ORDER BY quantidade ASC`);
  res.status(200).json(r);
}));

// Etapa 12 - relatório por período
app.get('/movimentacoes/relatorio', rota('Erro ao gerar relatório', async (req, res) => {
  const p = periodo(req, res); if (!p) return;
  const [r] = await db.query(`
    SELECT p.nome AS nome_produto, 'UN' AS unidade_medida,
      COALESCE(SUM(CASE WHEN m.tipo = 'Entrada' THEN m.quantidade END), 0) AS total_entradas,
      COALESCE(SUM(CASE WHEN m.tipo = 'Saída' THEN m.quantidade END), 0) AS total_saidas,
      COALESCE(SUM(CASE WHEN m.tipo = 'Entrada' THEN m.quantidade ELSE -m.quantidade END), 0) AS saldo_periodo,
      ROUND(COALESCE(SUM(CASE WHEN m.tipo = 'Entrada' THEN m.quantidade * p.valor_unidade END), 0), 2) AS valor_entradas,
      ROUND(COALESCE(SUM(CASE WHEN m.tipo = 'Saída' THEN m.quantidade * p.valor_unidade END), 0), 2) AS valor_saidas
    FROM produtos p INNER JOIN movimentacoes m ON p.id = m.id_produtos
    WHERE m.dt BETWEEN ? AND ?
    GROUP BY p.id, p.nome ORDER BY p.nome`, p);
  res.status(200).json(r);
}));

// Etapa 13 - maiores saídas no período
app.get('/movimentacoes/maiores-saidas', rota('Erro ao buscar maiores saídas', async (req, res) => {
  const p = periodo(req, res); if (!p) return;
  const [r] = await db.query(`
    SELECT p.nome AS nome_produto,
           SUM(m.quantidade) AS quantidade_total_saida,
           ROUND(SUM(m.quantidade * p.valor_unidade), 2) AS valor_total_saida
    FROM produtos p INNER JOIN movimentacoes m ON p.id = m.id_produtos
    WHERE m.tipo = 'Saída' AND m.dt BETWEEN ? AND ?
    GROUP BY p.id, p.nome ORDER BY quantidade_total_saida DESC`, p);
  res.status(200).json(r);
}));

module.exports = app;