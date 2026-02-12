from flask import Flask, render_template, request, jsonify, redirect, url_for, flash, session
import os
from dotenv import load_dotenv
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from pymongo import MongoClient
from bson.objectid import ObjectId
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta
import re

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "dev_key_mongo")
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=6)

client = MongoClient(os.getenv("MONGO_URI", "mongodb://localhost:27017/finscope"))
db = client.get_database()

login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

class User(UserMixin):
    def __init__(self, user_doc):
        self.id = str(user_doc['_id'])
        self.username = user_doc['username']
        self.password_hash = user_doc['password_hash']

@login_manager.user_loader
def load_user(user_id):
    try:
        user_data = db.users.find_one({"_id": ObjectId(user_id)})
        if user_data: return User(user_data)
    except: pass
    return None

def serialize_doc(doc):
    if not doc: return None
    doc['_id'] = str(doc['_id'])
    if 'user_id' in doc: doc['user_id'] = str(doc['user_id'])
    if 'card_id' in doc and doc['card_id']: doc['card_id'] = str(doc['card_id'])
    return doc

# --- Rotas Auth ---
@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        user_data = db.users.find_one({"username": username})
        if user_data and check_password_hash(user_data['password_hash'], password):
            user = User(user_data)
            session.permanent = True
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
        if db.users.find_one({"username": username}):
            flash('Nome de usuário já existe.')
        else:
            hashed_password = generate_password_hash(password)
            db.users.insert_one({"username": username, "password_hash": hashed_password, "created_at": datetime.utcnow()})
            flash('Conta criada! Faça login.')
            return redirect(url_for('login'))
    return render_template('register.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))

# --- Pages ---
@app.route('/')
@login_required
def index():
    return render_template('index.html', username=current_user.username)

@app.route('/cards')
@login_required
def cards_page():
    return render_template('cards.html')

@app.route('/investments')
@login_required
def investments_page():
    return render_template('investments.html')

# --- API ---

# Configurações
@app.route('/api/settings', methods=['GET', 'POST'])
@login_required
def settings():
    if request.method == 'POST':
        data = request.json
        update_data = {}
        if 'categories' in data: update_data['categories'] = data['categories']
        if 'buyers' in data: update_data['buyers'] = data['buyers']
        
        db.user_settings.update_one(
            {"user_id": ObjectId(current_user.id)},
            {"$set": update_data},
            upsert=True
        )
        return jsonify({"status": "success"})

    settings = db.user_settings.find_one({"user_id": ObjectId(current_user.id)})
    if not settings:
        return jsonify({
            "categories": ["Alimentação", "Moradia", "Transporte", "Lazer", "Saúde", "Outros"],
            "buyers": ["Eu"]
        })
    return jsonify(serialize_doc(settings))

# Cartões e Fatura
@app.route('/api/cards', methods=['GET', 'POST'])
@login_required
def cards():
    if request.method == 'POST':
        data = request.json
        new_card = {
            "user_id": ObjectId(current_user.id),
            "name": data['name'],
            "holder_name": data.get('holder_name'),
            "limit_amount": float(data.get('limit_amount', 0)),
            "closing_day": int(data.get('closing_day')) if data.get('closing_day') else None,
            "due_day": int(data.get('due_day')) if data.get('due_day') else None,
            "created_at": datetime.utcnow()
        }
        result = db.credit_cards.insert_one(new_card)
        new_card['_id'] = result.inserted_id
        return jsonify(serialize_doc(new_card))
    
    cards = list(db.credit_cards.find({"user_id": ObjectId(current_user.id)}))
    return jsonify([serialize_doc(c) for c in cards])

@app.route('/api/cards/<card_id>/invoice', methods=['GET'])
@login_required
def card_invoice(card_id):
    ref_month_str = request.args.get('month') 
    if not ref_month_str: return jsonify({"error": "Month required"}), 400

    card = db.credit_cards.find_one({"_id": ObjectId(card_id), "user_id": ObjectId(current_user.id)})
    if not card: return jsonify({"error": "Card not found"}), 404

    closing_day = card.get('closing_day', 1)
    ref_date = datetime.strptime(ref_month_str, '%Y-%m')
    
    end_date = ref_date.replace(day=closing_day)
    start_date = (end_date - relativedelta(months=1)) + timedelta(days=1)
    
    start_str = start_date.strftime('%Y-%m-%d')
    end_str = end_date.strftime('%Y-%m-%d')
    
    query = {
        "user_id": ObjectId(current_user.id),
        "card_id": ObjectId(card_id),
        "date": {"$gte": start_str, "$lte": end_str}
    }
    
    expenses = list(db.expenses.find(query).sort("date", -1))
    
    buyers_summary = {}
    total_amount = 0
    
    for exp in expenses:
        amount = float(exp['amount'])
        buyer = exp.get('buyer', 'Outros') or 'Outros'
        total_amount += amount
        buyers_summary[buyer] = buyers_summary.get(buyer, 0) + amount
        
    return jsonify({
        "card": serialize_doc(card),
        "period": {"start": start_str, "end": end_str},
        "total": total_amount,
        "buyers_summary": buyers_summary,
        "expenses": [serialize_doc(e) for e in expenses]
    })

# Rendas
@app.route('/api/incomes', methods=['GET', 'POST'])
@login_required
def incomes():
    if request.method == 'POST':
        data = request.json
        new_income = {
            "user_id": ObjectId(current_user.id),
            "description": data['description'],
            "amount": float(data['amount']),
            "date": data['date'],
            "created_at": datetime.utcnow()
        }
        result = db.incomes.insert_one(new_income)
        new_income['_id'] = result.inserted_id
        return jsonify([serialize_doc(new_income)])
    
    incomes = list(db.incomes.find({"user_id": ObjectId(current_user.id)}).sort("date", -1))
    return jsonify([serialize_doc(i) for i in incomes])

# Gastos
@app.route('/api/expenses', methods=['GET', 'POST'])
@app.route('/api/expenses/<expense_id>', methods=['PUT', 'DELETE'])
@login_required
def expenses(expense_id=None):
    if request.method == 'DELETE':
        db.expenses.delete_one({"_id": ObjectId(expense_id), "user_id": ObjectId(current_user.id)})
        return jsonify({"status": "deleted"})

    if request.method == 'PUT':
        data = request.json
        card_id = data.get('card_id')
        if card_id == "": card_id = None
        
        update_data = {
            "description": data['description'],
            "amount": float(data['amount']),
            "category": data.get('category', 'Geral'),
            "date": data['date'],
            "establishment": data.get('establishment'),
            "buyer": data.get('buyer'),
            "payment_method": data.get('payment_method'),
            "card_id": ObjectId(card_id) if card_id else None,
            "installments": data.get('installments'),
            "observation": data.get('observation')
        }
        db.expenses.update_one({"_id": ObjectId(expense_id), "user_id": ObjectId(current_user.id)}, {"$set": update_data})
        return jsonify({"status": "updated"})

    if request.method == 'POST':
        data = request.json
        card_id = data.get('card_id')
        if card_id == "": card_id = None
        
        new_expense = {
            "user_id": ObjectId(current_user.id),
            "description": data['description'],
            "amount": float(data['amount']),
            "category": data.get('category', 'Geral'),
            "date": data['date'],
            "establishment": data.get('establishment'),
            "buyer": data.get('buyer'),
            "payment_method": data.get('payment_method'),
            "card_id": ObjectId(card_id) if card_id else None,
            "installments": data.get('installments'),
            "observation": data.get('observation'),
            "created_at": datetime.utcnow()
        }
        result = db.expenses.insert_one(new_expense)
        new_expense['_id'] = result.inserted_id
        return jsonify([serialize_doc(new_expense)])
            
    query = {"user_id": ObjectId(current_user.id)}
    search_term = request.args.get('search')
    if search_term:
        regex = re.compile(search_term, re.IGNORECASE)
        query["$or"] = [{"description": regex}, {"establishment": regex}, {"category": regex}, {"buyer": regex}]
    
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    if start_date or end_date:
        date_query = {}
        if start_date: date_query["$gte"] = start_date
        if end_date: date_query["$lte"] = end_date
        query["date"] = date_query

    expenses = list(db.expenses.find(query).sort("date", -1))
    for expense in expenses:
        if expense.get('card_id'):
            card = db.credit_cards.find_one({"_id": expense['card_id']})
            if card: expense['card_name'] = card['name']
                
    return jsonify([serialize_doc(e) for e in expenses])

# --- NOVAS ROTAS: Investimentos e Metas ---

@app.route('/api/investments', methods=['GET', 'POST'])
@app.route('/api/investments/<inv_id>', methods=['PUT', 'DELETE'])
@login_required
def investments(inv_id=None):
    if request.method == 'DELETE':
        db.investments.delete_one({"_id": ObjectId(inv_id), "user_id": ObjectId(current_user.id)})
        return jsonify({"status": "deleted"})
        
    if request.method == 'PUT':
        data = request.json
        db.investments.update_one(
            {"_id": ObjectId(inv_id), "user_id": ObjectId(current_user.id)},
            {"$set": {
                "name": data['name'],
                "type": data['type'],
                "amount": float(data['amount']),
                "updated_at": datetime.utcnow()
            }}
        )
        return jsonify({"status": "updated"})

    if request.method == 'POST':
        data = request.json
        new_inv = {
            "user_id": ObjectId(current_user.id),
            "name": data['name'],
            "type": data['type'],
            "amount": float(data['amount']),
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        res = db.investments.insert_one(new_inv)
        new_inv['_id'] = res.inserted_id
        return jsonify(serialize_doc(new_inv))

    # GET
    invs = list(db.investments.find({"user_id": ObjectId(current_user.id)}))
    return jsonify([serialize_doc(i) for i in invs])

@app.route('/api/goals', methods=['GET', 'POST'])
@app.route('/api/goals/<goal_id>', methods=['PUT', 'DELETE'])
@login_required
def goals(goal_id=None):
    if request.method == 'DELETE':
        db.goals.delete_one({"_id": ObjectId(goal_id), "user_id": ObjectId(current_user.id)})
        return jsonify({"status": "deleted"})

    if request.method == 'PUT':
        data = request.json
        db.goals.update_one(
            {"_id": ObjectId(goal_id), "user_id": ObjectId(current_user.id)},
            {"$set": {
                "title": data['title'],
                "target_amount": float(data['target_amount']),
                "current_amount": float(data['current_amount']),
                "deadline": data['deadline']
            }}
        )
        return jsonify({"status": "updated"})

    if request.method == 'POST':
        data = request.json
        new_goal = {
            "user_id": ObjectId(current_user.id),
            "title": data['title'],
            "target_amount": float(data['target_amount']),
            "current_amount": float(data.get('current_amount', 0)),
            "deadline": data['deadline'],
            "created_at": datetime.utcnow()
        }
        res = db.goals.insert_one(new_goal)
        new_goal['_id'] = res.inserted_id
        return jsonify(serialize_doc(new_goal))

    # GET
    goals = list(db.goals.find({"user_id": ObjectId(current_user.id)}))
    return jsonify([serialize_doc(g) for g in goals])

if __name__ == "__main__":
    app.run(debug=True)
