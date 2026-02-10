from flask import Flask, render_template, request, jsonify, redirect, url_for, flash
import os
from pymongo import MongoClient
from bson.objectid import ObjectId
import datetime
from dotenv import load_dotenv
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from werkzeug.security import generate_password_hash, check_password_hash

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "dev_key_super_secret")

# Configuração do Login
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

def get_db_connection():
    client = MongoClient(os.getenv("DATABASE_URL"))
    return client.get_default_database()

class User(UserMixin):
    def __init__(self, id, username, password_hash):
        self.id = str(id)
        self.username = username
        self.password_hash = password_hash

@login_manager.user_loader
def load_user(user_id):
    db = get_db_connection()
    try:
        user_data = db.users.find_one({"_id": ObjectId(user_id)})
    except:
        return None
        
    if user_data:
        return User(user_data['_id'], user_data['username'], user_data['password_hash'])
    return None

# --- Rotas de Autenticação ---

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        
        db = get_db_connection()
        user_data = db.users.find_one({"username": username})
        
        if user_data and check_password_hash(user_data['password_hash'], password):
            user = User(user_data['_id'], user_data['username'], user_data['password_hash'])
            login_user(user)
            return redirect(url_for('index'))
        else:
            flash('Usuário ou senha inválidos')
            
    return render_template('login.html')

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        
        hashed_password = generate_password_hash(password)
        
        db = get_db_connection()
        
        if db.users.find_one({"username": username}):
            flash('Nome de usuário já existe.')
        else:
            db.users.insert_one({"username": username, "password_hash": hashed_password})
            flash('Conta criada com sucesso! Faça login.')
            return redirect(url_for('login'))
            
    return render_template('register.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))

# --- Rotas Principais ---

@app.route('/')
@login_required
def index():
    return render_template('index.html', username=current_user.username)

# --- API Endpoints ---

@app.route('/api/incomes', methods=['GET', 'POST'])
@login_required
def incomes():
    db = get_db_connection()
    
    if request.method == 'POST':
        data = request.json
        try:
            new_income = {
                "user_id": current_user.id,
                "description": data['description'],
                "amount": float(data['amount']),
                "date": data['date'],
                "created_at": datetime.datetime.utcnow()
            }
            result = db.incomes.insert_one(new_income)
            new_income['_id'] = str(result.inserted_id)
            
            # Format response
            
            return jsonify([new_income])
        except Exception as e:
            return jsonify({"error": str(e)}), 400
    
    # GET
    try:
        incomes_cursor = db.incomes.find({"user_id": current_user.id}).sort("date", -1)
        incomes_list = list(incomes_cursor)
        
        for item in incomes_list:
            item['_id'] = str(item['_id'])
            # O MongoDB já guarda como float se inserirmos como float, mas garantindo:
            item['amount'] = float(item.get('amount', 0))
            
        return jsonify(incomes_list)
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route('/api/expenses', methods=['GET', 'POST'])
@login_required
def expenses():
    db = get_db_connection()
    
    if request.method == 'POST':
        data = request.json
        try:
            new_expense = {
                "user_id": current_user.id,
                "description": data['description'],
                "amount": float(data['amount']),
                "category": data.get('category', 'Geral'),
                "date": data['date'],
                "created_at": datetime.datetime.utcnow()
            }
            result = db.expenses.insert_one(new_expense)
            new_expense['_id'] = str(result.inserted_id)
            
            
            return jsonify([new_expense])
        except Exception as e:
            return jsonify({"error": str(e)}), 400
            
    # GET
    try:
        expenses_cursor = db.expenses.find({"user_id": current_user.id}).sort("date", -1)
        expenses_list = list(expenses_cursor)
        
        for item in expenses_list:
            item['_id'] = str(item['_id'])
            item['amount'] = float(item.get('amount', 0))
            
        return jsonify(expenses_list)
    except Exception as e:
        return jsonify({"error": str(e)}), 400

if __name__ == '__main__':
    app.run(debug=True)
