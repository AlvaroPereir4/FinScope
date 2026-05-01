// Shared state and utilities — loaded first on every page
window.AppState = {
    currentCategories: [],
    currentBuyers: [],
    isEditing: false,
    editingId: null,
    editingType: null,
    currentFilter: 'all',
    selectedYear: new Date().getFullYear().toString(),
    currentPage: 1,
    itemsPerPage: 30,
    allTableData: [],
    chartGranularity: 'month',
    chartDays: 30,
    detChartGranularity: 'month',
    detChartDays: 30,
    cachedDetailedExpenses: [],
    financeChart: null,
    detailedChart: null,
    today: new Date().toISOString().split('T')[0],
};

window.formatCurrency = function(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

window.formatDate = function(dateString) {
    const [year, month, day] = dateString.split('-');
    return `${day}/${month}/${year}`;
};

// Collapsible sections — present on multiple pages
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.collapsible .section-header').forEach(header => {
        header.addEventListener('click', () => {
            header.parentElement.classList.toggle('collapsed');
        });
    });
});
