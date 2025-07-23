import sqlite3
from werkzeug.security import generate_password_hash

DB_NAME = 'bank.db'

def initialize_database():
    """Creates the database and tables, and inserts default users."""
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()

    # Read and execute the schema file
    print("Executing schema...")
    with open('schema.sql', 'r') as f:
        cursor.executescript(f.read())
    print("Tables, views, and triggers created successfully.")

    # Insert default users with hashed passwords
    print("Inserting default users...")
    users = [
        ('admin', generate_password_hash('admin123'), 'admin', 'admin@securebank.com', 'System Administrator'),
        ('customer', generate_password_hash('customer123'), 'customer', 'customer@example.com', 'Test Customer'),
        ('manager', generate_password_hash('manager123'), 'manager', 'manager@securebank.com', 'Bank Manager')
    ]
    
    try:
        cursor.executemany(
            'INSERT INTO users (username, password, role, email, full_name) VALUES (?, ?, ?, ?, ?)',
            users
        )
        conn.commit()
        print("Default users inserted successfully.")
    except sqlite3.IntegrityError:
        print("Users already exist, skipping insertion.")
    except Exception as e:
        print(f"An error occurred during user insertion: {e}")
        conn.rollback()
    finally:
        conn.close()
        print("Database initialization complete.")

if __name__ == '__main__':
    initialize_database()