document.addEventListener('DOMContentLoaded', () => {
    const investmentsContainer = document.getElementById('investments-container');
    const totalInvestedEl = document.getElementById('total-invested');
    const investmentForm = document.getElementById('investment-form');
    const entryForm = document.getElementById('entry-form');

    if (!investmentsContainer) return;

    loadInvestments();

    if (investmentForm) {
        investmentForm.addEventListener('submit', async e => {
            e.preventDefault();
            const id = document.getElementById('inv-id').value;
            const data = {
                name: document.getElementById('inv-name').value,
                type: document.getElementById('inv-type').value,
                current_amount: parseFloat(document.getElementById('inv-current').value),
                target_amount: parseFloat(document.getElementById('inv-target').value || 0),
            };
            const url = id ? `/api/investments/${id}` : '/api/investments';
            try {
                const res = await fetch(url, { method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
                if (res.ok) { document.getElementById('investment-modal').style.display = 'none'; loadInvestments(); }
            } catch (err) { console.error(err); }
        });
    }

    if (entryForm) {
        entryForm.addEventListener('submit', async e => {
            e.preventDefault();
            const invId = document.getElementById('entry-inv-id').value;
            const data = {
                type: document.getElementById('entry-type').value,
                amount: parseFloat(document.getElementById('entry-amount').value),
                date: document.getElementById('entry-date').value,
            };
            try {
                const res = await fetch(`/api/investments/${invId}/entries`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
                if (res.ok) { document.getElementById('entry-modal').style.display = 'none'; loadInvestments(); }
            } catch (err) { console.error(err); }
        });
    }

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
                el.onclick = e => { if (e.target.tagName !== 'BUTTON') openEntryModal(inv._id); };
                const hasGoal = inv.target_amount > 0;
                const percent = hasGoal ? Math.min(100, (inv.current_amount / inv.target_amount) * 100) : 0;
                const barColor = percent >= 100 ? 'var(--success-color)' : percent >= 60 ? 'var(--accent-color)' : 'var(--invest-color)';
                el.innerHTML = `
                    <div class="card-header">
                        <h3>${inv.name}</h3>
                        <span class="card-limit">${formatCurrency(inv.current_amount)}</span>
                    </div>
                    <div class="card-details">
                        <p style="color:var(--text-secondary);font-size:0.8rem">${inv.type}</p>
                        ${hasGoal ? `
                        <div style="margin-top:0.75rem">
                            <div style="height:5px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden">
                                <div style="height:100%;width:${percent}%;background:${barColor};border-radius:3px;transition:width 0.5s ease"></div>
                            </div>
                            <div style="display:flex;justify-content:space-between;margin-top:0.4rem;font-size:0.72rem;color:var(--text-secondary)">
                                <span>${percent.toFixed(0)}%</span>
                                <span>Meta: ${formatCurrency(inv.target_amount)}</span>
                            </div>
                        </div>` : ''}
                        <div class="card-dates" style="margin-top:0.75rem">
                            <button class="btn-icon-small edit" onclick="editInvestment('${invStr}')">✎</button>
                            <button class="btn-icon-small delete" onclick="deleteInvestment('${inv._id}')">🗑</button>
                        </div>
                    </div>`;
                investmentsContainer.appendChild(el);
            });
            if (totalInvestedEl) totalInvestedEl.textContent = formatCurrency(total);
        } catch (err) { console.error(err); }
    }

    window.openEntryModal = function(invId) {
        document.getElementById('entry-inv-id').value = invId;
        document.getElementById('entry-modal').style.display = 'flex';
    };

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
        if (!confirm('Excluir este investimento?')) return;
        await fetch(`/api/investments/${id}`, { method: 'DELETE' });
        loadInvestments();
    };
});
