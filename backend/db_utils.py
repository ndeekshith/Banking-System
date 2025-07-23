import sqlite3
import uuid

DB_NAME = 'bank.db'

def get_db_connection():
    """Establishes a connection to the SQLite database."""
    conn = sqlite3.connect(DB_NAME)
    conn.execute('PRAGMA journal_mode=WAL;')
    # Return rows as dictionary-like objects
    conn.row_factory = sqlite3.Row
    return conn

def execute_query(query, params=None, fetch=None):
    """
    Executes a given SQL query with optional parameters.
    - 'fetch' can be 'one', 'all', or None (for insert/update).
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(query, params or ())
        
        if fetch == 'one':
            result = cursor.fetchone()
        elif fetch == 'all':
            result = cursor.fetchall()
        else:
            conn.commit()
            result = cursor.lastrowid
            
        return result
    except sqlite3.Error as err:
        print(f"Database Error: {err}")
        conn.rollback()
        return None
    finally:
        conn.close()

# --- Specific Query Functions ---

def get_user_by_username(username):
    query = "SELECT * FROM users WHERE username = ?"
    return execute_query(query, (username,), fetch='one')

def get_accounts(search_query=None, limit=None):
    query = "SELECT * FROM accounts"
    params = []
    if search_query:
        query += " WHERE account_number LIKE ? OR account_holder_name LIKE ?"
        params.extend([f'%{search_query}%', f'%{search_query}%'])
    
    query += " ORDER BY created_at DESC"
    
    if limit:
        query += " LIMIT ?"
        params.append(limit)

    return execute_query(query, params, fetch='all')

def create_account(data):
    # Transaction handled within execute_query
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Get the latest account number and increment it
        cursor.execute("SELECT MAX(CAST(account_number AS INTEGER)) as max_acc FROM accounts")
        max_acc_num = cursor.fetchone()['max_acc'] or 100000
        new_acc_num = str(int(max_acc_num) + 1)

        acc_query = """
            INSERT INTO accounts (account_number, account_holder_name, email, phone, account_type, balance, created_by) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """
        cursor.execute(acc_query, (new_acc_num, data['name'], data['email'], data['phone'], data['type'], data['initialDeposit'], data['userId']))
        
        if float(data['initialDeposit']) > 0:
            tx_id = f"TXN-{uuid.uuid4().hex[:10].upper()}"
            tx_query = """
                INSERT INTO transactions (transaction_id, account_number, transaction_type, amount, balance_after, note, processed_by)
                VALUES (?, ?, 'deposit', ?, ?, 'Initial deposit', ?)
            """
            cursor.execute(tx_query, (tx_id, new_acc_num, data['initialDeposit'], data['initialDeposit'], data['userId']))

        conn.commit()
        return new_acc_num, None
    except sqlite3.Error as err:
        conn.rollback()
        return None, str(err)
    finally:
        conn.close()

def process_transaction(data):
    # SQLite handles locking at the file level. For low/medium traffic, this is sufficient.
    # The entire block is a transaction.
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("BEGIN")
        cursor.execute("SELECT balance, status FROM accounts WHERE account_number = ?", (data['accountNumber'],))
        account = cursor.fetchone()

        if not account: return None, "Account not found"
        if account['status'] != 'active': return None, f"Account is {account['status']}"

        current_balance = float(account['balance'])
        amount = float(data['amount'])
        
        if data['type'] == 'withdrawal' and current_balance < amount:
            return None, "Insufficient funds"

        new_balance = current_balance + amount if data['type'] == 'deposit' else current_balance - amount
        
        cursor.execute("UPDATE accounts SET balance = ? WHERE account_number = ?", (new_balance, data['accountNumber']))
        
        tx_id = f"TXN-{uuid.uuid4().hex[:10].upper()}"
        cursor.execute(
            "INSERT INTO transactions (transaction_id, account_number, transaction_type, amount, balance_after, note, processed_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (tx_id, data['accountNumber'], data['type'], amount, new_balance, data['note'], data['userId'])
        )
        
        conn.commit()
        return new_balance, None
    except sqlite3.Error as err:
        conn.rollback()
        return None, str(err)
    finally:
        conn.close()

def process_transfer(data):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("BEGIN") # Start transaction
        # Fetch accounts
        cursor.execute("SELECT * FROM accounts WHERE account_number = ?", (data['fromAccount'],))
        from_account = cursor.fetchone()
        cursor.execute("SELECT * FROM accounts WHERE account_number = ?", (data['toAccount'],))
        to_account = cursor.fetchone()

        # Validations
        if not from_account or not to_account: return None, "One or both accounts not found"
        if float(from_account['balance']) < float(data['amount']): return None, "Insufficient funds"

        # Calculations
        from_new_balance = float(from_account['balance']) - float(data['amount'])
        to_new_balance = float(to_account['balance']) + float(data['amount'])

        # Update balances
        cursor.execute("UPDATE accounts SET balance = ? WHERE account_number = ?", (from_new_balance, data['fromAccount']))
        cursor.execute("UPDATE accounts SET balance = ? WHERE account_number = ?", (to_new_balance, data['toAccount']))

        # Record transactions
        cursor.execute(
            "INSERT INTO transactions (transaction_id, account_number, transaction_type, amount, balance_after, note, related_account, processed_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (f"TXN-{uuid.uuid4().hex[:8]}", data['fromAccount'], 'transfer_out', data['amount'], from_new_balance, data['note'], data['toAccount'], data['userId'])
        )
        cursor.execute(
            "INSERT INTO transactions (transaction_id, account_number, transaction_type, amount, balance_after, note, related_account, processed_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (f"TXN-{uuid.uuid4().hex[:8]}", data['toAccount'], 'transfer_in', data['amount'], to_new_balance, data['note'], data['fromAccount'], data['userId'])
        )

        conn.commit() # Commit transaction
        return True, None
    except sqlite3.Error as err:
        conn.rollback()
        return None, str(err)
    finally:
        conn.close()