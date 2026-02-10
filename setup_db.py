import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

def setup_database():
    db_url = os.getenv("DATABASE_URL")
    
    if not db_url:
        print("Erro: DATABASE_URL não encontrada no arquivo .env")
        return

    try:
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()
        
        print("Conectado ao banco de dados com sucesso.")
        
        # Tabela de Usuários
        cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(50) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        """)
        
        # Tabela de Rendas (Incomes) com user_id
        cur.execute("""
        CREATE TABLE IF NOT EXISTS incomes (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            description TEXT NOT NULL,
            amount NUMERIC(10, 2) NOT NULL,
            date DATE NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        """)

        # Tabela de Gastos (Expenses)
        cur.execute("""
        CREATE TABLE IF NOT EXISTS expenses (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            description TEXT NOT NULL,
            amount NUMERIC(10, 2) NOT NULL,
            category VARCHAR(50),
            date DATE NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        """)
        
        conn.commit()
        print("Tabelas 'users', 'incomes' e 'expenses' verificadas/criadas com sucesso!")
        
        cur.close()
        conn.close()
        
    except Exception as e:
        print(f"Erro ao configurar o banco de dados: {e}")

if __name__ == "__main__":
    setup_database()
