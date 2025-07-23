// === app.js - Main Frontend Controller ===

// --- Configuration ---
const API_BASE_URL = 'http://127.0.0.1:5000/api';

// --- Application State ---
const AppState = {
    user: null, // To store user info after login {id, username, role}
    accounts: [], // Cache for accounts to populate dropdowns
};

// --- DOM Ready Event ---
document.addEventListener('DOMContentLoaded', () => {
    // Check if user is already logged in (e.g., from sessionStorage)
    const loggedInUser = sessionStorage.getItem('bankUser');
    if (loggedInUser) {
        AppState.user = JSON.parse(loggedInUser);
        showMainApp();
    } else {
        showLoginScreen();
    }

    // Add initial event listeners
    document.getElementById('loginButton').addEventListener('click', handleLogin);
    document.getElementById('logoutButton').addEventListener('click', handleLogout);
    document.querySelector('.tabs').addEventListener('click', handleTabClick);
});


// --- Authentication & View Management ---

async function handleLogin() {
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    const response = await apiRequest('/login', 'POST', { username, password });

    if (response && response.user) {
        AppState.user = response.user;
        sessionStorage.setItem('bankUser', JSON.stringify(response.user));
        showMainApp();
        showAlert('Login successful!', 'success');
    } else {
        showAlert(response.error || 'Login failed.', 'error', 'loginAlertContainer');
    }
}

function handleLogout() {
    AppState.user = null;
    sessionStorage.removeItem('bankUser');
    showLoginScreen();
}

function showMainApp() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');
    
    // Set user info and apply role-based UI changes
    document.getElementById('currentUser').textContent = AppState.user.username;
    document.getElementById('currentUserRole').textContent = AppState.user.role;
    document.getElementById('reportsTab').style.display = AppState.user.role === 'admin' ? 'block' : 'none';

    // Load the default view
    loadView('dashboard');
}

function showLoginScreen() {
    document.getElementById('mainApp').classList.add('hidden');
    document.getElementById('loginScreen').classList.remove('hidden');
}

function handleTabClick(event) {
    if (event.target.matches('.tab-btn')) {
        const viewName = event.target.dataset.view;
        
        // Update active tab style
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        event.target.classList.add('active');

        loadView(viewName);
    }
}

// --- Dynamic View Loading ---

async function loadView(viewName) {
    const container = document.getElementById('view-container');
    container.innerHTML = `<p>Loading ${viewName}...</p>`; // Show loading state
    
    try {
        const response = await fetch(`views/${viewName}.html`);
        if (!response.ok) throw new Error('View not found');
        container.innerHTML = await response.text();

        // After loading the HTML, run the specific logic for that view
        executeViewLogic(viewName);
    } catch (error) {
        container.innerHTML = `<p class="alert alert-error">Error loading view: ${error.message}</p>`;
    }
}

function executeViewLogic(viewName) {
    // This function acts as a router to call the correct setup function for each view
    switch (viewName) {
        case 'dashboard':
            setupDashboardView();
            break;
        case 'accounts':
            setupAccountsView();
            break;
        case 'transactions':
            setupTransactionsView();
            break;
        case 'transfer':
            setupTransferView();
            break;
        case 'reports':
            setupReportsView();
            break;
    }
}


// --- Logic for Each View ---

async function setupDashboardView() {
    const stats = await apiRequest('/reports/dashboard_stats');
    if (stats) {
        document.getElementById('stat-totalAccounts').textContent = stats.totalAccounts;
        document.getElementById('stat-totalBalance').textContent = formatCurrency(stats.totalBalance);
        document.getElementById('stat-todayTransactions').textContent = stats.todayTransactions;
    }

    const recentTxs = await apiRequest('/transactions?limit=5');
    const txList = document.getElementById('recent-transactions-list');
    txList.innerHTML = recentTxs && recentTxs.length ? recentTxs.map(renderTransactionItem).join('') : '<p>No recent transactions.</p>';
    
    const accounts = await apiRequest('/accounts?limit=5');
    const accList = document.getElementById('accounts-overview-list');
    accList.innerHTML = accounts && accounts.length ? accounts.map(renderAccountStatusItem).join('') : '<p>No accounts found.</p>';
}

function setupAccountsView() {
    // Apply role-based restrictions
    if (AppState.user.role !== 'admin') {
        document.getElementById('createAccountCard').style.display = 'none';
    }

    const searchInput = document.getElementById('searchAccountInput');
    const container = document.getElementById('accountsListContainer');
    
    // Use debounce to prevent API calls on every keystroke
    searchInput.addEventListener('input', debounce(() => fetchAndRenderAccounts(container, searchInput.value), 300));

    document.getElementById('createAccountForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = {
            name: document.getElementById('newAccountName').value,
            email: document.getElementById('newAccountEmail').value,
            phone: document.getElementById('newAccountPhone').value,
            type: document.getElementById('newAccountType').value,
            initialDeposit: parseFloat(document.getElementById('initialDeposit').value || 0),
            userId: AppState.user.id
        };
        const response = await apiRequest('/accounts', 'POST', data);
        if (response && response.accountNumber) {
            showAlert(`Account ${response.accountNumber} created successfully!`, 'success');
            e.target.reset();
            fetchAndRenderAccounts(container); // Refresh list
        }
    });

    // Initial load
    fetchAndRenderAccounts(container);
}

async function fetchAndRenderAccounts(container, searchQuery = '') {
    container.innerHTML = '<p>Loading accounts...</p>';
    const url = searchQuery ? `/accounts?search=${searchQuery}` : '/accounts';
    const accounts = await apiRequest(url);
    AppState.accounts = accounts || []; // Cache the accounts
    container.innerHTML = accounts && accounts.length ? accounts.map(renderAccountListItem).join('') : '<p>No accounts found.</p>';
}

function setupTransactionsView() {
    document.getElementById('depositForm').addEventListener('submit', handleTransactionSubmit('deposit'));
    
    // CHANGE THIS LINE:
    document.getElementById('withdrawalForm').addEventListener('submit', handleTransactionSubmit('withdraw')); 

    const filterInput = document.getElementById('transactionFilterAccount');
    filterInput.addEventListener('input', debounce(() => fetchAndRenderTransactions(), 500));
    
    fetchAndRenderTransactions();
}

function handleTransactionSubmit(type) {
    return async (e) => {
        e.preventDefault();
        const form = e.target;
        const data = {
            accountNumber: form.querySelector(`input[id^="${type}Account"]`).value,
            amount: parseFloat(form.querySelector(`input[id^="${type}Amount"]`).value),
            note: form.querySelector(`input[id^="${type}Note"]`).value,
            userId: AppState.user.id
        };
        const response = await apiRequest(`/transactions/${type}`, 'POST', data);
        if (response && response.newBalance !== undefined) {
            showAlert(`${type.charAt(0).toUpperCase() + type.slice(1)} successful! New Balance: ${formatCurrency(response.newBalance)}`, 'success');
            form.reset();
        }
    };
}

async function fetchAndRenderTransactions() {
    const container = document.getElementById('transactionHistoryContainer');
    const accountNumber = document.getElementById('transactionFilterAccount').value;
    const url = accountNumber ? `/transactions?accountNumber=${accountNumber}` : '/transactions';
    const transactions = await apiRequest(url);
    
    container.innerHTML = transactions && transactions.length 
        ? renderTransactionTable(transactions) 
        : '<p>No transactions found for this filter.</p>';
}


async function setupTransferView() {
    const fromSelect = document.getElementById('fromAccount');
    const toSelect = document.getElementById('toAccount');

    if (!AppState.accounts.length) {
        AppState.accounts = await apiRequest('/accounts') || [];
    }

    const options = AppState.accounts.map(acc => `<option value="${acc.account_number}">${acc.account_holder_name} - ${acc.account_number}</option>`).join('');
    fromSelect.innerHTML = options;
    toSelect.innerHTML = options;

    document.getElementById('transferForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = {
            fromAccount: fromSelect.value,
            toAccount: toSelect.value,
            amount: parseFloat(document.getElementById('transferAmount').value),
            note: document.getElementById('transferNote').value,
            userId: AppState.user.id
        };
        if (data.fromAccount === data.toAccount) {
            showAlert('Cannot transfer to the same account.', 'error');
return;
        }
        const response = await apiRequest('/transactions/transfer', 'POST', data);
        if (response && response.message) {
            showAlert(response.message, 'success');
            e.target.reset();
        }
    });
}

function setupReportsView() {
    document.getElementById('generateAccountReportBtn').addEventListener('click', async () => {
        const container = document.getElementById('accountSummaryContainer');
        container.innerHTML = '<p>Generating report...</p>';
        const data = await apiRequest('/reports/account_summary');
        container.innerHTML = data && data.length ? renderAccountSummaryTable(data) : '<p>No data available.</p>';
    });

    document.getElementById('generateDailySummaryBtn').addEventListener('click', async () => {
        const container = document.getElementById('dailySummaryContainer');
        container.innerHTML = '<p>Generating report...</p>';
        const data = await apiRequest('/reports/daily_summary');
        container.innerHTML = data && data.length ? renderDailySummaryTable(data) : '<p>No data available.</p>';
    });
}


// --- Rendering Functions ---

function renderAccountListItem(acc) {
    return `<div class="account-list-item">
        <div>
            <strong>${acc.account_holder_name} (${acc.account_number})</strong><br>
            <span>${acc.email} | ${acc.phone || 'N/A'}</span>
        </div>
        <div>
            <span style="font-weight: bold; font-size: 1.2em;">${formatCurrency(acc.balance)}</span><br>
            <span class="status-indicator status-${acc.status.toLowerCase()}">${acc.status}</span>
        </div>
    </div>`;
}

function renderTransactionItem(tx) {
    const isCredit = tx.transaction_type.includes('in') || tx.transaction_type === 'deposit';
    return `<div class="transaction-item">
        <div>
            <strong>Account ${tx.account_number}</strong><br>
            <small>${tx.transaction_type.replace('_', ' ').toUpperCase()} - ${new Date(tx.transaction_date).toLocaleDateString()}</small>
        </div>
        <div class="${isCredit ? 'amount-positive' : 'amount-negative'}">
            ${isCredit ? '+' : '-'}${formatCurrency(tx.amount)}
        </div>
    </div>`;
}

function renderAccountStatusItem(acc) {
    return `<div class="transaction-item">
        <div>
            <strong>${acc.account_holder_name} (${acc.account_number})</strong><br>
            <small>${acc.account_type.charAt(0).toUpperCase() + acc.account_type.slice(1)} Account</small>
        </div>
        <span class="status-indicator status-${acc.status.toLowerCase()}">${acc.status}</span>
    </div>`;
}

function renderTransactionTable(transactions) {
    let table = `<table><thead><tr>
        <th>ID</th><th>Date</th><th>Account</th><th>Type</th><th>Amount</th><th>Note</th>
    </tr></thead><tbody>`;
    table += transactions.map(tx => {
        const isCredit = tx.transaction_type.includes('in') || tx.transaction_type === 'deposit';
        return `<tr>
            <td>${tx.transaction_id}</td>
            <td>${new Date(tx.transaction_date).toLocaleString()}</td>
            <td>${tx.account_number}</td>
            <td>${tx.transaction_type.replace('_',' ').toUpperCase()}</td>
            <td class="${isCredit ? 'amount-positive' : 'amount-negative'}">${formatCurrency(tx.amount)}</td>
            <td>${tx.note || ''}</td>
        </tr>`;
    }).join('');
    table += '</tbody></table>';
    return table;
}

function renderAccountSummaryTable(data) {
    let table = `<table><thead><tr><th>Account #</th><th>Holder</th><th>Type</th><th>Balance</th><th>Status</th><th>Transactions</th></tr></thead><tbody>`;
    table += data.map(row => `<tr>
        <td>${row.account_number}</td>
        <td>${row.account_holder_name}</td>
        <td>${row.account_type}</td>
        <td>${formatCurrency(row.balance)}</td>
        <td><span class="status-indicator status-${row.status.toLowerCase()}">${row.status}</span></td>
        <td>${row.transaction_count}</td>
    </tr>`).join('');
    return table + '</tbody></table>';
}

function renderDailySummaryTable(data) {
    let table = `<table><thead><tr><th>Date</th><th>Total Txs</th><th>Total Credits</th><th>Total Debits</th></tr></thead><tbody>`;
    table += data.map(row => `<tr>
        <td>${new Date(row.transaction_date).toLocaleDateString()}</td>
        <td>${row.total_transactions}</td>
        <td class="amount-positive">${formatCurrency(row.total_credits)}</td>
        <td class="amount-negative">${formatCurrency(row.total_debits)}</td>
    </tr>`).join('');
    return table + '</tbody></table>';
}


// --- API & Utility Functions ---

async function apiRequest(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' },
    };
    if (body) {
        options.body = JSON.stringify(body);
    }
    try {
        const response = await fetch(API_BASE_URL + endpoint, options);
        const data = await response.json();
        if (!response.ok) {
            showAlert(data.error || `HTTP error! Status: ${response.status}`, 'error');
            return null;
        }
        return data;
    } catch (error) {
        showAlert(`Network error: ${error.message}`, 'error');
        return null;
    }
}

function formatCurrency(amount) {
    if (amount === null || amount === undefined) return '$0.00';
    return '$' + parseFloat(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function showAlert(message, type, containerId = 'alertContainer') {
    const container = document.getElementById(containerId);
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    container.prepend(alert);
    setTimeout(() => {
        alert.style.opacity = '0';
        setTimeout(() => alert.remove(), 500);
    }, 4000);
}

function debounce(func, delay) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}