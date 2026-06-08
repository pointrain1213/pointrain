// ============================================================
// server.js — 财务记账本后端服务
// 技术栈: Node.js + Express + mysql2
// ============================================================
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();
const PORT = 3000;

// ---------- 中间件 ----------
app.use(cors());
app.use(express.json());

// ---------- MySQL 连接池 ----------
const pool = mysql.createPool({
    host: 'mysql3.sqlpub.com',
    port: 3308,
    user: 'pointdb2',
    password: 'kULciegEeRcNgbp8',
    database: 'pointdb2',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4'
});

// ---------- 测试数据库连接 ----------
(async () => {
    try {
        const conn = await pool.getConnection();
        console.log('? 数据库连接成功！');
        conn.release();
    } catch (err) {
        console.error('? 数据库连接失败:', err.message);
    }
})();

// ============================================================
// API 路由
// ============================================================

// ---------- 获取分类列表 ----------
// GET /api/categories?type=income  (type 可选: income / expense)
app.get('/api/categories', async (req, res) => {
    try {
        const { type } = req.query;
        let sql = 'SELECT id, name, type, description FROM finance_category';
        const params = [];
        if (type) {
            sql += ' WHERE type = ?';
            params.push(type);
        }
        sql += ' ORDER BY name ASC';
        const [rows] = await pool.execute(sql, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('获取分类失败:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// ---------- 获取交易流水 (支持时间筛选) ----------
// GET /api/transactions?start_date=2024-01-01&end_date=2024-12-31
app.get('/api/transactions', async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        let sql = `
            SELECT 
                t.id,
                t.category_id,
                c.name AS category_name,
                c.type AS category_type,
                t.amount,
                t.transaction_date,
                t.description,
                t.created_at
            FROM finance_transaction t
            LEFT JOIN finance_category c ON t.category_id = c.id
            WHERE 1=1
        `;
        const params = [];

        if (start_date) {
            sql += ' AND t.transaction_date >= ?';
            params.push(start_date);
        }
        if (end_date) {
            sql += ' AND t.transaction_date <= ?';
            params.push(end_date);
        }

        sql += ' ORDER BY t.transaction_date DESC, t.created_at DESC';

        const [rows] = await pool.execute(sql, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('获取交易记录失败:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// ---------- 获取统计摘要 ----------
// GET /api/stats?start_date=2024-01-01&end_date=2024-12-31
app.get('/api/stats', async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        let sql = `
            SELECT 
                c.type,
                SUM(t.amount) AS total_amount,
                COUNT(*) AS count
            FROM finance_transaction t
            LEFT JOIN finance_category c ON t.category_id = c.id
            WHERE 1=1
        `;
        const params = [];

        if (start_date) {
            sql += ' AND t.transaction_date >= ?';
            params.push(start_date);
        }
        if (end_date) {
            sql += ' AND t.transaction_date <= ?';
            params.push(end_date);
        }

        sql += ' GROUP BY c.type';

        const [rows] = await pool.execute(sql, params);

        let income = 0,
            expense = 0,
            incomeCount = 0,
            expenseCount = 0;
        rows.forEach(row => {
            if (row.type === 'income') {
                income = parseFloat(row.total_amount) || 0;
                incomeCount = row.count || 0;
            } else if (row.type === 'expense') {
                expense = parseFloat(row.total_amount) || 0;
                expenseCount = row.count || 0;
            }
        });

        // 同时获取总记录数
        let countSql = 'SELECT COUNT(*) AS total FROM finance_transaction t';
        const countParams = [];
        if (start_date) {
            countSql += ' WHERE t.transaction_date >= ?';
            countParams.push(start_date);
        }
        if (end_date) {
            countSql += ' AND t.transaction_date <= ?';
            countParams.push(end_date);
        }
        const [countRows] = await pool.execute(countSql, countParams);
        const totalCount = countRows[0].total;

        res.json({
            success: true,
            data: {
                income,
                expense,
                profit: income - expense,
                incomeCount,
                expenseCount,
                totalCount
            }
        });
    } catch (error) {
        console.error('获取统计失败:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// ---------- 按日期汇总（用于图表） ----------
// GET /api/chart-data?start_date=2024-01-01&end_date=2024-12-31&group_by=day|month
app.get('/api/chart-data', async (req, res) => {
    try {
        const { start_date, end_date, group_by = 'day' } = req.query;
        let dateFormat, selectDateField;
        if (group_by === 'month') {
            dateFormat = '%Y-%m';
            selectDateField = "DATE_FORMAT(t.transaction_date, '%Y-%m')";
        } else {
            dateFormat = '%Y-%m-%d';
            selectDateField = "DATE_FORMAT(t.transaction_date, '%Y-%m-%d')";
        }

        let sql = `
            SELECT 
                ${selectDateField} AS date_key,
                c.type,
                SUM(t.amount) AS total_amount
            FROM finance_transaction t
            LEFT JOIN finance_category c ON t.category_id = c.id
            WHERE 1=1
        `;
        const params = [];

        if (start_date) {
            sql += ' AND t.transaction_date >= ?';
            params.push(start_date);
        }
        if (end_date) {
            sql += ' AND t.transaction_date <= ?';
            params.push(end_date);
        }

        sql += ' GROUP BY date_key, c.type ORDER BY date_key ASC';

        const [rows] = await pool.execute(sql, params);

        // 转换为前端需要的格式：按日期分组，包含 income / expense
        const map = new Map();
        rows.forEach(row => {
            const key = row.date_key;
            if (!map.has(key)) {
                map.set(key, { date: key, income: 0, expense: 0 });
            }
            const entry = map.get(key);
            if (row.type === 'income') {
                entry.income = parseFloat(row.total_amount) || 0;
            } else if (row.type === 'expense') {
                entry.expense = parseFloat(row.total_amount) || 0;
            }
        });

        const chartData = Array.from(map.values());
        res.json({ success: true, data: chartData });
    } catch (error) {
        console.error('获取图表数据失败:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// ---------- 添加交易记录 ----------
// POST /api/transactions
// Body: { category_id, amount, transaction_date, description }
app.post('/api/transactions', async (req, res) => {
    try {
        const { category_id, amount, transaction_date, description } = req.body;

        // 参数验证
        if (!category_id || !amount || !transaction_date) {
            return res.status(400).json({
                success: false,
                message: '缺少必要参数: category_id, amount, transaction_date'
            });
        }

        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            return res.status(400).json({
                success: false,
                message: '金额必须为正数'
            });
        }

        // 验证分类是否存在
        const [catRows] = await pool.execute(
            'SELECT id, type FROM finance_category WHERE id = ?', [category_id]
        );
        if (catRows.length === 0) {
            return res.status(400).json({
                success: false,
                message: '分类ID不存在'
            });
        }

        const sql = `
            INSERT INTO finance_transaction 
            (category_id, amount, transaction_date, description)
            VALUES (?, ?, ?, ?)
        `;
        const [result] = await pool.execute(sql, [
            category_id,
            parsedAmount,
            transaction_date,
            description || null
        ]);

        // 查询刚插入的完整记录
        const [newRows] = await pool.execute(`
            SELECT 
                t.id,
                t.category_id,
                c.name AS category_name,
                c.type AS category_type,
                t.amount,
                t.transaction_date,
                t.description,
                t.created_at
            FROM finance_transaction t
            LEFT JOIN finance_category c ON t.category_id = c.id
            WHERE t.id = ?
        `, [result.insertId]);

        res.status(201).json({
            success: true,
            message: '添加成功',
            data: newRows[0] || null
        });
    } catch (error) {
        console.error('添加交易失败:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// ---------- 删除交易记录 ----------
// DELETE /api/transactions/:id
app.delete('/api/transactions/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // 检查记录是否存在
        const [rows] = await pool.execute(
            'SELECT id FROM finance_transaction WHERE id = ?', [id]
        );
        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: '记录不存在'
            });
        }

        await pool.execute('DELETE FROM finance_transaction WHERE id = ?', [id]);

        res.json({
            success: true,
            message: '删除成功'
        });
    } catch (error) {
        console.error('删除交易失败:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// ---------- 健康检查 ----------
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

// ============================================================
// 启动服务
// ============================================================
app.listen(PORT, () => {
    console.log(`?? 财务记账本服务已启动: http://localhost:${PORT}`);
    console.log(`?? API 地址: http://localhost:${PORT}/api`);
});