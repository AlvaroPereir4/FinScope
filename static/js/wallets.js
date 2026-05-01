document.addEventListener('DOMContentLoaded', () => {
    const walletTable = document.querySelector('#wallet-table tbody');
    const totalWalletBalanceEl = document.getElementById('total-wallet-balance');
    const walletForm = document.getElementById('wallet-form');

    if (!walletTable) return;

    loadWallets();

    if (walletForm) {
        walletForm.addEventListener('submit', async e => {
            e.preventDefault();
            const id = document.getElementById('wallet-id').value;
            const data = {
                name: document.getElementById('wallet-name').value,
                balance: parseFloat(document.getElementById('wallet-balance').value),
            };
            const url = id ? `/api/wallets/${id}` : '/api/wallets';
            try {
                const res = await fetch(url, { method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
                if (res.ok) { document.getElementById('wallet-modal').style.display = 'none'; loadWallets(); }
            } catch (err) { console.error(err); }
        });
    }

    async function loadWallets() {
        try {
            const res = await fetch('/api/wallets');
            const wallets = await res.json();
            walletTable.innerHTML = '';
            let total = 0;
            wallets.forEach(w => {
                total += w.balance;
                const wStr = encodeURIComponent(JSON.stringify(w));
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${w.name}</td>
                    <td class="${w.balance >= 0 ? 'amount-positive' : 'amount-negative'}">${formatCurrency(w.balance)}</td>
                    <td>
                        <button class="btn-icon-small edit" onclick="editWallet('${wStr}')">✎</button>
                        <button class="btn-icon-small delete" onclick="deleteWallet('${w._id}')">🗑</button>
                    </td>`;
                walletTable.appendChild(row);
            });
            if (totalWalletBalanceEl) totalWalletBalanceEl.textContent = formatCurrency(total);
        } catch (err) { console.error(err); }
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
        if (!confirm('Excluir esta conta?')) return;
        await fetch(`/api/wallets/${id}`, { method: 'DELETE' });
        loadWallets();
    };
});
