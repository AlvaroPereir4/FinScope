document.addEventListener('DOMContentLoaded', () => {
    const cardsContainer = document.getElementById('cards-container');
    const cardForm = document.getElementById('card-form');
    const invoiceSection = document.getElementById('invoice-section');
    const invoiceMonthInput = document.getElementById('invoice-month');
    const btnLoadInvoice = document.getElementById('btn-load-invoice');

    if (invoiceMonthInput) invoiceMonthInput.value = AppState.today.substring(0, 7);

    if (cardsContainer) loadCardsPage();

    if (btnLoadInvoice) {
        btnLoadInvoice.addEventListener('click', () => {
            loadInvoice(invoiceSection.dataset.cardId);
        });
    }

    if (cardForm) {
        cardForm.addEventListener('submit', async e => {
            e.preventDefault();
            const data = {
                name: document.getElementById('card-name').value,
                holder_name: document.getElementById('card-holder').value,
                limit_amount: document.getElementById('card-limit').value,
                closing_day: document.getElementById('card-closing').value,
                due_day: document.getElementById('card-due').value,
            };
            try {
                const res = await fetch('/api/cards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
                if (res.ok) { cardForm.reset(); loadCardsPage(); alert('Card added successfully!'); }
                else alert('Error adding card');
            } catch (err) { console.error(err); }
        });
    }

    async function loadCardsPage() {
        try {
            const res = await fetch('/api/cards');
            const cards = await res.json();
            cardsContainer.innerHTML = '';
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
                    </div>`;
                cardsContainer.appendChild(el);
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
        if (!month) return;
        try {
            const res = await fetch(`/api/cards/${cardId}/invoice?month=${month}`);
            const data = await res.json();
            document.getElementById('invoice-total').textContent = formatCurrency(data.total);
            document.getElementById('invoice-period').textContent = `Período: ${formatDate(data.period.start)} a ${formatDate(data.period.end)}`;
            const buyersDiv = document.getElementById('buyers-breakdown');
            buyersDiv.innerHTML = '';
            for (const [buyer, amount] of Object.entries(data.buyers_summary)) {
                const p = document.createElement('p');
                p.innerHTML = `<strong>${buyer}:</strong> ${formatCurrency(amount)}`;
                buyersDiv.appendChild(p);
            }
            const tbody = document.querySelector('#invoice-table tbody');
            tbody.innerHTML = '';
            data.expenses.forEach(exp => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${formatDate(exp.date)}</td>
                    <td>${exp.description}</td>
                    <td>${exp.buyer || '-'}</td>
                    <td>${exp.installments || '-'}</td>
                    <td>${formatCurrency(exp.amount)}</td>`;
                tbody.appendChild(row);
            });
        } catch (err) { console.error(err); }
    }
});
