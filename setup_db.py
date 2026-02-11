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
        
        print("Conectado ao banco de dados.")
        
        # 1. Tabela de Usuários (Mantida)
        cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(50) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        """)
        
        # 2. Tabela de Cartões de Crédito (NOVA)
        cur.execute("""
        CREATE TABLE IF NOT EXISTS credit_cards (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            name VARCHAR(50) NOT NULL,
            holder_name VARCHAR(100),
            limit_amount NUMERIC(10, 2),
            closing_day INTEGER,
            due_day INTEGER,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        """)

        # 3. Tabela de Rendas (Mantida)
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

        # 4. Tabela de Gastos (ATUALIZADA)
        # Vamos recriar a tabela expenses se ela não tiver as colunas novas ou usar ALTER
        # Para garantir a estrutura correta neste estágio de dev, vamos adicionar colunas se não existirem.
        
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

        # Adicionando colunas novas na tabela expenses (caso já exista)
        alter_commands = [
            "ALTER TABLE expenses ADD COLUMN IF NOT EXISTS establishment VARCHAR(100);",
            "ALTER TABLE expenses ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50);",
            "ALTER TABLE expenses ADD COLUMN IF NOT EXISTS card_id INTEGER REFERENCES credit_cards(id) ON DELETE SET NULL;",
            "ALTER TABLE expenses ADD COLUMN IF NOT EXISTS installments VARCHAR(20);",
            "ALTER TABLE expenses ADD COLUMN IF NOT EXISTS observation TEXT;",
            "ALTER TABLE expenses ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'paid';"
        ]

        for command in alter_commands:
            try:
                cur.execute(command)
            except Exception as e:
                print(f"Aviso ao alterar tabela: {e}")
                conn.rollback()
            else:
                conn.commit()
        
        conn.commit()
        print("Banco de dados atualizado com Sucesso!")
        
        cur.close()
        conn.close()
        
    except Exception as e:
        print(f"Erro ao configurar o banco de dados: {e}")

if __name__ == "__main__":
    setup_database()
