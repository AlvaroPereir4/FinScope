document.addEventListener('DOMContentLoaded', () => {
    // --- Elements ---
    const incomeForm = document.getElementById('income-form');
    const expenseForm = document.getElementById('expense-form'); // Micro Form
    const consolidatedForm = document.getElementById('consolidated-form'); // Macro Form
    const historyTableBody = document.querySelector('#history-table tbody');
    const paginationControls = document.getElementById('pagination-controls');
    
    // Micro Form Elements
    const cardSelect = document.getElementById('exp-card');
    const methodSelect = document.getElementById('exp-method');
    const cardGroup = document.getElementById('card-select-group');
    const categorySelect = document.getElementById('exp-category');
    const buyerSelect = document.getElementById('exp-buyer');
    const btnCancelEdit = document.getElementById('btn-cancel-edit');
    const btnSaveExpense = document.getElementById('btn-save-expense');
    
    // Macro Form Elements
    const consCategorySelect = document.getElementById('cons-category');
    const consCardSelect = document.getElementById('cons-card');
    const btnSaveConsolidated = consolidatedForm ? consolidatedForm.querySelector('button[type="submit"]') : null;

    // Dashboard Filters
    const filterBtns = document.querySelectorAll('.filter-btn');
    const yearSelect = document.getElementById('dashboard-year');
    
    // Chart Controls (Dashboard)
    const chartBtns = document.querySelectorAll('.chart-btn');
    const zoomContainer = document.getElementById('zoom-container');
    const chartZoom = document.getElementById('chart-zoom');
    const zoomLabel = document.getElementById('zoom-label');
    
    // Chart Controls (Detailed)
    const detChartBtns = document.querySelectorAll('.det-chart-btn');
    const detZoomContainer = document.getElementById('det-zoom-container');
    const detChartZoom = document.getElementById('det-chart-zoom');
    const detZoomLabel = document.getElementById('det-zoom-label');
    
    // Search (Micro Page)
    const searchTerm = document.getElementById('search-term');

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
    const entryForm = document.getElementById('entry-form');
    const investmentsContainer = document.getElementById('investments-container');
    const goalsContainer = document.getElementById('goals-container');
    const totalInvestedEl = document.getElementById('total-invested');

    // Wallet Elements
    const walletForm = document.getElementById('wallet-form');
    const walletTable = document.querySelector('#wallet-table tbody');
    const totalWalletBalanceEl = document.getElementById('total-wallet-balance');

    // Collapsible Sections
    const collapsibles = document.querySelectorAll('.collapsible .section-header');

    // State
    let currentCategories = [];
    let currentBuyers = [];
    let isEditing = false;
    let editingId = null;
    let editingType = null; // 'micro' or 'macro'
    let currentFilter = 'all'; // Default All
    let selectedYear = new Date().getFullYear().toString();
    
    // Pagination State
    let currentPage = 1;
    const itemsPerPage = 30;
    let allTableData = []; // Store all data for pagination
    
    // Chart State
    let chartGranularity = 'month'; 
    let chartDays = 30;
    let detChartGranularity = 'month';
    let detChartDays = 30;
    
    // Data Cache
    let cachedIncomes = [];
    let cachedExpenses = [];
    let cachedInvestments = [];
    let cachedDetailedExpenses = []; 
    
    // Default dates
    const today = new Date().toISOString().split('T')[0];
    if(document.getElementById('inc-date')) document.getElementById('inc-date').value = today;
    if(document.getElementById('exp-date')) document.getElementById('exp-date').value = today;
    if(document.getElementById('cons-date')) document.getElementById('cons-date').value = today;
    if(invoiceMonthInput) invoiceMonthInput.value = today.substring(0, 7);

    let financeChart = null;
    let detailedChart = null;

    // --- Initial Load ---
    loadSettings(); 

    if(document.getElementById('financeChart')) {
        loadYears();
        loadCards(); // Load cards for macro form
    }
    
    if(document.getElementById('cards-container')) {
        loadCardsPage();
    }

    if(document.getElementById('investments-container')) {
        loadInvestments();
    }

    if(document.getElementById('goals-container')) {
        loadGoals();
    }
    
    if(window.location.pathname === '/detailed') {
        loadCards(); 
        loadDetailedData();
    }

    if(document.getElementById('wallet-table')) {
        loadWallets();
    }

    // --- Event Listeners ---
    
    collapsibles.forEach(header => {
        header.addEventListener('click', () => {
            const section = header.parentElement;
            section.classList.toggle('collapsed');
        });
    });

    if(incomeForm) incomeForm.addEventListener('submit', (e) => handleFormSubmit(e, 'income'));
    if(expenseForm) expenseForm.addEventListener('submit', (e) => handleFormSubmit(e, 'expense'));
    if(consolidatedForm) consolidatedForm.addEventListener('submit', (e) => handleFormSubmit(e, 'consolidated'));
    
    if(methodSelect) methodSelect.addEventListener('change', toggleCardSelect);
    if(btnCancelEdit) btnCancelEdit.addEventListener('click', cancelEdit);
    
    if(searchTerm) searchTerm.addEventListener('input', () => loadDetailedData(true));

    // Dashboard Filter Events
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.period;
            loadData();
        });
    });

    if(yearSelect) {
        yearSelect.addEventListener('change', () => {
            selectedYear = yearSelect.value;
            if(currentFilter !== 'year') {
                filterBtns.forEach(b => b.classList.remove('active'));
                document.querySelector('[data-period="year"]').classList.add('active');
                currentFilter = 'year';
            }
            loadData();
        });
    }
    
    // Dashboard Chart Controls
    chartBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            chartBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            chartGranularity = btn.dataset.granularity;
            if(chartGranularity === 'day') zoomContainer.style.display = 'flex';
            else zoomContainer.style.display = 'none';
            updateChart(cachedIncomes, cachedExpenses, cachedInvestments);
        });
    });

    if(chartZoom) {
        chartZoom.addEventListener('input', () => {
            chartDays = parseInt(chartZoom.value);
            zoomLabel.textContent = `${chartDays} Dias`;
            updateChart(cachedIncomes, cachedExpenses, cachedInvestments);
        });
    }
    
    // Detailed Chart Controls
    detChartBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            detChartBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            detChartGranularity = btn.dataset.granularity;
            if(detChartGranularity === 'day') detZoomContainer.style.display = 'flex';
            else detZoomContainer.style.display = 'none';
            updateDetailedChart(cachedDetailedExpenses);
        });
    });

    if(detChartZoom) {
        detChartZoom.addEventListener('input', () => {
            detChartDays = parseInt(detChartZoom.value);
            detZoomLabel.textContent = `${detChartDays} Dias`;
            updateDetailedChart(cachedDetailedExpenses);
        });
    }

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
                current_amount: parseFloat(document.getElementById('inv-current').value),
                target_amount: parseFloat(document.getElementById('inv-target').value || 0)
            };
            const url = id ? `/api/investments/${id}` : '/api/investments';
            const method = id ? 'PUT' : 'POST';
            try {
                const res = await fetch(url, { method: method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
                if(res.ok) { document.getElementById('investment-modal').style.display = 'none'; loadInvestments(); }
            } catch(err) { console.error(err); }
        });
    }

    if(entryForm) {
        entryForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const invId = document.getElementById('entry-inv-id').value;
            const data = {
                type: document.getElementById('entry-type').value,
                amount: parseFloat(document.getElementById('entry-amount').value),
                date: document.getElementById('entry-date').value
            };
            try {
                const res = await fetch(`/api/investments/${invId}/entries`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
                if(res.ok) { document.getElementById('entry-modal').style.display = 'none'; loadInvestments(); }
            } catch(err) { console.error(err); }
        });
    }

    if(goalForm) {
        goalForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('goal-id').value;
            const data = {
                title: document.getElementById('goal-title').value,
                type: document.getElementById('goal-type').value,
                target_amount: parseFloat(document.getElementById('goal-target').value),
                current_amount: parseFloat(document.getElementById('goal-current').value),
                deadline: document.getElementById('goal-deadline').value
            };
            const url = id ? `/api/goals/${id}` : '/api/goals';
            const method = id ? 'PUT' : 'POST';
            try {
                const res = await fetch(url, { method: method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
                if(res.ok) { document.getElementById('goal-modal').style.display = 'none'; loadGoals(); }
            } catch(err) { console.error(err); }
        });
    }

    if(walletForm) {
        walletForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('wallet-id').value;
            const data = {
                name: document.getElementById('wallet-name').value,
                balance: parseFloat(document.getElementById('wallet-balance').value)
            };
            const url = id ? `/api/wallets/${id}` : '/api/wallets';
            const method = id ? 'PUT' : 'POST';
            try {
                const res = await fetch(url, { method: method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
                if(res.ok) { document.getElementById('wallet-modal').style.display = 'none'; loadWallets(); }
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
        const selects = [categorySelect, consCategorySelect];
        selects.forEach(sel => {
            if(sel) {
                sel.innerHTML = '';
                currentCategories.forEach(cat => {
                    const opt = document.createElement('option');
                    opt.value = cat;
                    opt.textContent = cat;
                    sel.appendChild(opt);
                });
            }
        });

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

    // --- Wallet Logic ---

    async function loadWallets() {
        try {
            const res = await fetch('/api/wallets');
            const wallets = await res.json();
            
            walletTable.innerHTML = '';
            let total = 0;
            
            wallets.forEach(w => {
                total += w.balance;
                const row = document.createElement('tr');
                const wStr = encodeURIComponent(JSON.stringify(w));
                
                row.innerHTML = `
                    <td>${w.name}</td>
                    <td class="${w.balance >= 0 ? 'amount-positive' : 'amount-negative'}">${formatCurrency(w.balance)}</td>
                    <td>
                        <button class="btn-icon-small edit" onclick="editWallet('${wStr}')">✎</button>
                        <button class="btn-icon-small delete" onclick="deleteWallet('${w._id}')">🗑</button>
                    </td>
                `;
                walletTable.appendChild(row);
            });
            
            totalWalletBalanceEl.textContent = formatCurrency(total);
        } catch(err) { console.error(err); }
    }

    window.editWallet = function(wStr) {
        const w = JSON.parse(decodeURIComponent(wStr));
        document.getElementById('wallet-id').value = w._id;
        document.getElementById('wallet-name').value = w.name;
        document.getElementById('wallet-balance').value = w.balance;
        document.getElementById('wallet-modal-title').textContent = 'Editar Conta';
        document.getElementById('wallet-modal').style.display = 'flex';
    };

    window.deleteWallet = async function(id) {
        if(!confirm('Excluir esta conta?')) return;
        await fetch(`/api/wallets/${id}`, { method: 'DELETE' });
        loadWallets();
    };

    // --- Investments & Goals Logic ---

    async function loadInvestments() {
        try {
            const res = await fetch('/api/investments');
            const invs = await res.json();
            
            investmentsContainer.innerHTML = '';
            let total = 0;
            
            invs.forEach(inv => {
                total += inv.current_amount;
                const invStr = encodeURIComponent(JSON.stringify(inv));
                
                const el = document.createElement('div');
                el.className = 'credit-card-display'; 
                el.style.cursor = 'pointer';
                el.onclick = (e) => {
                    if(e.target.tagName !== 'BUTTON') openEntryModal(inv._id);
                };
                
                el.innerHTML = `
                    <div class="card-header">
                        <h3>${inv.name}</h3>
                        <span class="card-limit">${formatCurrency(inv.current_amount)}</span>
                    </div>
                    <div class="card-details">
                        <p>${inv.type}</p>
                        <div class="card-dates">
                            <button class="btn-icon-small edit" onclick="editInvestment('${invStr}')">✎</button>
                            <button class="btn-icon-small delete" onclick="deleteInvestment('${inv._id}')">🗑</button>
                        </div>
                    </div>
                `;
                investmentsContainer.appendChild(el);
            });
            
            totalInvestedEl.textContent = formatCurrency(total);
        } catch(err) { console.error(err); }
    }

    window.openEntryModal = function(invId) {
        document.getElementById('entry-inv-id').value = invId;
        document.getElementById('entry-modal').style.display = 'flex';
    };

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
        document.getElementById('inv-current').value = inv.current_amount;
        document.getElementById('inv-target').value = inv.target_amount || '';
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
        document.getElementById('goal-type').value = goal.type || 'saving';
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

    async function loadYears() {
        try {
            const res = await fetch('/api/years');
            const years = await res.json();
            yearSelect.innerHTML = '';
            years.forEach(year => {
                const opt = document.createElement('option');
                opt.value = year;
                opt.textContent = year;
                if(year === selectedYear) opt.selected = true;
                yearSelect.appendChild(opt);
            });
            loadData(); 
        } catch(err) { console.error(err); }
    }

    async function loadCards() {
        try {
            const res = await fetch('/api/cards');
            const cards = await res.json();
            
            const selects = [cardSelect, consCardSelect];
            selects.forEach(sel => {
                if(sel) {
                    const currentVal = sel.value;
                    // Keep "Nenhum" option for consCardSelect
                    const defaultOpt = sel.id === 'cons-card' ? '<option value="">Nenhum</option>' : '<option value="">Selecione...</option>';
                    sel.innerHTML = defaultOpt;
                    
                    cards.forEach(card => {
                        const option = document.createElement('option');
                        option.value = card._id;
                        option.textContent = card.name;
                        sel.appendChild(option);
                    });
                    if(currentVal) sel.value = currentVal;
                }
            });
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
        } else if (type === 'consolidated') {
            // Macro Expense
            url = '/api/macro-expenses'; // NEW ENDPOINT
            data = {
                description: document.getElementById('cons-desc').value,
                amount: parseFloat(document.getElementById('cons-amount').value),
                date: document.getElementById('cons-date').value,
                category: document.getElementById('cons-category').value,
                card_id: document.getElementById('cons-card').value || null, 
                payment_method: document.getElementById('cons-method').value 
            };
            
            if (isEditing && editingType === 'macro') {
                url += `/${editingId}`;
                method = 'PUT';
            }
        } else {
            // Micro Expense
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
                is_consolidated: false
            };

            if (isEditing && editingType === 'micro') {
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
                
                if(type === 'income') document.getElementById('inc-date').value = today;
                else if(type === 'consolidated') document.getElementById('cons-date').value = today;
                else {
                    document.getElementById('exp-date').value = today;
                    toggleCardSelect();
                }
                
                if(window.location.pathname === '/detailed') loadDetailedData();
                else loadData(); 
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
        
        if (expense.source === 'macro') {
            // Macro Edit
            editingType = 'macro';
            if(consolidatedForm) {
                document.getElementById('cons-desc').value = expense.description;
                document.getElementById('cons-amount').value = expense.amount;
                document.getElementById('cons-date').value = expense.date;
                document.getElementById('cons-category').value = expense.category || '';
                document.getElementById('cons-card').value = expense.card_id || '';
                document.getElementById('cons-method').value = expense.payment_method || 'debito';
                
                if(btnSaveConsolidated) btnSaveConsolidated.textContent = 'Atualizar Conta';
                
                // Open section
                const section = consolidatedForm.closest('.input-section');
                if(section.classList.contains('collapsed')) section.classList.remove('collapsed');
                consolidatedForm.scrollIntoView({ behavior: 'smooth' });
                
                // Add cancel button logic for macro
                let cancelBtn = document.getElementById('btn-cancel-macro');
                if(!cancelBtn) {
                    cancelBtn = document.createElement('button');
                    cancelBtn.id = 'btn-cancel-macro';
                    cancelBtn.type = 'button';
                    cancelBtn.className = 'btn-secondary';
                    cancelBtn.textContent = 'Cancelar';
                    cancelBtn.style.marginTop = '1rem';
                    cancelBtn.onclick = cancelEdit;
                    consolidatedForm.appendChild(cancelBtn);
                }
                cancelBtn.style.display = 'block';
            }
        } else {
            // Micro Edit
            editingType = 'micro';
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
            
            expenseForm.scrollIntoView({ behavior: 'smooth' });
            const section = expenseForm.closest('.input-section');
            if(section.classList.contains('collapsed')) section.classList.remove('collapsed');
        }
    };

    window.deleteExpense = async function(id, source) {
        if(!confirm('Tem certeza que deseja excluir este gasto?')) return;
        
        let url = `/api/expenses/${id}`;
        if(source === 'macro') url = `/api/macro-expenses/${id}`;
        
        try {
            const res = await fetch(url, { method: 'DELETE' });
            if(res.ok) {
                if(window.location.pathname === '/detailed') loadDetailedData();
                else loadData();
            }
        } catch(err) { console.error(err); }
    };

    function cancelEdit() {
        isEditing = false;
        editingId = null;
        editingType = null;
        
        if(expenseForm) {
            expenseForm.reset();
            document.getElementById('exp-date').value = today;
            btnSaveExpense.textContent = 'Registrar Gasto';
            btnCancelEdit.style.display = 'none';
            toggleCardSelect();
        }
        
        if(consolidatedForm) {
            consolidatedForm.reset();
            document.getElementById('cons-date').value = today;
            if(btnSaveConsolidated) btnSaveConsolidated.textContent = 'Registrar Saída';
            const cancelBtn = document.getElementById('btn-cancel-macro');
            if(cancelBtn) cancelBtn.style.display = 'none';
        }
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
            // Dashboard loads Consolidated + Non-Credit Detailed
            let expenseUrl = '/api/expenses?view_type=consolidated';
            let macroUrl = '/api/macro-expenses'; // NEW
            
            // Apply dashboard filters
            let startDate = '';
            let endDate = '';
            const now = new Date();
            
            if (currentFilter === '30') {
                const past = new Date();
                past.setDate(now.getDate() - 30);
                startDate = past.toISOString().split('T')[0];
                endDate = now.toISOString().split('T')[0];
            } else if (currentFilter === '180') {
                const past = new Date();
                past.setMonth(now.getMonth() - 6);
                startDate = past.toISOString().split('T')[0];
                endDate = now.toISOString().split('T')[0];
            } else if (currentFilter === 'year') {
                startDate = `${selectedYear}-01-01`;
                endDate = `${selectedYear}-12-31`;
            }
            
            if(currentFilter !== 'all') {
                expenseUrl += `&start_date=${startDate}&end_date=${endDate}`;
                macroUrl += `?start_date=${startDate}&end_date=${endDate}`;
            }
            
            let incomeUrl = '/api/incomes';
            if(currentFilter !== 'all') {
                incomeUrl += `?start_date=${startDate}&end_date=${endDate}`;
            }

            const [incomesRes, expensesRes, macroRes, investmentsRes, allInvestmentsRes, balanceRes] = await Promise.all([
                fetch(incomeUrl), 
                fetch(expenseUrl),
                fetch(macroUrl),
                fetch('/api/investments/history'),
                fetch('/api/investments'),
                fetch('/api/balance')
            ]);

            const incomes = await incomesRes.json();
            const expenses = await expensesRes.json();
            const macroExpenses = await macroRes.json();
            const investmentsHistory = await investmentsRes.json();
            const currentInvestments = await allInvestmentsRes.json();
            const balanceData = await balanceRes.json();
            
            // Combine Micro and Macro for Dashboard
            const allExpenses = [...expenses, ...macroExpenses];
            
            cachedIncomes = incomes;
            cachedExpenses = allExpenses;
            cachedInvestments = investmentsHistory;

            updateDashboard(incomes, allExpenses, currentInvestments, balanceData);
            updateChart(incomes, allExpenses, investmentsHistory);
            
            // Pagination Logic
            allTableData = [
                ...incomes.map(i => ({...i, type: 'income'})),
                ...allExpenses.map(e => ({...e, type: 'expense'}))
            ];
            allTableData.sort((a, b) => new Date(b.date) - new Date(a.date));
            
            currentPage = 1;
            renderPagination();
            renderTablePage();

        } catch (error) {
            console.error('Error loading data:', error);
        }
    }

    async function loadDetailedData(isSearch = false) {
        try {
            let url = '/api/expenses?view_type=detailed'; // Load everything for detailed view
            if(isSearch && searchTerm.value) {
                url += `&search=${searchTerm.value}`;
            }
            
            const res = await fetch(url);
            const expenses = await res.json();
            
            cachedDetailedExpenses = expenses;
            updateDetailedChart(expenses);
            
            historyTableBody.innerHTML = '';
            expenses.forEach(item => {
                const row = document.createElement('tr');
                
                let details = '';
                if (item.payment_method === 'credito' && item.card_name) {
                    details = `<span class="badge card">💳 ${item.card_name}</span>`;
                    if (item.installments) details += ` <span class="badge installments">${item.installments}x</span>`;
                } else {
                    details = `<span class="badge method">${item.payment_method || '-'}</span>`;
                }
                if(item.is_consolidated) {
                    details += ` <span class="badge" style="background:#e74c3c;color:#fff">Macro</span>`;
                    if(item.card_name) details += ` <span class="badge card">💳 ${item.card_name}</span>`;
                }

                const itemStr = encodeURIComponent(JSON.stringify(item));
                const actions = `
                    <button class="btn-icon-small edit" onclick="editExpense('${itemStr}')">✎</button>
                    <button class="btn-icon-small delete" onclick="deleteExpense('${item._id}')">🗑</button>
                `;

                row.innerHTML = `
                    <td>${formatDate(item.date)}</td>
                    <td>${item.description}</td>
                    <td>${item.buyer || '-'}</td>
                    <td>${details}</td>
                    <td class="amount-negative">- ${formatCurrency(item.amount)}</td>
                    <td>${actions}</td>
                `;
                historyTableBody.appendChild(row);
            });
        } catch(err) { console.error(err); }
    }

    function updateDashboard(incomes, expenses, currentInvestments, balanceData) {
        const totalIncome = incomes.reduce((sum, i) => sum + i.amount, 0);
        const totalExpense = expenses.reduce((sum, e) => sum + e.amount, 0);
        
        // CORREÇÃO AQUI: Usar o saldo da API (balanceData.balance)
        const balance = balanceData.balance; 

        document.getElementById('total-income').textContent = formatCurrency(totalIncome);
        document.getElementById('total-expense').textContent = formatCurrency(totalExpense);
        
        const balanceEl = document.getElementById('balance');
        balanceEl.textContent = formatCurrency(balance);
        balanceEl.style.color = balance >= 0 ? 'var(--success-color)' : 'var(--danger-color)';

        const totalInvested = currentInvestments.reduce((sum, inv) => sum + inv.current_amount, 0);
        const netWorth = balance + totalInvested;

        document.getElementById('total-invested-dash').textContent = formatCurrency(totalInvested);
        document.getElementById('net-worth').textContent = formatCurrency(netWorth);
    }

    function renderPagination() {
        if(!paginationControls) return;
        paginationControls.innerHTML = '';
        
        const totalPages = Math.ceil(allTableData.length / itemsPerPage);
        if(totalPages <= 1) return;

        for(let i = 1; i <= totalPages; i++) {
            const btn = document.createElement('button');
            btn.className = `page-btn ${i === currentPage ? 'active' : ''}`;
            btn.textContent = i;
            btn.onclick = () => {
                currentPage = i;
                renderPagination();
                renderTablePage();
            };
            paginationControls.appendChild(btn);
        }
    }

    function renderTablePage() {
        historyTableBody.innerHTML = '';
        const start = (currentPage - 1) * itemsPerPage;
        const end = start + itemsPerPage;
        const pageItems = allTableData.slice(start, end);

        pageItems.forEach(item => {
            const row = document.createElement('tr');
            const isIncome = item.type === 'income';
            
            let details = '';
            if (!isIncome) {
                if(item.source === 'macro') {
                    details = `<span class="badge" style="background:#e74c3c;color:#fff">Conta</span>`;
                    if(item.card_name) details += ` <span class="badge card">💳 ${item.card_name}</span>`;
                }
                else details = `<span class="badge method">${item.payment_method || '-'}</span>`;
            }

            const itemStr = encodeURIComponent(JSON.stringify(item));
            const actions = !isIncome ? `
                <button class="btn-icon-small edit" onclick="editExpense('${itemStr}')">✎</button>
                <button class="btn-icon-small delete" onclick="deleteExpense('${item._id}', '${item.source}')">🗑</button>
            ` : '';

            row.innerHTML = `
                <td>${formatDate(item.date)}</td>
                <td style="color: ${isIncome ? 'var(--success-color)' : 'var(--danger-color)'}">
                    ${isIncome ? 'Renda' : 'Saída'}
                </td>
                <td>${item.description}</td>
                <td>${details}</td>
                <td class="${isIncome ? 'amount-positive' : 'amount-negative'}">
                    ${isIncome ? '+' : '-'} ${formatCurrency(item.amount)}
                </td>
                <td>${actions}</td>
            `;
            historyTableBody.appendChild(row);
        });
    }

    function updateChart(incomes, expenses, investments) {
        const ctx = document.getElementById('financeChart').getContext('2d');
        const dataMap = {};
        
        const getKey = (dateStr) => {
            if (chartGranularity === 'day') return dateStr; 
            if (chartGranularity === 'year') return dateStr.substring(0, 4); 
            return dateStr.substring(0, 7); 
        };

        [...incomes, ...expenses].forEach(item => {
            const key = getKey(item.date);
            if (!dataMap[key]) dataMap[key] = { income: 0, expense: 0, investment: 0 };
            if (incomes.includes(item)) dataMap[key].income += item.amount;
            else dataMap[key].expense += item.amount;
        });

        investments.forEach(inv => {
            if(inv.type === 'contribution') {
                const key = getKey(inv.date);
                if (!dataMap[key]) dataMap[key] = { income: 0, expense: 0, investment: 0 };
                dataMap[key].investment += inv.amount;
            }
        });

        let sortedKeys = Object.keys(dataMap).sort();
        
        if (chartGranularity === 'day') {
            sortedKeys = sortedKeys.slice(-chartDays);
        }
        
        const labels = sortedKeys.map(k => {
            if (chartGranularity === 'day') {
                const [y, m, d] = k.split('-');
                return `${d}/${m}`;
            }
            if (chartGranularity === 'year') return k;
            const [y, m] = k.split('-');
            return `${m}/${y}`;
        });

        if (financeChart) financeChart.destroy();
        
        financeChart = new Chart(ctx, {
            type: 'line', 
            data: {
                labels: labels,
                datasets: [
                    { 
                        label: 'Rendas', 
                        data: sortedKeys.map(k => dataMap[k].income), 
                        borderColor: '#2ecc71', 
                        backgroundColor: 'rgba(46, 204, 113, 0.1)',
                        tension: 0.4, 
                        fill: true
                    },
                    { 
                        label: 'Saídas', 
                        data: sortedKeys.map(k => dataMap[k].expense), 
                        borderColor: '#e74c3c', 
                        backgroundColor: 'rgba(231, 76, 60, 0.1)',
                        tension: 0.4,
                        fill: true
                    },
                    { 
                        label: 'Investido', 
                        data: sortedKeys.map(k => dataMap[k].investment), 
                        borderColor: '#3498db', 
                        backgroundColor: 'rgba(52, 152, 219, 0.1)',
                        tension: 0.4,
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true, 
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: { 
                    legend: { labels: { color: '#e6e1de' } },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    label += new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(context.parsed.y);
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    y: { beginAtZero: true, grid: { color: '#2a2827' }, ticks: { color: '#8f8681' } },
                    x: { grid: { display: false }, ticks: { color: '#8f8681' } }
                }
            }
        });
    }
    
    function updateDetailedChart(expenses) {
        const ctx = document.getElementById('detailedChart').getContext('2d');
        const dataMap = {};
        
        const getKey = (dateStr) => {
            if (detChartGranularity === 'day') return dateStr; 
            if (detChartGranularity === 'year') return dateStr.substring(0, 4); 
            return dateStr.substring(0, 7); 
        };

        expenses.forEach(item => {
            const key = getKey(item.date);
            if (!dataMap[key]) dataMap[key] = { credit: 0, debit: 0 };
            
            if (item.payment_method === 'credito') {
                dataMap[key].credit += item.amount;
            } else {
                dataMap[key].debit += item.amount;
            }
        });

        let sortedKeys = Object.keys(dataMap).sort();
        
        if (detChartGranularity === 'day') {
            sortedKeys = sortedKeys.slice(-detChartDays);
        }
        
        const labels = sortedKeys.map(k => {
            if (detChartGranularity === 'day') {
                const [y, m, d] = k.split('-');
                return `${d}/${m}`;
            }
            if (detChartGranularity === 'year') return k;
            const [y, m] = k.split('-');
            return `${m}/${y}`;
        });

        if (detailedChart) detailedChart.destroy();
        
        detailedChart = new Chart(ctx, {
            type: 'line', 
            data: {
                labels: labels,
                datasets: [
                    { 
                        label: 'Crédito', 
                        data: sortedKeys.map(k => dataMap[k].credit), 
                        borderColor: '#9b59b6', 
                        backgroundColor: 'rgba(155, 89, 182, 0.1)',
                        tension: 0.4, 
                        fill: true
                    },
                    { 
                        label: 'Débito/Outros', 
                        data: sortedKeys.map(k => dataMap[k].debit), 
                        borderColor: '#e67e22', 
                        backgroundColor: 'rgba(230, 126, 34, 0.1)',
                        tension: 0.4,
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true, 
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: { 
                    legend: { labels: { color: '#e6e1de' } },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    label += new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(context.parsed.y);
                                }
                                return label;
                            }
                        }
                    }
                },
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
