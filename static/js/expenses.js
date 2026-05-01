document.addEventListener('DOMContentLoaded', () => {
    const incomeForm = document.getElementById('income-form');
    const expenseForm = document.getElementById('expense-form');
    const consolidatedForm = document.getElementById('consolidated-form');
    const historyTableBody = document.querySelector('#history-table tbody');
    const cardSelect = document.getElementById('exp-card');
    const methodSelect = document.getElementById('exp-method');
    const cardGroup = document.getElementById('card-select-group');
    const btnCancelEdit = document.getElementById('btn-cancel-edit');
    const btnSaveExpense = document.getElementById('btn-save-expense');
    const btnSaveConsolidated = consolidatedForm ? consolidatedForm.querySelector('button[type="submit"]') : null;
    const btnSaveIncome = incomeForm ? incomeForm.querySelector('button[type="submit"]') : null;
    const searchTerm = document.getElementById('search-term');
    const detChartBtns = document.querySelectorAll('.det-chart-btn');
    const detZoomContainer = document.getElementById('det-zoom-container');
    const detChartZoom = document.getElementById('det-chart-zoom');
    const detZoomLabel = document.getElementById('det-zoom-label');

    if (document.getElementById('inc-date')) document.getElementById('inc-date').value = AppState.today;
    if (document.getElementById('exp-date')) document.getElementById('exp-date').value = AppState.today;
    if (document.getElementById('cons-date')) document.getElementById('cons-date').value = AppState.today;

    if (incomeForm) incomeForm.addEventListener('submit', e => handleFormSubmit(e, 'income'));
    if (expenseForm) expenseForm.addEventListener('submit', e => handleFormSubmit(e, 'expense'));
    if (consolidatedForm) consolidatedForm.addEventListener('submit', e => handleFormSubmit(e, 'consolidated'));
    if (methodSelect) methodSelect.addEventListener('change', toggleCardSelect);
    if (btnCancelEdit) btnCancelEdit.addEventListener('click', cancelEdit);
    if (searchTerm) searchTerm.addEventListener('input', () => loadDetailedData(true));

    detChartBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            detChartBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            AppState.detChartGranularity = btn.dataset.granularity;
            if (detZoomContainer) detZoomContainer.style.display = AppState.detChartGranularity === 'day' ? 'flex' : 'none';
            updateDetailedChart(AppState.cachedDetailedExpenses);
        });
    });

    if (detChartZoom) {
        detChartZoom.addEventListener('input', () => {
            AppState.detChartDays = parseInt(detChartZoom.value);
            if (detZoomLabel) detZoomLabel.textContent = `${AppState.detChartDays} Dias`;
            updateDetailedChart(AppState.cachedDetailedExpenses);
        });
    }

    if (window.location.pathname === '/detailed') {
        loadCards();
        loadDetailedData();
    }

    if (document.getElementById('financeChart')) {
        loadCards();
    }

    function toggleCardSelect() {
        if (!methodSelect) return;
        const isCredit = methodSelect.value === 'credit';
        cardGroup.style.display = isCredit ? 'grid' : 'none';
        if (!isCredit) {
            cardSelect.value = '';
            document.getElementById('exp-installments').value = '';
        }
    }

    async function handleFormSubmit(e, type) {
        e.preventDefault();
        let url, method = 'POST', data = {};

        if (type === 'income') {
            url = '/api/incomes';
            data = {
                description: document.getElementById('inc-desc').value,
                amount: parseFloat(document.getElementById('inc-amount').value),
                date: document.getElementById('inc-date').value,
            };
            if (AppState.isEditing && AppState.editingType === 'income') { url += `/${AppState.editingId}`; method = 'PUT'; }
        } else if (type === 'consolidated') {
            url = '/api/macro-expenses';
            data = {
                description: document.getElementById('cons-desc').value,
                amount: parseFloat(document.getElementById('cons-amount').value),
                date: document.getElementById('cons-date').value,
                category: document.getElementById('cons-category').value,
                card_id: document.getElementById('cons-card').value || null,
                payment_method: document.getElementById('cons-method').value,
            };
            if (AppState.isEditing && AppState.editingType === 'macro') { url += `/${AppState.editingId}`; method = 'PUT'; }
        } else {
            url = '/api/expenses';
            data = {
                description: document.getElementById('exp-desc').value,
                amount: parseFloat(document.getElementById('exp-amount').value),
                date: document.getElementById('exp-date').value,
                establishment: document.getElementById('exp-establishment').value,
                buyer: document.getElementById('exp-buyer').value,
                category: document.getElementById('exp-category').value,
                payment_method: document.getElementById('exp-method').value,
                card_id: document.getElementById('exp-card').value || null,
                installments: document.getElementById('exp-installments').value,
                observation: document.getElementById('exp-obs').value,
                is_consolidated: false,
            };
            if (AppState.isEditing && AppState.editingType === 'micro') { url += `/${AppState.editingId}`; method = 'PUT'; }
        }

        try {
            const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
            if (response.ok) {
                if (AppState.isEditing) cancelEdit();
                else e.target.reset();
                if (type === 'income') document.getElementById('inc-date').value = AppState.today;
                else if (type === 'consolidated') document.getElementById('cons-date').value = AppState.today;
                else { document.getElementById('exp-date').value = AppState.today; toggleCardSelect(); }
                if (window.location.pathname === '/detailed') loadDetailedData();
                else if (typeof loadData === 'function') loadData();
            } else { alert('Error saving data'); }
        } catch (err) { console.error(err); }
    }

    window.editExpense = function(expenseStr) {
        const item = JSON.parse(decodeURIComponent(expenseStr));
        AppState.isEditing = true;
        AppState.editingId = item._id;

        if (item.type === 'income') {
            AppState.editingType = 'income';
            if (!incomeForm) return;
            document.getElementById('inc-desc').value = item.description;
            document.getElementById('inc-amount').value = item.amount;
            document.getElementById('inc-date').value = item.date;
            if (btnSaveIncome) btnSaveIncome.textContent = 'Atualizar Renda';
            _showCancelBtn('btn-cancel-income', incomeForm);
            _expandAndScroll(incomeForm);
        } else if (item.is_consolidated || item.source === 'macro') {
            AppState.editingType = 'macro';
            if (!consolidatedForm) return;
            document.getElementById('cons-desc').value = item.description;
            document.getElementById('cons-amount').value = item.amount;
            document.getElementById('cons-date').value = item.date;
            document.getElementById('cons-category').value = item.category || '';
            document.getElementById('cons-card').value = item.card_id || '';
            document.getElementById('cons-method').value = item.payment_method || 'debit';
            if (btnSaveConsolidated) btnSaveConsolidated.textContent = 'Atualizar Conta';
            _showCancelBtn('btn-cancel-macro', consolidatedForm);
            _expandAndScroll(consolidatedForm);
        } else {
            AppState.editingType = 'micro';
            document.getElementById('exp-desc').value = item.description;
            document.getElementById('exp-amount').value = item.amount;
            document.getElementById('exp-date').value = item.date;
            document.getElementById('exp-establishment').value = item.establishment || '';
            document.getElementById('exp-buyer').value = item.buyer || '';
            document.getElementById('exp-category').value = item.category || '';
            document.getElementById('exp-method').value = item.payment_method || 'debit';
            document.getElementById('exp-obs').value = item.observation || '';
            if (item.payment_method === 'credit') {
                cardGroup.style.display = 'grid';
                document.getElementById('exp-card').value = item.card_id || '';
                document.getElementById('exp-installments').value = item.installments || '';
            } else { cardGroup.style.display = 'none'; }
            if (btnSaveExpense) btnSaveExpense.textContent = 'Atualizar Gasto';
            if (btnCancelEdit) btnCancelEdit.style.display = 'inline-block';
            _expandAndScroll(expenseForm);
        }
    };

    window.deleteExpense = async function(id, source) {
        if (!confirm('Tem certeza que deseja excluir este registro?')) return;
        let url = `/api/expenses/${id}`;
        if (source === 'macro') url = `/api/macro-expenses/${id}`;
        else if (source === 'income') url = `/api/incomes/${id}`;
        try {
            const res = await fetch(url, { method: 'DELETE' });
            if (res.ok) {
                if (window.location.pathname === '/detailed') loadDetailedData();
                else if (typeof loadData === 'function') loadData();
            }
        } catch (err) { console.error(err); }
    };

    function cancelEdit() {
        AppState.isEditing = false;
        AppState.editingId = null;
        AppState.editingType = null;
        if (expenseForm) {
            expenseForm.reset();
            document.getElementById('exp-date').value = AppState.today;
            if (btnSaveExpense) btnSaveExpense.textContent = 'Registrar Gasto';
            if (btnCancelEdit) btnCancelEdit.style.display = 'none';
            toggleCardSelect();
        }
        if (consolidatedForm) {
            consolidatedForm.reset();
            document.getElementById('cons-date').value = AppState.today;
            if (btnSaveConsolidated) btnSaveConsolidated.textContent = 'Registrar Saída';
            const btn = document.getElementById('btn-cancel-macro');
            if (btn) btn.style.display = 'none';
        }
        if (incomeForm) {
            incomeForm.reset();
            document.getElementById('inc-date').value = AppState.today;
            if (btnSaveIncome) btnSaveIncome.textContent = 'Adicionar Renda';
            const btn = document.getElementById('btn-cancel-income');
            if (btn) btn.style.display = 'none';
        }
    }

    window.loadDetailedData = async function(isSearch = false) {
        if (!historyTableBody) return;
        try {
            let url = '/api/expenses?view_type=detailed';
            if (isSearch && searchTerm && searchTerm.value) url += `&search=${searchTerm.value}`;
            const res = await fetch(url);
            const expenses = await res.json();
            AppState.cachedDetailedExpenses = expenses;
            updateDetailedChart(expenses);
            historyTableBody.innerHTML = '';
            expenses.forEach(item => {
                let details = item.payment_method === 'credit' && item.card_name
                    ? `<span class="badge card">💳 ${item.card_name}</span>${item.installments ? ` <span class="badge installments">${item.installments}x</span>` : ''}`
                    : `<span class="badge method">${item.payment_method || '-'}</span>`;
                if (item.is_consolidated) {
                    details += ` <span class="badge" style="background:#e74c3c;color:#fff">Macro</span>`;
                    if (item.card_name) details += ` <span class="badge card">💳 ${item.card_name}</span>`;
                }
                const itemStr = encodeURIComponent(JSON.stringify(item));
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${formatDate(item.date)}</td>
                    <td>${item.description}</td>
                    <td>${item.buyer || '-'}</td>
                    <td>${details}</td>
                    <td class="amount-negative">- ${formatCurrency(item.amount)}</td>
                    <td>
                        <button class="btn-icon-small edit" onclick="editExpense('${itemStr}')">✎</button>
                        <button class="btn-icon-small delete" onclick="deleteExpense('${item._id}')">🗑</button>
                    </td>`;
                historyTableBody.appendChild(row);
            });
        } catch (err) { console.error(err); }
    };

    function updateDetailedChart(expenses) {
        const canvas = document.getElementById('detailedChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const dataMap = {};
        const getKey = date => {
            if (AppState.detChartGranularity === 'day') return date;
            if (AppState.detChartGranularity === 'year') return date.substring(0, 4);
            return date.substring(0, 7);
        };
        expenses.forEach(item => {
            const key = getKey(item.date);
            if (!dataMap[key]) dataMap[key] = { credit: 0, debit: 0 };
            if (item.payment_method === 'credit') dataMap[key].credit += item.amount;
            else dataMap[key].debit += item.amount;
        });
        let sortedKeys = Object.keys(dataMap).sort();
        if (AppState.detChartGranularity === 'day') sortedKeys = sortedKeys.slice(-AppState.detChartDays);
        const labels = sortedKeys.map(k => {
            if (AppState.detChartGranularity === 'day') { const [, m, d] = k.split('-'); return `${d}/${m}`; }
            if (AppState.detChartGranularity === 'year') return k;
            const [y, m] = k.split('-'); return `${m}/${y}`;
        });
        if (AppState.detailedChart) AppState.detailedChart.destroy();
        AppState.detailedChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    { label: 'Crédito', data: sortedKeys.map(k => dataMap[k].credit), borderColor: '#9b59b6', backgroundColor: 'rgba(155,89,182,0.1)', tension: 0.2, fill: true, borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 4 },
                    { label: 'Débito/Outros', data: sortedKeys.map(k => dataMap[k].debit), borderColor: '#e67e22', backgroundColor: 'rgba(230,126,34,0.1)', tension: 0.2, fill: true, borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 4 },
                ],
            },
            options: buildChartOptions((e, els, chart) => {
                if (typeof handleChartClick === 'function') handleChartClick(e, els, chart, 'micro', AppState.selectedYear);
            }),
        });
    }

    async function loadCards() {
        try {
            const res = await fetch('/api/cards');
            const cards = await res.json();
            [document.getElementById('exp-card'), document.getElementById('cons-card')].forEach(sel => {
                if (!sel) return;
                const defaultOpt = sel.id === 'cons-card' ? '<option value="">Nenhum</option>' : '<option value="">Selecione...</option>';
                sel.innerHTML = defaultOpt;
                cards.forEach(card => {
                    const opt = document.createElement('option');
                    opt.value = card._id;
                    opt.textContent = card.name;
                    sel.appendChild(opt);
                });
            });
        } catch (err) { console.error(err); }
    }

    function _showCancelBtn(id, form) {
        let btn = document.getElementById(id);
        if (!btn) {
            btn = document.createElement('button');
            btn.id = id;
            btn.type = 'button';
            btn.className = 'btn-secondary';
            btn.textContent = 'Cancelar';
            btn.style.marginTop = '1rem';
            btn.onclick = cancelEdit;
            form.appendChild(btn);
        }
        btn.style.display = 'block';
    }

    function _expandAndScroll(form) {
        const section = form.closest('.input-section');
        if (section && section.classList.contains('collapsed')) section.classList.remove('collapsed');
        form.scrollIntoView({ behavior: 'smooth' });
    }
});
