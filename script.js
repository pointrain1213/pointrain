// ============================================================
        // 配置
        // ============================================================
        const API_BASE = 'http://http://47.101.137.158:3000/api'; // 后端地址

        // ============================================================
        // 状态
        // ============================================================
        let currentType = 'income';
        let currentFilter = 'today';
        let categories = { income: [], expense: [] };
        let transactions = [];
        let stats = { income: 0, expense: 0, profit: 0, totalCount: 0 };

        // ============================================================
        // DOM 引用
        // ============================================================
        const form = document.getElementById('recordForm');
        const typeToggle = document.getElementById('typeToggle');
        const categorySelect = document.getElementById('category');
        const amountInput = document.getElementById('amount');
        const dateInput = document.getElementById('date');
        const noteInput = document.getElementById('note');
        const recordListEl = document.getElementById('recordList');
        const totalIncomeEl = document.getElementById('totalIncome');
        const totalExpenseEl = document.getElementById('totalExpense');
        const totalProfitEl = document.getElementById('totalProfit');
        const recordCountEl = document.getElementById('recordCount');
        const listCountEl = document.getElementById('listCount');
        const chartPeriodLabel = document.getElementById('chartPeriodLabel');
        const chartCanvas = document.getElementById('trendChart');
        const chartEmpty = document.getElementById('chartEmpty');
        const chartWrapper = document.getElementById('chartWrapper');
        const filterBtns = document.querySelectorAll('.filter-btn');
        const filterStart = document.getElementById('filterStart');
        const filterEnd = document.getElementById('filterEnd');
        const applyCustom = document.getElementById('applyCustomFilter');
        const statusDot = document.getElementById('statusDot');
        const statusText = document.getElementById('statusText');
        const toastEl = document.getElementById('toast');

        // ============================================================
        // 工具函数
        // ============================================================
        function formatDate(date) {
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        }

        function formatCurrency(n) {
            return '¥' + Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        }

        function showToast(msg, duration = 2500) {
            toastEl.textContent = msg;
            toastEl.classList.add('show');
            clearTimeout(toastEl._timer);
            toastEl._timer = setTimeout(() => {
                toastEl.classList.remove('show');
            }, duration);
        }

        function getTodayStr() {
            return formatDate(new Date());
        }

        function getWeekRange() {
            const now = new Date();
            const day = now.getDay();
            const diff = day === 0 ? 6 : day - 1;
            const mon = new Date(now);
            mon.setDate(now.getDate() - diff);
            const sun = new Date(mon);
            sun.setDate(mon.getDate() + 6);
            return { start: formatDate(mon), end: formatDate(sun) };
        }

        function getMonthRange() {
            const now = new Date();
            const start = formatDate(new Date(now.getFullYear(), now.getMonth(), 1));
            const end = formatDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
            return { start, end };
        }

        function getYearRange() {
            const now = new Date();
            const start = formatDate(new Date(now.getFullYear(), 0, 1));
            const end = formatDate(new Date(now.getFullYear(), 11, 31));
            return { start, end };
        }

        function getFilterRange() {
            switch (currentFilter) {
                case 'today':
                    return { start: getTodayStr(), end: getTodayStr() };
                case 'week':
                    return getWeekRange();
                case 'month':
                    return getMonthRange();
                case 'year':
                    return getYearRange();
                case 'all':
                    return { start: null, end: null };
                case 'custom':
                    return { start: filterStart.value || null, end: filterEnd.value || null };
                default:
                    return { start: null, end: null };
            }
        }

        function buildQueryString(params) {
            const parts = [];
            Object.entries(params).forEach(([key, value]) => {
                if (value !== null && value !== undefined && value !== '') {
                    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
                }
            });
            return parts.length ? '?' + parts.join('&') : '';
        }

        // ============================================================
        // API 调用
        // ============================================================
        async function apiGet(endpoint, params = {}) {
            const qs = buildQueryString(params);
            const response = await fetch(`${API_BASE}${endpoint}${qs}`);
            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.message || `HTTP ${response.status}`);
            }
            return response.json();
        }

        async function apiPost(endpoint, data) {
            const response = await fetch(`${API_BASE}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.message || `HTTP ${response.status}`);
            }
            return response.json();
        }

        async function apiDelete(endpoint) {
            const response = await fetch(`${API_BASE}${endpoint}`, {
                method: 'DELETE'
            });
            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.message || `HTTP ${response.status}`);
            }
            return response.json();
        }

        // ============================================================
        // 数据加载
        // ============================================================
        async function loadCategories() {
            try {
                const [incomeRes, expenseRes] = await Promise.all([
                    apiGet('/categories', { type: 'income' }),
                    apiGet('/categories', { type: 'expense' })
                ]);
                categories.income = incomeRes.data || [];
                categories.expense = expenseRes.data || [];
                updateCategorySelect();
                return true;
            } catch (err) {
                console.error('加载分类失败:', err);
                showToast('⚠️ 加载分类失败: ' + err.message);
                return false;
            }
        }

        function updateCategorySelect() {
            const list = currentType === 'income' ? categories.income : categories.expense;
            if (list.length === 0) {
                categorySelect.innerHTML = '<option value="">暂无分类</option>';
                return;
            }
            categorySelect.innerHTML = list.map(c =>
                `<option value="${c.id}">${c.name}</option>`
            ).join('');
        }

        async function loadData() {
            const range = getFilterRange();
            try {
                const [transRes, statsRes] = await Promise.all([
                    apiGet('/transactions', {
                        start_date: range.start,
                        end_date: range.end
                    }),
                    apiGet('/stats', {
                        start_date: range.start,
                        end_date: range.end
                    })
                ]);

                transactions = transRes.data || [];
                stats = statsRes.data || { income: 0, expense: 0, profit: 0, totalCount: 0 };

                updateUI();
                return true;
            } catch (err) {
                console.error('加载数据失败:', err);
                showToast('⚠️ 加载数据失败: ' + err.message);
                return false;
            }
        }

        async function loadChartData() {
            const range = getFilterRange();
            const diffDays = range.start && range.end ?
                Math.round((new Date(range.end) - new Date(range.start)) / (1000 * 60 * 60 * 24)) + 1 :
                0;
            const groupBy = diffDays > 45 ? 'month' : 'day';

            try {
                const res = await apiGet('/chart-data', {
                    start_date: range.start,
                    end_date: range.end,
                    group_by: groupBy
                });
                renderChart(res.data || [], groupBy);
            } catch (err) {
                console.error('加载图表数据失败:', err);
                showToast('⚠️ 加载图表失败');
            }
        }

        // ============================================================
        // UI 更新
        // ============================================================
        function updateUI() {
            // Stats
            totalIncomeEl.textContent = formatCurrency(stats.income);
            totalExpenseEl.textContent = formatCurrency(stats.expense);
            totalProfitEl.textContent = formatCurrency(stats.profit);
            totalProfitEl.className = 'value profit' + (stats.profit < 0 ? ' negative' : '');

            // Counts
            recordCountEl.textContent = stats.totalCount + ' 笔记录';
            listCountEl.textContent = transactions.length + ' 条';

            // Period label
            const periodMap = {
                'today': '今日',
                'week': '本周',
                'month': '本月',
                'year': '本年',
                'all': '全部',
                'custom': '自定义'
            };
            chartPeriodLabel.textContent = periodMap[currentFilter] || '自定义';

            // Record list
            renderRecordList();

            // Chart
            loadChartData();
        }

        function renderRecordList() {
            if (transactions.length === 0) {
                recordListEl.innerHTML = `
                    <div class="record-empty">
                        <span class="big-icon">📭</span>
                        还没有记录，快来添加第一笔吧！
                    </div>
                `;
                return;
            }

            const sorted = [...transactions].sort((a, b) =>
                b.transaction_date.localeCompare(a.transaction_date) ||
                new Date(b.created_at) - new Date(a.created_at)
            );

            let html = '';
            sorted.forEach(t => {
                const isIncome = t.category_type === 'income';
                const badge = isIncome ? 'income' : 'expense';
                const icon = isIncome ? '📈' : '📉';
                const amountClass = isIncome ? 'income' : 'expense';
                const amtSign = isIncome ? '+' : '-';
                const note = t.description || '';
                html += `
                    <div class="record-item" data-id="${t.id}">
                        <div class="type-badge ${badge}">${icon}</div>
                        <div class="info">
                            <div class="top">
                                <span class="category">${t.category_name || '未分类'}</span>
                                <span class="date">${t.transaction_date}</span>
                            </div>
                            ${note ? `<div class="note">${escapeHtml(note)}</div>` : ''}
                        </div>
                        <div class="amount ${amountClass}">${amtSign}${formatCurrency(t.amount).replace('¥', '')}</div>
                        <button class="delete-btn" data-id="${t.id}" title="删除">✕</button>
                    </div>
                `;
            });
            recordListEl.innerHTML = html;

            recordListEl.querySelectorAll('.delete-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const id = btn.dataset.id;
                    if (!confirm('确定要删除这笔记录吗？')) return;
                    try {
                        await apiDelete(`/transactions/${id}`);
                        showToast('✅ 删除成功');
                        await loadData();
                    } catch (err) {
                        showToast('⚠️ 删除失败: ' + err.message);
                    }
                });
            });
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // ============================================================
        // 图表渲染 (Canvas)
        // ============================================================
        function renderChart(data, groupBy) {
            const canvas = chartCanvas;
            const ctx = canvas.getContext('2d');
            const dpr = window.devicePixelRatio || 1;
            const rect = chartWrapper.getBoundingClientRect();
            const W = rect.width || 600;
            const H = rect.height || 200;

            canvas.style.width = W + 'px';
            canvas.style.height = H + 'px';
            canvas.width = W * dpr;
            canvas.height = H * dpr;
            ctx.scale(dpr, dpr);

            if (!data || data.length === 0) {
                chartEmpty.style.display = 'flex';
                canvas.style.display = 'none';
                return;
            }

            chartEmpty.style.display = 'none';
            canvas.style.display = 'block';

            const pad = { top: 24, bottom: 30, left: 10, right: 10 };
            const chartW = W - pad.left - pad.right;
            const chartH = H - pad.top - pad.bottom;
            const count = data.length;

            let maxVal = 0;
            data.forEach(d => {
                maxVal = Math.max(maxVal, d.income || 0, d.expense || 0);
            });
            maxVal = maxVal * 1.15 || 1;

            const barGap = Math.max(2, chartW / count * 0.25);
            const barWidth = Math.max(4, (chartW - barGap * (count + 1)) / count);

            ctx.clearRect(0, 0, W, H);

            // 背景网格
            ctx.strokeStyle = '#E8ECF0';
            ctx.lineWidth = 0.5;
            for (let i = 0; i <= 4; i++) {
                const y = pad.top + (chartH / 4) * i;
                ctx.beginPath();
                ctx.moveTo(pad.left, y);
                ctx.lineTo(W - pad.right, y);
                ctx.stroke();
                ctx.fillStyle = '#94A3B8';
                ctx.font = '9px sans-serif';
                ctx.textAlign = 'right';
                ctx.fillText(formatCurrency(maxVal * (1 - i / 4)), pad.left - 4, y + 3);
            }

            // 柱状图
            data.forEach((d, idx) => {
                const x = pad.left + barGap + idx * (barWidth + barGap);
                const incomeH = ((d.income || 0) / maxVal) * chartH;
                const expenseH = ((d.expense || 0) / maxVal) * chartH;

                if (d.expense > 0) {
                    const ex = x;
                    const ey = pad.top + chartH - expenseH;
                    const ew = barWidth / 2 - 1;
                    ctx.fillStyle = '#EF4444';
                    ctx.beginPath();
                    ctx.roundRect(ex, ey, ew, expenseH, [2, 2, 0, 0]);
                    ctx.fill();
                }

                if (d.income > 0) {
                    const ix = x + barWidth / 2 + 1;
                    const iy = pad.top + chartH - incomeH;
                    const iw = barWidth / 2 - 1;
                    ctx.fillStyle = '#22C55E';
                    ctx.beginPath();
                    ctx.roundRect(ix, iy, iw, incomeH, [2, 2, 0, 0]);
                    ctx.fill();
                }

                // 日期标签
                ctx.fillStyle = '#64748B';
                ctx.font = '9px sans-serif';
                ctx.textAlign = 'center';
                let label = d.date;
                if (groupBy === 'day') {
                    label = d.date.slice(5);
                }
                const step = Math.max(1, Math.floor(count / 12));
                if (idx % step === 0 || idx === count - 1) {
                    ctx.fillText(label, x + barWidth / 2, H - 4);
                }
            });

            // 图例
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'left';
            ctx.fillStyle = '#22C55E';
            ctx.fillRect(W - 70, 8, 10, 10);
            ctx.fillStyle = '#1E293B';
            ctx.fillText('收入', W - 56, 17);
            ctx.fillStyle = '#EF4444';
            ctx.fillRect(W - 28, 8, 10, 10);
            ctx.fillStyle = '#1E293B';
            ctx.fillText('支出', W - 14, 17);
        }

        // roundRect polyfill
        if (!CanvasRenderingContext2D.prototype.roundRect) {
            CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, radii) {
                const r = Array.isArray(radii) ? radii : [radii, radii, radii, radii];
                const [tl, tr, br, bl] = r.map(v => Math.min(v || 0, Math.min(w, h) / 2));
                this.moveTo(x + tl, y);
                this.lineTo(x + w - tr, y);
                this.quadraticCurveTo(x + w, y, x + w, y + tr);
                this.lineTo(x + w, y + h - br);
                this.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
                this.lineTo(x + bl, y + h);
                this.quadraticCurveTo(x, y + h, x, y + h - bl);
                this.lineTo(x, y + tl);
                this.quadraticCurveTo(x, y, x + tl, y);
                this.closePath();
                return this;
            };
        }

        // ============================================================
        // 事件绑定
        // ============================================================
        function setupEventListeners() {
            // 类型切换
            typeToggle.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('click', () => {
                    typeToggle.querySelectorAll('button').forEach(b => { b.className = ''; });
                    const type = btn.dataset.type;
                    currentType = type;
                    btn.className = type === 'income' ? 'active-income' : 'active-expense';
                    updateCategorySelect();
                });
            });

            // 表单提交
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const category_id = categorySelect.value;
                const amount = amountInput.value.trim();
                const transaction_date = dateInput.value;
                const description = noteInput.value.trim();

                if (!category_id) {
                    showToast('⚠️ 请选择分类');
                    return;
                }
                if (!amount || parseFloat(amount) <= 0) {
                    showToast('⚠️ 请输入有效金额');
                    amountInput.focus();
                    return;
                }
                if (!transaction_date) {
                    showToast('⚠️ 请选择日期');
                    dateInput.focus();
                    return;
                }

                try {
                    const result = await apiPost('/transactions', {
                        category_id: parseInt(category_id),
                        amount: parseFloat(amount),
                        transaction_date,
                        description: description || null
                    });
                    showToast('✅ 添加成功');
                    amountInput.value = '';
                    noteInput.value = '';
                    dateInput.value = getTodayStr();
                    await loadData();
                } catch (err) {
                    showToast('⚠️ 添加失败: ' + err.message);
                }
            });

            // 筛选按钮
            filterBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    filterBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    currentFilter = btn.dataset.period;
                    if (currentFilter === 'custom') {
                        // 使用自定义日期
                    } else {
                        const range = getFilterRange();
                        if (range.start) filterStart.value = range.start;
                        if (range.end) filterEnd.value = range.end;
                    }
                    loadData();
                });
            });

            // 自定义筛选
            applyCustom.addEventListener('click', () => {
                if (!filterStart.value || !filterEnd.value) {
                    showToast('⚠️ 请选择开始和结束日期');
                    return;
                }
                if (filterStart.value > filterEnd.value) {
                    showToast('⚠️ 开始日期不能晚于结束日期');
                    return;
                }
                filterBtns.forEach(b => b.classList.remove('active'));
                currentFilter = 'custom';
                loadData();
            });
        }

        // ============================================================
        // 初始化
        // ============================================================
        async function init() {
            // 设置日期默认值
            const today = new Date();
            dateInput.value = formatDate(today);
            const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
            const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            filterStart.value = formatDate(firstDay);
            filterEnd.value = formatDate(lastDay);

            setupEventListeners();

            // 连接测试
            try {
                const healthRes = await apiGet('/health');
                statusDot.className = 'dot online';
                statusText.textContent = '已连接';
            } catch (err) {
                statusDot.className = 'dot offline';
                statusText.textContent = '连接失败';
                showToast('⚠️ 后端服务连接失败，请确保 server.js 已启动');
            }

            // 加载分类
            const catLoaded = await loadCategories();
            if (!catLoaded) {
                showToast('⚠️ 无法加载分类数据，请检查数据库连接');
            }

            // 加载交易数据
            await loadData();

            // 窗口resize重新绘制图表
            let resizeTimer;
            window.addEventListener('resize', () => {
                clearTimeout(resizeTimer);
                resizeTimer = setTimeout(() => {
                    if (transactions.length > 0) loadChartData();
                }, 300);
            });
        }

        // 启动
        init();