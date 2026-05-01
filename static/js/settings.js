document.addEventListener('DOMContentLoaded', () => {
    const btnSettings = document.getElementById('btn-settings');
    const settingsModal = document.getElementById('settings-modal');
    const closeModal = document.querySelector('.close-modal');
    const categoriesList = document.getElementById('categories-list');
    const buyersList = document.getElementById('buyers-list');
    const newCategoryInput = document.getElementById('new-category-input');
    const newCategoryColor = document.getElementById('new-category-color');
    const newBuyerInput = document.getElementById('new-buyer-input');
    const btnAddCategory = document.getElementById('btn-add-category');
    const btnAddBuyer = document.getElementById('btn-add-buyer');
    const btnSaveSettings = document.getElementById('btn-save-settings');

    loadSettings();

    if (btnSettings) {
        btnSettings.addEventListener('click', () => {
            settingsModal.style.display = 'flex';
            renderTagsList(categoriesList, AppState.currentCategories, 'category');
            renderTagsList(buyersList, AppState.currentBuyers, 'buyer');
        });

        if (closeModal) closeModal.addEventListener('click', () => settingsModal.style.display = 'none');
        window.addEventListener('click', e => {
            if (e.target === settingsModal) settingsModal.style.display = 'none';
        });

        btnAddCategory.addEventListener('click', () => {
            const val = newCategoryInput.value.trim();
            const color = newCategoryColor ? newCategoryColor.value : '#3498db';
            if (val && !AppState.currentCategories.some(c => c.name.toLowerCase() === val.toLowerCase())) {
                AppState.currentCategories.push({ name: val, color });
                newCategoryInput.value = '';
                if (newCategoryColor) newCategoryColor.value = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
                renderTagsList(categoriesList, AppState.currentCategories, 'category');
            }
        });

        btnAddBuyer.addEventListener('click', () => {
            const val = newBuyerInput.value.trim();
            if (val && !AppState.currentBuyers.includes(val)) {
                AppState.currentBuyers.push(val);
                newBuyerInput.value = '';
                renderTagsList(buyersList, AppState.currentBuyers, 'buyer');
            }
        });

        btnSaveSettings.addEventListener('click', saveSettings);
    }

    async function loadSettings() {
        try {
            const res = await fetch('/api/settings');
            const data = await res.json();
            AppState.currentCategories = (data.categories || []).map(cat =>
                typeof cat === 'string' ? { name: cat, color: '#3498db' } : cat
            );
            AppState.currentBuyers = data.buyers || [];
            updateSelects();
        } catch (err) { console.error(err); }
    }

    async function saveSettings() {
        try {
            const res = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ categories: AppState.currentCategories, buyers: AppState.currentBuyers }),
            });
            if (res.ok) {
                settingsModal.style.display = 'none';
                updateSelects();
                alert('Settings saved!');
            }
        } catch (err) { console.error(err); }
    }

    function renderTagsList(container, list, type) {
        if (!container) return;
        container.innerHTML = '';
        list.forEach((item, index) => {
            const el = document.createElement('div');
            el.className = 'category-item';
            const contentHtml = type === 'category'
                ? `<input type="color" class="category-color-picker-small" value="${item.color}" data-index="${index}"><span>${item.name}</span>`
                : `<span>${item}</span>`;
            el.innerHTML = `${contentHtml}<button class="btn-remove-tag" data-index="${index}" data-type="${type}">×</button>`;
            container.appendChild(el);
        });

        if (type === 'category') {
            container.querySelectorAll('.category-color-picker-small').forEach(picker => {
                picker.addEventListener('change', e => {
                    list[parseInt(e.target.dataset.index)].color = e.target.value;
                });
            });
        }

        container.querySelectorAll('.btn-remove-tag').forEach(btn => {
            btn.addEventListener('click', e => {
                list.splice(parseInt(e.target.dataset.index), 1);
                renderTagsList(container, list, type);
            });
        });
    }
});

function updateSelects() {
    const categorySelects = [
        document.getElementById('exp-category'),
        document.getElementById('cons-category'),
    ].filter(Boolean);

    categorySelects.forEach(sel => {
        sel.innerHTML = '';
        AppState.currentCategories.forEach(cat => {
            const name = typeof cat === 'object' ? cat.name : cat;
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            sel.appendChild(opt);
        });
    });

    const buyerSel = document.getElementById('exp-buyer');
    if (buyerSel) {
        buyerSel.innerHTML = '';
        AppState.currentBuyers.forEach(buyer => {
            const opt = document.createElement('option');
            opt.value = buyer;
            opt.textContent = buyer;
            buyerSel.appendChild(opt);
        });
    }
}
