-- Bank Management System Database Schema for SQLite

-- Users table for authentication
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT CHECK(role IN ('admin', 'customer', 'manager')) DEFAULT 'customer',
    email TEXT,
    full_name TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

-- Accounts table
CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_number TEXT UNIQUE NOT NULL,
    account_holder_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    account_type TEXT CHECK(account_type IN ('checking', 'savings', 'business')) NOT NULL,
    balance REAL DEFAULT 0.00,
    status TEXT CHECK(status IN ('active', 'inactive', 'frozen')) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id TEXT UNIQUE NOT NULL,
    account_number TEXT NOT NULL,
    transaction_type TEXT CHECK(transaction_type IN ('deposit', 'withdrawal', 'transfer_in', 'transfer_out')) NOT NULL,
    amount REAL NOT NULL,
    balance_after REAL NOT NULL,
    note TEXT,
    related_account TEXT, -- For transfers
    transaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_by INTEGER,
    status TEXT CHECK(status IN ('pending', 'completed', 'failed', 'cancelled')) DEFAULT 'completed',
    FOREIGN KEY (account_number) REFERENCES accounts(account_number),
    FOREIGN KEY (processed_by) REFERENCES users(id)
);

-- Triggers to automatically update the 'updated_at' timestamps
CREATE TRIGGER IF NOT EXISTS update_users_updated_at
AFTER UPDATE ON users
FOR EACH ROW
BEGIN
    UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS update_accounts_updated_at
AFTER UPDATE ON accounts
FOR EACH ROW
BEGIN
    UPDATE accounts SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;
CREATE INDEX IF NOT EXISTS idx_accounts_status ON accounts(status);
-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_accounts_status ON accounts(status);
CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(account_type);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_transaction_date ON transactions(transaction_date);

-- Views are compatible with SQLite and can be created after the tables
CREATE VIEW IF NOT EXISTS account_summary AS
SELECT 
    a.account_number,
    a.account_holder_name,
    a.account_type,
    a.balance,
    a.status,
    a.created_at,
    COUNT(t.id) as transaction_count
FROM accounts a
LEFT JOIN transactions t ON a.account_number = t.account_number
GROUP BY a.account_number, a.account_holder_name, a.account_type, a.balance, a.status, a.created_at;

CREATE VIEW IF NOT EXISTS daily_transaction_summary AS
SELECT 
    DATE(transaction_date) as transaction_date,
    COUNT(*) as total_transactions,
    SUM(CASE WHEN transaction_type IN ('deposit', 'transfer_in') THEN amount ELSE 0 END) as total_credits,
    SUM(CASE WHEN transaction_type IN ('withdrawal', 'transfer_out') THEN amount ELSE 0 END) as total_debits
FROM transactions 
WHERE status = 'completed'
GROUP BY DATE(transaction_date)
ORDER BY transaction_date DESC;