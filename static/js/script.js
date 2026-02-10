document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const incomeForm = document.getElementById('income-form');
    const expenseForm = document.getElementById('expense-form');
    const historyTableBody = document.querySelector('#history-table tbody');
    
    // Default dates
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('inc-date').value = today;
    document.getElementById('exp-date').value = today;

    let financeChart = null;

    // Initial Load
    loadData();

    // Event Listeners
    incomeForm.addEventListener('submit', (e) => handleFormSubmit(e, 'income'));
    expenseForm.addEventListener('submit', (e) => handleFormSubmit(e, 'expense'));

    async function handleFormSubmit(e, type) {
        e.preventDefault();
        
        const isIncome = type === 'income';
        const url = isIncome ? '/api/incomes' : '/api/expenses';
        
        const data = {
            description: document.getElementById(isIncome ? 'inc-desc' : 'exp-desc').value,
            amount: parseFloat(document.getElementById(isIncome ? 'inc-amount' : 'exp-amount').value),
            date: document.getElementById(isIncome ? 'inc-date' : 'exp-date').value
        };

        if (!isIncome) {
            data.category = document.getElementById('exp-category').value;
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
            
            row.innerHTML = `
                <td>${formatDate(item.date)}</td>
                <td style="color: ${isIncome ? 'var(--success-color)' : 'var(--danger-color)'}">
                    ${isIncome ? 'Renda' : 'Gasto'}
                </td>
                <td>${item.description}</td>
                <td class="${isIncome ? 'amount-positive' : 'amount-negative'}">
                    ${isIncome ? '+' : '-'} ${formatCurrency(item.amount)}
                </td>
            `;
            historyTableBody.appendChild(row);
        });
    }

    function updateChart(incomes, expenses) {
        const ctx = document.getElementById('financeChart').getContext('2d');
        
        // Group by month
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
