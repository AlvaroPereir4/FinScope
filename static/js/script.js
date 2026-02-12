document.addEventListener('DOMContentLoaded', () => {
    // --- Elements ---
    const incomeForm = document.getElementById('income-form');
    const expenseForm = document.getElementById('expense-form');
    const historyTableBody = document.querySelector('#history-table tbody');
    const cardSelect = document.getElementById('exp-card');
    const methodSelect = document.getElementById('exp-method');
    const cardGroup = document.getElementById('card-select-group');
    const categorySelect = document.getElementById('exp-category');
    const buyerSelect = document.getElementById('exp-buyer');
    const btnCancelEdit = document.getElementById('btn-cancel-edit');
    const btnSaveExpense = document.getElementById('btn-save-expense');
    
    // Search
    const btnSearch = document.getElementById('btn-search');
    const btnClear = document.getElementById('btn-clear');
    const searchTerm = document.getElementById('search-term');
    const searchStart = document.getElementById('search-start');
    const searchEnd = document.getElementById('search-end');
    const searchTotalAmount = document.getElementById('search-total-amount');
    const searchCount = document.getElementById('search-count');

    // Settings Modal
    const btnSettings = document.getElementById('btn-settings');
    const settingsModal = document.getElementById('settings-modal');
    const closeModal = document.querySelector('.close-modal');
    const categoriesList = document.getElementById('categories-list');
    const buyersList = document.getElementById('buyers-list');
    const newCategoryInput = document.getElementById('new-category-input');
    const newBuyerInput = document.getElementById('new-buyer-input');
    const btnAddCategory = document.getElementById('btn-add-category');
    const btnAddBuyer = document.getElementById('btn-add-buyer');
    const btnSaveSettings = document.getElementById('btn-save-settings');
    
    // Invoice Page Elements
    const invoiceSection = document.getElementById('invoice-section');
    const invoiceMonthInput = document.getElementById('invoice-month');
    const btnLoadInvoice = document.getElementById('btn-load-invoice');
    
    // Investments & Goals Elements
    const investmentForm = document.getElementById('investment-form');
    const goalForm = document.getElementById('goal-form');
    const investmentsTable = document.querySelector('#investments-table tbody');
    const goalsContainer = document.getElementById('goals-container');
    const totalInvestedEl = document.getElementById('total-invested');

    // State
    let currentCategories = [];
    let currentBuyers = [];
    let isEditing = false;
    let editingId = null;
    
    // Default dates
    const today = new Date().toISOString().split('T')[0];
    if(document.getElementById('inc-date')) document.getElementById('inc-date').value = today;
    if(document.getElementById('exp-date')) document.getElementById('exp-date').value = today;
    if(invoiceMonthInput) invoiceMonthInput.value = today.substring(0, 7);

    let financeChart = null;

    // --- Initial Load ---
    if(document.getElementById('financeChart')) {
        loadData();
        loadCards();
        loadSettings();
    }
    
    if(document.getElementById('cards-container')) {
        loadCardsPage();
    }

    if(document.getElementById('investments-table')) {
        loadInvestments();
        loadGoals();
    }

    // --- Event Listeners ---
    if(incomeForm) incomeForm.addEventListener('submit', (e) => handleFormSubmit(e, 'income'));
    if(expenseForm) expenseForm.addEventListener('submit', (e) => handleFormSubmit(e, 'expense'));
    
    if(methodSelect) methodSelect.addEventListener('change', toggleCardSelect);
    if(btnCancelEdit) btnCancelEdit.addEventListener('click', cancelEdit);
    
    if(btnSearch) btnSearch.addEventListener('click', () => loadData(true));
    if(btnClear) btnClear.addEventListener('click', clearSearch);

    // Settings Events
    if(btnSettings) {
        btnSettings.addEventListener('click', () => {
            settingsModal.style.display = 'flex';
            renderTagsList(categoriesList, currentCategories, 'category');
            renderTagsList(buyersList, currentBuyers, 'buyer');
        });
        
        closeModal.addEventListener('click', () => settingsModal.style.display = 'none');
        window.addEventListener('click', (e) => {
            if (e.target === settingsModal) settingsModal.style.display = 'none';
        });

        btnAddCategory.addEventListener('click', () => addTag(newCategoryInput, currentCategories, categoriesList, 'category'));
        btnAddBuyer.addEventListener('click', () => addTag(newBuyerInput, currentBuyers, buyersList, 'buyer'));
        btnSaveSettings.addEventListener('click', saveSettings);
    }

    // Invoice Events
    if(btnLoadInvoice) {
        btnLoadInvoice.addEventListener('click', () => {
            const cardId = invoiceSection.dataset.cardId;
            loadInvoice(cardId);
        });
    }

    // Investments & Goals Events
    if(investmentForm) {
        investmentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('inv-id').value;
            const data = {
                name: document.getElementById('inv-name').value,
                type: document.getElementById('inv-type').value,
                amount: parseFloat(document.getElementById('inv-amount').value)
            };
            
            const url = id ? `/api/investments/${id}` : '/api/investments';
            const method = id ? 'PUT' : 'POST';
            
            try {
                const res = await fetch(url, {
                    method: method,
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(data)
                });
                if(res.ok) {
                    document.getElementById('investment-modal').style.display = 'none';
                    loadInvestments();
                }
            } catch(err) { console.error(err); }
        });
    }

    if(goalForm) {
        goalForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('goal-id').value;
            const data = {
                title: document.getElementById('goal-title').value,
                target_amount: parseFloat(document.getElementById('goal-target').value),
                current_amount: parseFloat(document.getElementById('goal-current').value),
                deadline: document.getElementById('goal-deadline').value
            };
            
            const url = id ? `/api/goals/${id}` : '/api/goals';
            const method = id ? 'PUT' : 'POST';
            
            try {
                const res = await fetch(url, {
                    method: method,
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(data)
                });
                if(res.ok) {
                    document.getElementById('goal-modal').style.display = 'none';
                    loadGoals();
                }
            } catch(err) { console.error(err); }
        });
    }

    // --- Functions ---

    function toggleCardSelect() {
        const method = methodSelect.value;
        if (method === 'credito') {
            cardGroup.style.display = 'grid';
        } else {
            cardGroup.style.display = 'none';
            cardSelect.value = '';
            document.getElementById('exp-installments').value = '';
        }
    }

    function clearSearch() {
        searchTerm.value = '';
        searchStart.value = '';
        searchEnd.value = '';
        loadData(false);
    }

    // --- Settings Logic ---

    async function loadSettings() {
        try {
            const res = await fetch('/api/settings');
            const data = await res.json();
            currentCategories = data.categories || [];
            currentBuyers = data.buyers || [];
            updateSelects();
        } catch (err) { console.error(err); }
    }

    async function saveSettings() {
        try {
            const res = await fetch('/api/settings', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ categories: currentCategories, buyers: currentBuyers })
            });
            if(res.ok) {
                settingsModal.style.display = 'none';
                updateSelects();
                alert('Configurações salvas!');
            }
        } catch (err) { console.error(err); }
    }

    function addTag(input, list, container, type) {
        const val = input.value.trim();
        if(val && !list.includes(val)) {
            list.push(val);
            input.value = '';
            renderTagsList(container, list, type);
        }
    }

    function renderTagsList(container, list, type) {
        container.innerHTML = '';
        list.forEach((item, index) => {
            const el = document.createElement('div');
            el.className = 'category-item';
            el.innerHTML = `
                <span>${item}</span>
                <button class="btn-remove-tag" data-index="${index}" data-type="${type}">×</button>
            `;
            container.appendChild(el);
        });

        container.querySelectorAll('.btn-remove-tag').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.dataset.index);
                list.splice(idx, 1);
                renderTagsList(container, list, type);
            });
        });
    }

    function updateSelects() {
        if(categorySelect) {
            categorySelect.innerHTML = '';
            currentCategories.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat;
                opt.textContent = cat;
                categorySelect.appendChild(opt);
            });
        }
        if(buyerSelect) {
            buyerSelect.innerHTML = '';
            currentBuyers.forEach(buyer => {
                const opt = document.createElement('option');
                opt.value = buyer;
                opt.textContent = buyer;
                buyerSelect.appendChild(opt);
            });
        }
    }

    // --- Investments & Goals Logic ---

    async function loadInvestments() {
        try {
            const res = await fetch('/api/investments');
            const invs = await res.json();
            
            investmentsTable.innerHTML = '';
            let total = 0;
            
            invs.forEach(inv => {
                total += inv.amount;
                const row = document.createElement('tr');
                const invStr = encodeURIComponent(JSON.stringify(inv));
                
                row.innerHTML = `
                    <td>${inv.name}</td>
                    <td><span class="badge method">${inv.type}</span></td>
                    <td class="amount-positive">${formatCurrency(inv.amount)}</td>
                    <td>
                        <button class="btn-icon-small edit" onclick="editInvestment('${invStr}')">✎</button>
                        <button class="btn-icon-small delete" onclick="deleteInvestment('${inv._id}')">🗑</button>
                    </td>
                `;
                investmentsTable.appendChild(row);
            });
            
            totalInvestedEl.textContent = formatCurrency(total);
        } catch(err) { console.error(err); }
    }

    async function loadGoals() {
        try {
            const res = await fetch('/api/goals');
            const goals = await res.json();
            
            goalsContainer.innerHTML = '';
            
            goals.forEach(goal => {
                const percent = Math.min(100, (goal.current_amount / goal.target_amount) * 100);
                const goalStr = encodeURIComponent(JSON.stringify(goal));
                
                const el = document.createElement('div');
                el.className = 'goal-card';
                el.innerHTML = `
                    <div class="goal-header">
                        <h3>${goal.title}</h3>
                        <div class="goal-actions">
                            <button class="btn-icon-small edit" onclick="editGoal('${goalStr}')">✎</button>
                            <button class="btn-icon-small delete" onclick="deleteGoal('${goal._id}')">🗑</button>
                        </div>
                    </div>
                    <div class="goal-progress-bar">
                        <div class="progress-fill" style="width: ${percent}%"></div>
                    </div>
                    <div class="goal-stats">
                        <span>${formatCurrency(goal.current_amount)} / ${formatCurrency(goal.target_amount)}</span>
                        <span>${percent.toFixed(1)}%</span>
                    </div>
                    <div class="goal-deadline">Meta: ${formatDate(goal.deadline)}</div>
                `;
                goalsContainer.appendChild(el);
            });
        } catch(err) { console.error(err); }
    }

    window.editInvestment = function(invStr) {
        const inv = JSON.parse(decodeURIComponent(invStr));
        document.getElementById('inv-id').value = inv._id;
        document.getElementById('inv-name').value = inv.name;
        document.getElementById('inv-type').value = inv.type;
        document.getElementById('inv-amount').value = inv.amount;
        document.getElementById('inv-modal-title').textContent = 'Editar Investimento';
        document.getElementById('investment-modal').style.display = 'flex';
    };

    window.deleteInvestment = async function(id) {
        if(!confirm('Excluir este investimento?')) return;
        await fetch(`/api/investments/${id}`, { method: 'DELETE' });
        loadInvestments();
    };

    window.editGoal = function(goalStr) {
        const goal = JSON.parse(decodeURIComponent(goalStr));
        document.getElementById('goal-id').value = goal._id;
        document.getElementById('goal-title').value = goal.title;
        document.getElementById('goal-target').value = goal.target_amount;
        document.getElementById('goal-current').value = goal.current_amount;
        document.getElementById('goal-deadline').value = goal.deadline;
        document.getElementById('goal-modal-title').textContent = 'Editar Meta';
        document.getElementById('goal-modal').style.display = 'flex';
    };

    window.deleteGoal = async function(id) {
        if(!confirm('Excluir esta meta?')) return;
        await fetch(`/api/goals/${id}`, { method: 'DELETE' });
        loadGoals();
    };

    // --- Data Logic (Dashboard) ---

    async function loadCards() {
        try {
            const res = await fetch('/api/cards');
            const cards = await res.json();
            
            if(cardSelect) {
                const currentVal = cardSelect.value;
                cardSelect.innerHTML = '<option value="">Selecione...</option>';
                cards.forEach(card => {
                    const option = document.createElement('option');
                    option.value = card._id;
                    option.textContent = card.name;
                    cardSelect.appendChild(option);
                });
                if(currentVal) cardSelect.value = currentVal;
            }
        } catch (err) { console.error(err); }
    }

    async function handleFormSubmit(e, type) {
        e.preventDefault();
        
        const isIncome = type === 'income';
        let url = isIncome ? '/api/incomes' : '/api/expenses';
        let method = 'POST';

        let data = {};

        if (isIncome) {
            data = {
                description: document.getElementById('inc-desc').value,
                amount: parseFloat(document.getElementById('inc-amount').value),
                date: document.getElementById('inc-date').value
            };
        } else {
            // Expense Data
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
                observation: document.getElementById('exp-obs').value
            };

            if (isEditing) {
                url += `/${editingId}`;
                method = 'PUT';
            }
        }

        try {
            const response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (response.ok) {
                if (isEditing) cancelEdit();
                else e.target.reset();
                
                document.getElementById(isIncome ? 'inc-date' : 'exp-date').value = today;
                if (!isIncome) toggleCardSelect(); 
                loadData(); 
            } else {
                alert('Erro ao salvar dados');
            }
        } catch (error) {
            console.error('Error:', error);
        }
    }

    // --- Edit Logic ---

    window.editExpense = function(expenseStr) {
        const expense = JSON.parse(decodeURIComponent(expenseStr));
        
        isEditing = true;
        editingId = expense._id;
        
        document.getElementById('exp-desc').value = expense.description;
        document.getElementById('exp-amount').value = expense.amount;
        document.getElementById('exp-date').value = expense.date;
        document.getElementById('exp-establishment').value = expense.establishment || '';
        document.getElementById('exp-buyer').value = expense.buyer || '';
        document.getElementById('exp-category').value = expense.category || '';
        document.getElementById('exp-method').value = expense.payment_method || 'debito';
        document.getElementById('exp-obs').value = expense.observation || '';
        
        if (expense.payment_method === 'credito') {
            cardGroup.style.display = 'grid';
            document.getElementById('exp-card').value = expense.card_id || '';
            document.getElementById('exp-installments').value = expense.installments || '';
        } else {
            cardGroup.style.display = 'none';
        }

        btnSaveExpense.textContent = 'Atualizar Gasto';
        btnCancelEdit.style.display = 'inline-block';
        
        // Scroll to form
        expenseForm.scrollIntoView({ behavior: 'smooth' });
    };

    window.deleteExpense = async function(id) {
        if(!confirm('Tem certeza que deseja excluir este gasto?')) return;
        try {
            const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
            if(res.ok) loadData();
        } catch(err) { console.error(err); }
    };

    function cancelEdit() {
        isEditing = false;
        editingId = null;
        expenseForm.reset();
        document.getElementById('exp-date').value = today;
        btnSaveExpense.textContent = 'Adicionar Gasto';
        btnCancelEdit.style.display = 'none';
        toggleCardSelect();
    }

    // --- Cards Page Logic ---

    async function loadCardsPage() {
        try {
            const res = await fetch('/api/cards');
            const cards = await res.json();
            const container = document.getElementById('cards-container');
            container.innerHTML = '';

            cards.forEach(card => {
                const el = document.createElement('div');
                el.className = 'credit-card-display';
                el.style.cursor = 'pointer';
                el.onclick = () => showInvoiceSection(card);
                
                el.innerHTML = `
                    <div class="card-header">
                        <h3>${card.name}</h3>
                        <span class="card-limit">R$ ${parseFloat(card.limit_amount).toFixed(2)}</span>
                    </div>
                    <div class="card-details">
                        <p>Titular: ${card.holder_name || '-'}</p>
                        <div class="card-dates">
                            <span>Fecha dia: ${card.closing_day || '-'}</span>
                            <span>Vence dia: ${card.due_day || '-'}</span>
                        </div>
                    </div>
                `;
                container.appendChild(el);
            });
        } catch (err) { console.error(err); }
    }

    function showInvoiceSection(card) {
        invoiceSection.style.display = 'block';
        invoiceSection.dataset.cardId = card._id;
        document.getElementById('invoice-card-name').textContent = `Fatura - ${card.name}`;
        loadInvoice(card._id);
        invoiceSection.scrollIntoView({ behavior: 'smooth' });
    }

    async function loadInvoice(cardId) {
        const month = invoiceMonthInput.value;
        if(!month) return;

        try {
            const res = await fetch(`/api/cards/${cardId}/invoice?month=${month}`);
            const data = await res.json();
            
            document.getElementById('invoice-total').textContent = formatCurrency(data.total);
            document.getElementById('invoice-period').textContent = `Período: ${formatDate(data.period.start)} a ${formatDate(data.period.end)}`;
            
            // Buyers Breakdown
            const buyersDiv = document.getElementById('buyers-breakdown');
            buyersDiv.innerHTML = '';
            for (const [buyer, amount] of Object.entries(data.buyers_summary)) {
                const p = document.createElement('p');
                p.innerHTML = `<strong>${buyer}:</strong> ${formatCurrency(amount)}`;
                buyersDiv.appendChild(p);
            }

            // Table
            const tbody = document.querySelector('#invoice-table tbody');
            tbody.innerHTML = '';
            data.expenses.forEach(exp => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${formatDate(exp.date)}</td>
                    <td>${exp.description}</td>
                    <td>${exp.buyer || '-'}</td>
                    <td>${exp.installments || '-'}</td>
                    <td>${formatCurrency(exp.amount)}</td>
                `;
                tbody.appendChild(row);
            });

        } catch(err) { console.error(err); }
    }

    // --- Shared Logic ---

    async function loadData(isSearch = false) {
        try {
            let expenseUrl = '/api/expenses';
            if (isSearch) {
                const params = new URLSearchParams();
                if(searchTerm.value) params.append('search', searchTerm.value);
                if(searchStart.value) params.append('start_date', searchStart.value);
                if(searchEnd.value) params.append('end_date', searchEnd.value);
                expenseUrl += `?${params.toString()}`;
            }

            const [incomesRes, expensesRes] = await Promise.all([
                fetch('/api/incomes'), 
                fetch(expenseUrl)
            ]);

            const incomes = await incomesRes.json();
            const expenses = await expensesRes.json();

            if (!isSearch) {
                updateDashboard(incomes, expenses);
                updateChart(incomes, expenses);
            }
            
            updateTable(incomes, expenses, isSearch);
            updateSearchStats(expenses, isSearch);

        } catch (error) {
            console.error('Error loading data:', error);
        }
    }

    function updateSearchStats(expenses, isSearch) {
        if (!isSearch) {
            searchTotalAmount.textContent = '---';
            searchCount.textContent = '---';
            return;
        }
        const total = expenses.reduce((sum, e) => sum + e.amount, 0);
        searchTotalAmount.textContent = formatCurrency(total);
        searchCount.textContent = expenses.length;
    }

    function updateDashboard(incomes, expenses) {
        const totalIncome = incomes.reduce((sum, i) => sum + i.amount, 0);
        const totalExpense = expenses.reduce((sum, e) => sum + e.amount, 0);
        const balance = totalIncome - totalExpense;

        document.getElementById('total-income').textContent = formatCurrency(totalIncome);
        document.getElementById('total-expense').textContent = formatCurrency(totalExpense);
        const balanceEl = document.getElementById('balance');
        balanceEl.textContent = formatCurrency(balance);
        balanceEl.style.color = balance >= 0 ? 'var(--success-color)' : 'var(--danger-color)';
    }

    function updateTable(incomes, expenses, isSearch) {
        historyTableBody.innerHTML = '';
        let allItems = [];
        
        if (isSearch) {
            const term = searchTerm.value.toLowerCase();
            const filteredIncomes = incomes.filter(i => i.description.toLowerCase().includes(term));
            allItems = [
                ...filteredIncomes.map(i => ({...i, type: 'income'})),
                ...expenses.map(e => ({...e, type: 'expense'}))
            ];
        } else {
            allItems = [
                ...incomes.map(i => ({...i, type: 'income'})),
                ...expenses.map(e => ({...e, type: 'expense'}))
            ];
        }

        allItems.sort((a, b) => new Date(b.date) - new Date(a.date));

        allItems.forEach(item => {
            const row = document.createElement('tr');
            const isIncome = item.type === 'income';
            
            let details = '';
            if (!isIncome) {
                if (item.payment_method === 'credito' && item.card_name) {
                    details = `<span class="badge card">💳 ${item.card_name}</span>`;
                    if (item.installments) details += ` <span class="badge installments">${item.installments}x</span>`;
                } else {
                    details = `<span class="badge method">${item.payment_method || '-'}</span>`;
                }
            }

            const itemStr = encodeURIComponent(JSON.stringify(item));
            const actions = !isIncome ? `
                <button class="btn-icon-small edit" onclick="editExpense('${itemStr}')">✎</button>
                <button class="btn-icon-small delete" onclick="deleteExpense('${item._id}')">🗑</button>
            ` : '';

            row.innerHTML = `
                <td>${formatDate(item.date)}</td>
                <td style="color: ${isIncome ? 'var(--success-color)' : 'var(--danger-color)'}">
                    ${isIncome ? 'Renda' : 'Gasto'}
                </td>
                <td>
                    <div class="desc-main">${item.description}</div>
                    ${!isIncome && item.establishment ? `<div class="desc-sub">${item.establishment}</div>` : ''}
                </td>
                <td>${!isIncome && item.buyer ? item.buyer : '-'}</td>
                <td>${details}</td>
                <td class="${isIncome ? 'amount-positive' : 'amount-negative'}">
                    ${isIncome ? '+' : '-'} ${formatCurrency(item.amount)}
                </td>
                <td>${actions}</td>
            `;
            historyTableBody.appendChild(row);
        });
    }

    function updateChart(incomes, expenses) {
        const ctx = document.getElementById('financeChart').getContext('2d');
        const monthlyData = {};
        [...incomes, ...expenses].forEach(item => {
            const monthKey = item.date.substring(0, 7);
            if (!monthlyData[monthKey]) monthlyData[monthKey] = { income: 0, expense: 0 };
            if (incomes.includes(item)) monthlyData[monthKey].income += item.amount;
            else monthlyData[monthKey].expense += item.amount;
        });
        const sortedMonths = Object.keys(monthlyData).sort();
        if (financeChart) financeChart.destroy();
        financeChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: sortedMonths.map(m => { const [y, mo] = m.split('-'); return `${mo}/${y}`; }),
                datasets: [
                    { label: 'Rendas', data: sortedMonths.map(m => monthlyData[m].income), backgroundColor: '#2ecc71', borderRadius: 4 },
                    { label: 'Gastos', data: sortedMonths.map(m => monthlyData[m].expense), backgroundColor: '#e74c3c', borderRadius: 4 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { labels: { color: '#e6e1de' } } },
                scales: {
                    y: { beginAtZero: true, grid: { color: '#2a2827' }, ticks: { color: '#8f8681' } },
                    x: { grid: { display: false }, ticks: { color: '#8f8681' } }
                }
            }
        });
    }

    function formatCurrency(value) {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
    }

    function formatDate(dateString) {
        const [year, month, day] = dateString.split('-');
        return `${day}/${month}/${year}`;
    }
});
