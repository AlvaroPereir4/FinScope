document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const incomeForm = document.getElementById('income-form');
    const expenseForm = document.getElementById('expense-form');
    const historyTableBody = document.querySelector('#history-table tbody');
    const cardSelect = document.getElementById('exp-card');
    const methodSelect = document.getElementById('exp-method');
    const cardGroup = document.getElementById('card-select-group');
    const installmentsGroup = document.getElementById('installments-group');
    
    // Default dates
    const today = new Date().toISOString().split('T')[0];
    if(document.getElementById('inc-date')) document.getElementById('inc-date').value = today;
    if(document.getElementById('exp-date')) document.getElementById('exp-date').value = today;

    let financeChart = null;

    // Initial Load
    if(document.getElementById('financeChart')) {
        loadData();
        loadCards();
    }

    // Event Listeners
    if(incomeForm) incomeForm.addEventListener('submit', (e) => handleFormSubmit(e, 'income'));
    if(expenseForm) expenseForm.addEventListener('submit', (e) => handleFormSubmit(e, 'expense'));
    
    if(methodSelect) methodSelect.addEventListener('change', toggleCardSelect);

    function toggleCardSelect() {
        const method = methodSelect.value;
        if (method === 'credito') {
            cardGroup.style.display = 'block';
            installmentsGroup.style.display = 'block';
        } else {
            cardGroup.style.display = 'none';
            installmentsGroup.style.display = 'none';
            cardSelect.value = '';
            document.getElementById('exp-installments').value = '';
        }
    }

    async function loadCards() {
        try {
            const res = await fetch('/api/cards');
            const cards = await res.json();
            
            // Populate select if exists (Dashboard)
            if(cardSelect) {
                cardSelect.innerHTML = '<option value="">Selecione...</option>';
                cards.forEach(card => {
                    const option = document.createElement('option');
                    option.value = card._id; // Mongo uses _id
                    option.textContent = card.name;
                    cardSelect.appendChild(option);
                });
            }

            // Populate grid if exists (Cards Page)
            const container = document.getElementById('cards-container');
            if(container) {
                container.innerHTML = '';
                cards.forEach(card => {
                    const el = document.createElement('div');
                    el.className = 'credit-card-display';
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
            }

        } catch (err) { console.error(err); }
    }

    async function handleFormSubmit(e, type) {
        e.preventDefault();
        
        const isIncome = type === 'income';
        const url = isIncome ? '/api/incomes' : '/api/expenses';
        
        let data = {};

        if (isIncome) {
            data = {
                description: document.getElementById('inc-desc').value,
                amount: parseFloat(document.getElementById('inc-amount').value),
                date: document.getElementById('inc-date').value
            };
        } else {
            data = {
                description: document.getElementById('exp-desc').value,
                amount: parseFloat(document.getElementById('exp-amount').value),
                date: document.getElementById('exp-date').value,
                establishment: document.getElementById('exp-establishment').value,
                category: document.getElementById('exp-category').value,
                payment_method: document.getElementById('exp-method').value,
                card_id: document.getElementById('exp-card').value || null,
                installments: document.getElementById('exp-installments').value,
                observation: document.getElementById('exp-obs').value
            };
        }

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (response.ok) {
                e.target.reset();
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

    async function loadData() {
        try {
            const [incomesRes, expensesRes] = await Promise.all([
                fetch('/api/incomes'),
                fetch('/api/expenses')
            ]);

            const incomes = await incomesRes.json();
            const expenses = await expensesRes.json();

            updateDashboard(incomes, expenses);
            updateTable(incomes, expenses);
            updateChart(incomes, expenses);

        } catch (error) {
            console.error('Error loading data:', error);
        }
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

    function updateTable(incomes, expenses) {
        historyTableBody.innerHTML = '';
        
        const allItems = [
            ...incomes.map(i => ({...i, type: 'income'})),
            ...expenses.map(e => ({...e, type: 'expense'}))
        ].sort((a, b) => new Date(b.date) - new Date(a.date));

        allItems.slice(0, 10).forEach(item => {
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

            row.innerHTML = `
                <td>${formatDate(item.date)}</td>
                <td style="color: ${isIncome ? 'var(--success-color)' : 'var(--danger-color)'}">
                    ${isIncome ? 'Renda' : 'Gasto'}
                </td>
                <td>
                    <div class="desc-main">${item.description}</div>
                    ${!isIncome && item.establishment ? `<div class="desc-sub">${item.establishment}</div>` : ''}
                </td>
                <td>${details}</td>
                <td class="${isIncome ? 'amount-positive' : 'amount-negative'}">
                    ${isIncome ? '+' : '-'} ${formatCurrency(item.amount)}
                </td>
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
            
            if (incomes.includes(item)) {
                monthlyData[monthKey].income += item.amount;
            } else {
                monthlyData[monthKey].expense += item.amount;
            }
        });

        const sortedMonths = Object.keys(monthlyData).sort();
        
        if (financeChart) financeChart.destroy();

        financeChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: sortedMonths.map(m => {
                    const [y, mo] = m.split('-');
                    return `${mo}/${y}`;
                }),
                datasets: [
                    {
                        label: 'Rendas',
                        data: sortedMonths.map(m => monthlyData[m].income),
                        backgroundColor: '#2ecc71',
                        borderRadius: 4
                    },
                    {
                        label: 'Gastos',
                        data: sortedMonths.map(m => monthlyData[m].expense),
                        backgroundColor: '#e74c3c',
                        borderRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: '#e6e1de' }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: '#2a2827' },
                        ticks: { color: '#8f8681' }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#8f8681' }
                    }
                }
            }
        });
    }

    function formatCurrency(value) {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value);
    }

    function formatDate(dateString) {
        const [year, month, day] = dateString.split('-');
        return `${day}/${month}/${year}`;
    }
});
