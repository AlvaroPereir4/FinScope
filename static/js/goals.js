document.addEventListener('DOMContentLoaded', () => {
    const goalsContainer = document.getElementById('goals-container');
    const goalForm = document.getElementById('goal-form');

    if (!goalsContainer) return;

    loadGoals();

    if (goalForm) {
        goalForm.addEventListener('submit', async e => {
            e.preventDefault();
            const id = document.getElementById('goal-id').value;
            const data = {
                title: document.getElementById('goal-title').value,
                type: document.getElementById('goal-type').value,
                target_amount: parseFloat(document.getElementById('goal-target').value),
                current_amount: parseFloat(document.getElementById('goal-current').value),
                deadline: document.getElementById('goal-deadline').value,
            };
            const url = id ? `/api/goals/${id}` : '/api/goals';
            try {
                const res = await fetch(url, { method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
                if (res.ok) {
                    const modal = document.getElementById('goal-modal');
                    if (modal) modal.style.display = 'none';
                    loadGoals();
                }
            } catch (err) { console.error(err); }
        });
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
                        <div class="progress-fill" style="width:${percent}%"></div>
                    </div>
                    <div class="goal-stats">
                        <span>${formatCurrency(goal.current_amount)} / ${formatCurrency(goal.target_amount)}</span>
                        <span>${percent.toFixed(1)}%</span>
                    </div>
                    <div class="goal-deadline">Meta: ${formatDate(goal.deadline)}</div>`;
                goalsContainer.appendChild(el);
            });
        } catch (err) { console.error(err); }
    }

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
        if (!confirm('Excluir esta meta?')) return;
        await fetch(`/api/goals/${id}`, { method: 'DELETE' });
        loadGoals();
    };
});
