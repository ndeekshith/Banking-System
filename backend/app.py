import sqlite3
from flask import Flask, jsonify, request
from flask_cors import CORS
from werkzeug.security import check_password_hash
import db_utils


app = Flask(__name__)
CORS(app) # Enable Cross-Origin Resource Sharing


@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Invalid JSON in request'}), 400

    user = db_utils.get_user_by_username(data.get('username'))

    # Manually convert the sqlite3.Row to a dictionary before using it
    user_dict = dict(user) if user else None

    if user_dict and check_password_hash(user_dict['password'], data.get('password')):
        return jsonify({
            'message': 'Login successful',
            'user': { 
                'id': user_dict['id'], 
                'username': user_dict['username'], 
                'role': user_dict['role'] 
            }
        }), 200
    else:
        return jsonify({'error': 'Invalid username or password'}), 401

@app.route('/api/accounts', methods=['GET'])
def get_accounts():
    search_query = request.args.get('search')
    limit = request.args.get('limit', type=int)
    accounts = db_utils.get_accounts(search_query, limit)
    
    # Convert list of Rows to list of dicts
    if accounts is not None:
        return jsonify([dict(row) for row in accounts])
    
    return jsonify({'error': 'Failed to fetch accounts'}), 500

@app.route('/api/accounts', methods=['POST'])
def create_account():
    data = request.get_json()
    if not all(k in data for k in ['name', 'email', 'type', 'initialDeposit', 'userId']):
        return jsonify({'error': 'Missing required fields'}), 400
    
    account_number, error = db_utils.create_account(data)
    if error:
        return jsonify({'error': f'Failed to create account: {error}'}), 500
    return jsonify({'message': 'Account created successfully', 'accountNumber': account_number}), 201

@app.route('/api/transactions/deposit', methods=['POST'])
def deposit():
    data = request.get_json()
    data['type'] = 'deposit'
    new_balance, error = db_utils.process_transaction(data)
    if error:
        return jsonify({'error': error}), 400
    return jsonify({'message': 'Deposit successful', 'newBalance': new_balance}), 200

@app.route('/api/transactions/withdraw', methods=['POST'])
def withdraw():
    data = request.get_json()
    data['type'] = 'withdrawal' 
    
    new_balance, error = db_utils.process_transaction(data)
    if error:
        return jsonify({'error': error}), 400
    return jsonify({'message': 'Withdrawal successful', 'newBalance': new_balance}), 200
@app.route('/api/transactions/transfer', methods=['POST'])
def transfer():
    data = request.get_json()
    success, error = db_utils.process_transfer(data)
    if error:
        return jsonify({'error': error}), 400
    return jsonify({'message': 'Transfer successful'}), 200

@app.route('/api/transactions', methods=['GET'])
def get_transactions():
    account_number = request.args.get('accountNumber')
    limit = request.args.get('limit', type=int)
    query = "SELECT * FROM transactions"
    params = []
    if account_number:
        query += " WHERE account_number = ?"
        params.append(account_number)
    query += " ORDER BY transaction_date DESC"
    if limit:
        query += " LIMIT ?"
        params.append(limit)
    
    transactions = db_utils.execute_query(query, params, fetch='all')
    if transactions is not None:
        return jsonify([dict(row) for row in transactions])
    
    return jsonify({'error': 'Failed to fetch transactions'}), 500

@app.route('/api/reports/dashboard_stats', methods=['GET'])
def get_dashboard_stats():
    acc_summary = db_utils.execute_query("SELECT COUNT(*) as totalAccounts, SUM(balance) as totalBalance FROM accounts", fetch='one')
    daily_summary = db_utils.execute_query("SELECT COUNT(*) as todayTransactions FROM daily_transaction_summary WHERE transaction_date = DATE('now')", fetch='one')
    
    stats = {
        'totalAccounts': dict(acc_summary).get('totalAccounts', 0) if acc_summary else 0,
        'totalBalance': dict(acc_summary).get('totalBalance', 0) if acc_summary else 0,
        'todayTransactions': dict(daily_summary).get('todayTransactions', 0) if daily_summary else 0
    }
    return jsonify(stats)

@app.route('/api/reports/account_summary', methods=['GET'])
def get_account_summary_report():
    data = db_utils.execute_query("SELECT * FROM account_summary", fetch='all')
    return jsonify([dict(row) for row in data]) if data is not None else (jsonify({'error': 'Failed to generate report'}), 500)

@app.route('/api/reports/daily_summary', methods=['GET'])
def get_daily_summary_report():
    data = db_utils.execute_query("SELECT * FROM daily_transaction_summary", fetch='all')
    return jsonify([dict(row) for row in data]) if data is not None else (jsonify({'error': 'Failed to generate report'}), 500)

if __name__ == '__main__':
    app.run(debug=True, port=5000)