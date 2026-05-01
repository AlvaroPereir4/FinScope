document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('financeChart')) return;

    const filterBtns = document.querySelectorAll('.filter-btn');
    const yearSelect = document.getElementById('dashboard-year');
    const chartBtns = document.querySelectorAll('.chart-btn');
    const zoomContainer = document.getElementById('zoom-container');
    const chartZoom = document.getElementById('chart-zoom');
    const zoomLabel = document.getElementById('zoom-label');
    const viewModeSelect = document.getElementById('chart-view-mode');
    const historyTableBody = document.querySelector('#history-table tbody');
    const paginationControls = document.getElementById('pagination-controls');

    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            AppState.currentFilter = btn.dataset.period;
            loadData();
        });
    });

    if (yearSelect) {
        yearSelect.addEventListener('change', () => {
            AppState.selectedYear = yearSelect.value;
            if (AppState.currentFilter !== 'year') {
                filterBtns.forEach(b => b.classList.remove('active'));
                document.querySelector('[data-period="year"]').classList.add('active');
                AppState.currentFilter = 'year';
            }
            loadData();
        });
    }

    chartBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            chartBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            AppState.chartGranularity = btn.dataset.granularity;
            zoomContainer.style.display = AppState.chartGranularity === 'day' ? 'flex' : 'none';
            loadData();
        });
    });

    if (chartZoom) {
        chartZoom.addEventListener('input', () => {
            AppState.chartDays = parseInt(chartZoom.value);
            zoomLabel.textContent = `${AppState.chartDays} Dias`;
            loadData();
        });
    }

    if (viewModeSelect) viewModeSelect.addEventListener('change', loadData);

    loadYears();

    async function loadYears() {
        try {
            const res = await fetch('/api/years');
            const years = await res.json();
            yearSelect.innerHTML = '';
            years.forEach(year => {
                const opt = document.createElement('option');
                opt.value = year;
                opt.textContent = year;
                if (year === AppState.selectedYear) opt.selected = true;
                yearSelect.appendChild(opt);
            });
            loadData();
        } catch (err) { console.error(err); }
    }

    window.loadData = async function(isSearch = false) {
        try {
            const params = new URLSearchParams({
                period: AppState.currentFilter,
                year: AppState.selectedYear,
                granularity: AppState.chartGranularity,
                view_mode: viewModeSelect ? viewModeSelect.value : 'general',
            });
            const res = await fetch(`/api/dashboard?${params}`);
            const data = await res.json();
            updateDashboard(data.summary);
            updateChart(data.chart_data);
            loadTransactionsPage(1);
        } catch (err) { console.error(err); }
    };

    async function loadTransactionsPage(page) {
        try {
            const res = await fetch(`/api/transactions?page=${page}`);
            const pageData = await res.json();
            AppState.allTableData = pageData.items;
            AppState.currentPage = pageData.current_page;
            renderPagination(pageData);
            renderTablePage();
        } catch (err) { console.error(err); }
    }

    function updateDashboard(summary) {
        document.getElementById('total-income').textContent = formatCurrency(summary.total_income);
        document.getElementById('total-expense').textContent = formatCurrency(summary.total_expense);
        const balanceEl = document.getElementById('balance');
        balanceEl.textContent = formatCurrency(summary.balance);
        balanceEl.style.color = summary.balance >= 0 ? 'var(--success-color)' : 'var(--danger-color)';
        document.getElementById('total-invested-dash').textContent = formatCurrency(summary.total_invested);
        document.getElementById('net-worth').textContent = formatCurrency(summary.net_worth);
    }

    function renderPagination(pageData) {
        if (!paginationControls) return;
        paginationControls.innerHTML = '';
        const { total_items, current_page, total_pages } = pageData;
        const summary = document.createElement('div');
        summary.style.cssText = 'width:100%;text-align:center;margin-bottom:.5rem;font-size:.9rem;color:var(--text-secondary)';
        const start = (current_page - 1) * AppState.itemsPerPage + 1;
        const end = Math.min(current_page * AppState.itemsPerPage, total_items);
        summary.textContent = `Mostrando ${start}-${end} de ${total_items} registros`;
        paginationControls.appendChild(summary);
        if (total_pages <= 1) return;
        for (let i = 1; i <= total_pages; i++) {
            const btn = document.createElement('button');
            btn.className = `page-btn ${i === current_page ? 'active' : ''}`;
            btn.textContent = i;
            btn.onclick = () => loadTransactionsPage(i);
            paginationControls.appendChild(btn);
        }
    }

    function renderTablePage() {
        historyTableBody.innerHTML = '';
        AppState.allTableData.forEach(item => {
            const isIncome = item.type === 'income';
            let details = isIncome
                ? `<span class="badge" style="background:#2ecc71;color:#fff">Renda</span>`
                : item.source === 'macro'
                    ? `<span class="badge" style="background:#e74c3c;color:#fff">Conta</span>${item.card_name ? ` <span class="badge card">💳 ${item.card_name}</span>` : ''}`
                    : `<span class="badge method">${item.payment_method || '-'}</span>`;
            const itemStr = encodeURIComponent(JSON.stringify(item));
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${formatDate(item.date)}</td>
                <td style="color:${isIncome ? 'var(--success-color)' : 'var(--danger-color)'}">${isIncome ? 'Renda' : 'Saída'}</td>
                <td>${item.description}</td>
                <td>${details}</td>
                <td class="${isIncome ? 'amount-positive' : 'amount-negative'}">${isIncome ? '+' : '-'} ${formatCurrency(item.amount)}</td>
                <td>
                    <button class="btn-icon-small edit" onclick="editExpense('${itemStr}')">✎</button>
                    <button class="btn-icon-small delete" onclick="deleteExpense('${item._id}','${item.source || 'income'}')">🗑</button>
                </td>`;
            historyTableBody.appendChild(row);
        });
    }

    function updateChart(chartData) {
        const ctx = document.getElementById('financeChart').getContext('2d');
        if (AppState.financeChart) AppState.financeChart.destroy();
        AppState.financeChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: chartData.labels,
                datasets: chartData.datasets.map(ds => ({
                    ...ds,
                    borderWidth: ds.borderWidth || 1.5,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    tension: ds.tension !== undefined ? ds.tension : 0.2,
                    fill: ds.fill !== undefined ? ds.fill : true,
                })),
            },
            options: buildChartOptions((e, els, chart) => {
                if (typeof handleChartClick === 'function') handleChartClick(e, els, chart, 'macro', AppState.selectedYear);
            }),
        });
    }
});

function buildChartOptions(onClick) {
    const fontSans = "'Inter', sans-serif";
    const fontMono = "'Fira Code', monospace";
    return {
        responsive: true,
        maintainAspectRatio: false,
        onClick,
        interaction: { mode: 'index', intersect: false },
        plugins: {
            legend: { labels: { color: '#e6e1de', font: { family: fontSans, size: 12, weight: 500 }, boxWidth: 10, usePointStyle: true } },
            tooltip: {
                backgroundColor: 'rgba(26, 24, 23, 0.9)',
                titleFont: { family: fontSans, size: 13 },
                bodyFont: { family: fontMono, size: 12 },
                borderColor: '#2a2827', borderWidth: 1, cornerRadius: 2,
                callbacks: {
                    label: ctx => {
                        const label = ctx.dataset.label ? ctx.dataset.label + ': ' : '';
                        return label + new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(ctx.parsed.y);
                    },
                },
            },
        },
        scales: {
            y: { beginAtZero: true, grid: { color: '#2a2827', borderDash: [2, 4], drawBorder: false }, ticks: { color: '#8f8681', font: { family: fontMono, size: 10 } } },
            x: { grid: { display: false }, ticks: { color: '#8f8681', font: { family: fontSans, size: 11 } } },
        },
    };
}
