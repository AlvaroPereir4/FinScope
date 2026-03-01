document.addEventListener("DOMContentLoaded", () => {
    if (!document.getElementById("detailsSidebar")) {
        const sidebarHTML = `
            <div id="detailsSidebarOverlay" class="sidebar-overlay" onclick="closeSidebar()"></div>
            <div id="detailsSidebar" class="sidebar-panel">
                <div class="sidebar-header">
                    <h3 id="sidebarTitle">Detalhes</h3>
                    <button type="button" class="btn-close-custom" onclick="closeSidebar()">&times;</button>
                </div>
                <div id="sidebarBody" class="sidebar-body">
                    <div class="sb-spinner"></div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML("beforeend", sidebarHTML);
    }
});

function closeSidebar() {
    document.getElementById("detailsSidebar").classList.remove("open");
    document.getElementById("detailsSidebarOverlay").classList.remove("open");
}

async function openSidebar(date, scope) {
    const sidebar = document.getElementById("detailsSidebar");
    const overlay = document.getElementById("detailsSidebarOverlay");
    const body = document.getElementById("sidebarBody");
    const title = document.getElementById("sidebarTitle");

    sidebar.classList.add("open");
    overlay.classList.add("open");
    
    title.innerText = `Transações: ${date}`;
    body.innerHTML = '<div class="sb-spinner"></div>';

    try {
        const res = await fetch(`/api/transactions?date=${date}&scope=${scope}&limit=100`);
        const data = await res.json();

        if (!data.items || data.items.length === 0) {
            body.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--text-secondary);">Nenhuma transação encontrada para esta data.</div>';
            return;
        }

        let html = '<div class="sidebar-list">';
        data.items.forEach(item => {
            const isExpense = item.type === 'expense';
            const colorClass = isExpense ? 'sb-text-danger' : 'sb-text-success';
            const sign = isExpense ? '-' : '+';
            const amount = parseFloat(item.amount).toFixed(2);
            
            const itemStr = encodeURIComponent(JSON.stringify(item));
            
            html += `
                <div class="sidebar-item" id="sb-item-${item._id}">
                    <div class="sb-d-flex sb-justify-between sb-align-center" style="width: 100%">
                        <div class="sb-flex-col">
                            <div class="sb-fw-bold">${item.description}</div>
                            <small class="sb-text-muted">${item.category || 'Geral'} • ${item.payment_method || '-'}</small>
                        </div>
                        <div class="sb-d-flex sb-align-center">
                            <span class="${colorClass} sb-amount" style="margin-right: 10px;">${sign} ${amount}</span>
                            <button class="btn-icon-custom" onclick="editSidebarItem('${itemStr}')" title="Editar">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        body.innerHTML = html;

    } catch (err) {
        console.error(err);
        body.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--danger-color);">Erro ao carregar dados.</div>';
    }
}

function editSidebarItem(itemStr) {
    const item = JSON.parse(decodeURIComponent(itemStr));
    const container = document.getElementById(`sb-item-${item._id}`);
    
    container.dataset.originalHtml = container.innerHTML;
    const showCategory = item.type === 'expense';

    container.innerHTML = `
        <div class="sb-flex-col" style="width: 100%; padding: 0.5rem 0;">
            <div class="sidebar-form-group">
                <input type="text" id="edit-desc-${item._id}" class="sidebar-input" value="${item.description}" placeholder="Descrição">
            </div>
            <div class="sb-d-flex" style="gap: 0.5rem;">
                <div class="sidebar-form-group" style="flex: 1;">
                    <input type="number" id="edit-amount-${item._id}" class="sidebar-input" value="${item.amount}" step="0.01" placeholder="Valor">
                </div>
                <div class="sidebar-form-group" style="flex: 1;">
                    <input type="date" id="edit-date-${item._id}" class="sidebar-input" value="${item.date}">
                </div>
            </div>
            ${showCategory ? `
            <div class="sidebar-form-group">
                <input type="text" id="edit-cat-${item._id}" class="sidebar-input" value="${item.category || ''}" placeholder="Categoria">
            </div>` : ''}
            
            <div class="sidebar-actions">
                <button class="btn-small btn-secondary" onclick="cancelSidebarEdit('${item._id}')">Cancelar</button>
                <button class="btn-small btn-primary" onclick="saveSidebarItem('${item._id}', '${item.type}', '${item.source}')">Salvar</button>
            </div>
        </div>
    `;
}

function cancelSidebarEdit(id) {
    const container = document.getElementById(`sb-item-${id}`);
    if (container.dataset.originalHtml) {
        container.innerHTML = container.dataset.originalHtml;
    }
}

async function saveSidebarItem(id, type, source) {
    const desc = document.getElementById(`edit-desc-${id}`).value;
    const amount = document.getElementById(`edit-amount-${id}`).value;
    const date = document.getElementById(`edit-date-${id}`).value;
    const catInput = document.getElementById(`edit-cat-${id}`);
    const category = catInput ? catInput.value : 'General';

    let url = '';
    if (type === 'income') {
        url = `/api/incomes/${id}`;
    } else if (source === 'macro') {
        url = `/api/macro-expenses/${id}`;
    } else {
        url = `/api/expenses/${id}`;
    }

    const payload = {
        description: desc,
        amount: parseFloat(amount),
        date: date,
        category: category,
    };

    try {
        const res = await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            const container = document.getElementById(`sb-item-${id}`);
            const isExpense = type === 'expense';
            const colorClass = isExpense ? 'sb-text-danger' : 'sb-text-success';
            const sign = isExpense ? '-' : '+';
            
            const newItem = { _id: id, type, source, description: desc, amount, date, category };
            const itemStr = encodeURIComponent(JSON.stringify(newItem));

            container.innerHTML = `
                <div class="sb-d-flex sb-justify-between sb-align-center" style="width: 100%">
                    <div class="sb-flex-col">
                        <div class="sb-fw-bold">${desc}</div>
                        <small class="sb-text-muted">${category} • ${date}</small>
                    </div>
                    <div class="sb-d-flex sb-align-center">
                        <span class="${colorClass} sb-amount" style="margin-right: 10px;">${sign} ${parseFloat(amount).toFixed(2)}</span>
                        <button class="btn-icon-custom" onclick="editSidebarItem('${itemStr}')" title="Editar"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg></button>
                    </div>
                </div>
            `;
        } else {
            alert('Erro ao salvar edição.');
        }
    } catch (err) {
        console.error(err);
        alert('Erro de conexão.');
    }
}

function handleChartClick(evt, activeElements, chart, scope, currentYear) {
    if (activeElements.length === 0) return;
    
    const index = activeElements[0].index;
    const label = chart.data.labels[index];
    
    let dateParam = label;
    
    if (label.includes('/')) {
        const parts = label.split('/');
        if (parts[1].length === 4) dateParam = `${parts[1]}-${parts[0]}`;
        else dateParam = `${currentYear}-${parts[1]}-${parts[0]}`;
    }
    
    openSidebar(dateParam, scope);
}