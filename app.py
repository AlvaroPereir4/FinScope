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
    if 'investment_id' in doc: doc['investment_id'] = str(doc['investment_id'])
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

@app.route('/detailed')
@login_required
def detailed_page():
    return render_template('detailed_expenses.html')

@app.route('/cards')
@login_required
def cards_page():
    return render_template('cards.html')

@app.route('/investments')
@login_required
def investments_page():
    return render_template('investments.html')

@app.route('/goals')
@login_required
def goals_page():
    return render_template('goals.html')

# --- API ---

@app.route('/api/settings', methods=['GET', 'POST'])
@login_required
def settings():
    if request.method == 'POST':
        data = request.json
        update_data = {}
        if 'categories' in data: update_data['categories'] = data['categories']
        if 'buyers' in data: update_data['buyers'] = data['buyers']
        db.user_settings.update_one({"user_id": ObjectId(current_user.id)}, {"$set": update_data}, upsert=True)
        return jsonify({"status": "success"})

    settings = db.user_settings.find_one({"user_id": ObjectId(current_user.id)})
    if not settings:
        return jsonify({"categories": ["Alimentação", "Moradia", "Transporte"], "buyers": ["Eu"]})
    return jsonify(serialize_doc(settings))

# --- Helpers Dashboard ---

@app.route('/api/years', methods=['GET'])
@login_required
def get_years():
    pipeline = [
        {"$match": {"user_id": ObjectId(current_user.id)}},
        {"$project": {"year": {"$substr": ["$date", 0, 4]}}},
        {"$group": {"_id": "$year"}}
    ]
    years_inc = list(db.incomes.aggregate(pipeline))
    years_exp = list(db.expenses.aggregate(pipeline))
    all_years = set()
    for y in years_inc: all_years.add(y['_id'])
    for y in years_exp: all_years.add(y['_id'])
    current_year = str(datetime.now().year)
    all_years.add(current_year)
    return jsonify(sorted(list(all_years), reverse=True))

@app.route('/api/balance', methods=['GET'])
@login_required
def get_total_balance():
    # 1. Total Rendas
    pipeline_inc = [{"$match": {"user_id": ObjectId(current_user.id)}}, {"$group": {"_id": None, "total": {"$sum": "$amount"}}}]
    res_inc = list(db.incomes.aggregate(pipeline_inc))
    total_inc = res_inc[0]['total'] if res_inc else 0
    
    # 2. Total Gastos (Macro + Micro não crédito)
    pipeline_exp = [
        {"$match": {
            "user_id": ObjectId(current_user.id),
            "$or": [
                {"is_consolidated": True},
                {"payment_method": {"$ne": "credito"}}
            ]
        }},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]
    res_exp = list(db.expenses.aggregate(pipeline_exp))
    total_exp = res_exp[0]['total'] if res_exp else 0
    
    return jsonify({"balance": total_inc - total_exp})

# --- Cartões ---
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
            "closing_day": int(data.get('closing_day')),
            "due_day": int(data.get('due_day')),
            "created_at": datetime.utcnow()
        }
        res = db.credit_cards.insert_one(new_card)
        new_card['_id'] = res.inserted_id
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
    
    query = {
        "user_id": ObjectId(current_user.id),
        "card_id": ObjectId(card_id),
        "date": {"$gte": start_date.strftime('%Y-%m-%d'), "$lte": end_date.strftime('%Y-%m-%d')}
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
        "period": {"start": start_date.strftime('%Y-%m-%d'), "end": end_date.strftime('%Y-%m-%d')},
        "total": total_amount,
        "buyers_summary": buyers_summary,
        "expenses": [serialize_doc(e) for e in expenses]
    })

# --- Rendas e Gastos ---
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
        res = db.incomes.insert_one(new_income)
        new_income['_id'] = res.inserted_id
        return jsonify([serialize_doc(new_income)])
    
    query = {"user_id": ObjectId(current_user.id)}
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    if start_date or end_date:
        query["date"] = {}
        if start_date: query["date"]["$gte"] = start_date
        if end_date: query["date"]["$lte"] = end_date

    incomes = list(db.incomes.find(query).sort("date", -1))
    return jsonify([serialize_doc(i) for i in incomes])

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
            "observation": data.get('observation'),
            "is_consolidated": data.get('is_consolidated', False)
        }
        db.expenses.update_one({"_id": ObjectId(expense_id), "user_id": ObjectId(current_user.id)}, {"$set": update_data})
        return jsonify({"status": "updated"})

    if request.method == 'POST':
        data = request.json
        
        installments_str = data.get('installments')
        base_date = datetime.strptime(data['date'], '%Y-%m-%d')
        is_consolidated = data.get('is_consolidated', False)
        
        match = re.match(r'(\d+)/(\d+)', str(installments_str))
        
        if match and not is_consolidated:
            current_inst = int(match.group(1))
            total_inst = int(match.group(2))
            
            for i in range(1, total_inst + 1):
                month_offset = i - current_inst
                inst_date = base_date + relativedelta(months=month_offset)
                inst_date_str = inst_date.strftime('%Y-%m-%d')
                inst_label = f"{i}/{total_inst}"
                
                exists = db.expenses.find_one({
                    "user_id": ObjectId(current_user.id),
                    "description": data['description'],
                    "amount": float(data['amount']),
                    "installments": inst_label
                })
                
                if not exists:
                    obs = data.get('observation', '')
                    if i != current_inst: obs = f"[Gerado Auto] {obs}".strip()
                    
                    new_expense = {
                        "user_id": ObjectId(current_user.id),
                        "description": data['description'],
                        "amount": float(data['amount']),
                        "category": data.get('category', 'Geral'),
                        "date": inst_date_str,
                        "establishment": data.get('establishment'),
                        "buyer": data.get('buyer'),
                        "payment_method": data.get('payment_method'),
                        "card_id": ObjectId(data.get('card_id')) if data.get('card_id') else None,
                        "installments": inst_label,
                        "observation": obs,
                        "is_consolidated": False,
                        "created_at": datetime.utcnow()
                    }
                    db.expenses.insert_one(new_expense)
            return jsonify({"status": "success", "message": "Parcelas geradas"})
        
        else:
            new_expense = {
                "user_id": ObjectId(current_user.id),
                "description": data['description'],
                "amount": float(data['amount']),
                "category": data.get('category', 'Geral'),
                "date": data['date'],
                "establishment": data.get('establishment'),
                "buyer": data.get('buyer'),
                "payment_method": data.get('payment_method'),
                "card_id": ObjectId(data.get('card_id')) if data.get('card_id') else None,
                "installments": data.get('installments'),
                "observation": data.get('observation'),
                "is_consolidated": is_consolidated,
                "created_at": datetime.utcnow()
            }
            res = db.expenses.insert_one(new_expense)
            new_expense['_id'] = res.inserted_id
            return jsonify([serialize_doc(new_expense)])
            
    # --- GET (CORRIGIDO) ---
    # Usando $and para evitar sobrescrita de condições
    match_conditions = [{"user_id": ObjectId(current_user.id)}]
    
    # 1. Filtro de Tipo (View Type)
    view_type = request.args.get('view_type')
    if view_type == 'consolidated':
        match_conditions.append({
            "$or": [
                {"is_consolidated": True},
                {"payment_method": {"$ne": "credito"}}
            ]
        })
    # Se view_type não for consolidated, traz tudo (Micro view)

    # 2. Filtro de Busca
    search_term = request.args.get('search')
    if search_term:
        regex = re.compile(search_term, re.IGNORECASE)
        match_conditions.append({
            "$or": [
                {"description": regex},
                {"establishment": regex},
                {"category": regex},
                {"buyer": regex}
            ]
        })
    
    # 3. Filtro de Data
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    if start_date or end_date:
        date_query = {}
        if start_date: date_query["$gte"] = start_date
        if end_date: date_query["$lte"] = end_date
        match_conditions.append({"date": date_query})

    # Monta a query final
    query = {"$and": match_conditions}

    expenses = list(db.expenses.find(query).sort("date", -1))
    
    for expense in expenses:
        if expense.get('card_id'):
            card = db.credit_cards.find_one({"_id": expense['card_id']})
            if card: expense['card_name'] = card['name']
            
    return jsonify([serialize_doc(e) for e in expenses])

# --- INVESTIMENTOS ---
@app.route('/api/investments', methods=['GET', 'POST'])
@app.route('/api/investments/<inv_id>', methods=['PUT', 'DELETE'])
@login_required
def investments(inv_id=None):
    if request.method == 'DELETE':
        db.investments.delete_one({"_id": ObjectId(inv_id), "user_id": ObjectId(current_user.id)})
        db.investment_entries.delete_many({"investment_id": ObjectId(inv_id)})
        return jsonify({"status": "deleted"})
        
    if request.method == 'PUT':
        data = request.json
        db.investments.update_one(
            {"_id": ObjectId(inv_id), "user_id": ObjectId(current_user.id)},
            {"$set": {
                "name": data['name'],
                "type": data['type'],
                "target_amount": float(data.get('target_amount', 0)),
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
            "current_amount": float(data.get('current_amount', 0)),
            "target_amount": float(data.get('target_amount', 0)),
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        res = db.investments.insert_one(new_inv)
        new_inv['_id'] = res.inserted_id
        return jsonify(serialize_doc(new_inv))

    invs = list(db.investments.find({"user_id": ObjectId(current_user.id)}))
    return jsonify([serialize_doc(i) for i in invs])

@app.route('/api/investments/history', methods=['GET'])
@login_required
def investments_history():
    entries = list(db.investment_entries.find({"user_id": ObjectId(current_user.id)}).sort("date", 1))
    return jsonify([serialize_doc(e) for e in entries])

@app.route('/api/investments/<inv_id>/entries', methods=['GET', 'POST'])
@login_required
def investment_entries(inv_id):
    if request.method == 'POST':
        data = request.json
        amount = float(data['amount'])
        entry_type = data['type'] 
        new_entry = {
            "user_id": ObjectId(current_user.id),
            "investment_id": ObjectId(inv_id),
            "type": entry_type,
            "amount": amount,
            "date": data['date'],
            "created_at": datetime.utcnow()
        }
        db.investment_entries.insert_one(new_entry)
        inv = db.investments.find_one({"_id": ObjectId(inv_id)})
        current_val = float(inv.get('current_amount', 0))
        if entry_type == 'withdrawal': new_val = current_val - amount
        else: new_val = current_val + amount
        db.investments.update_one({"_id": ObjectId(inv_id)}, {"$set": {"current_amount": new_val, "updated_at": datetime.utcnow()}})
        return jsonify({"status": "success", "new_balance": new_val})
    entries = list(db.investment_entries.find({"investment_id": ObjectId(inv_id)}).sort("date", -1))
    return jsonify([serialize_doc(e) for e in entries])

# --- METAS ---
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
                "type": data.get('type', 'spending'),
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
            "type": data.get('type', 'spending'),
            "target_amount": float(data['target_amount']),
            "current_amount": float(data.get('current_amount', 0)),
            "deadline": data['deadline'],
            "created_at": datetime.utcnow()
        }
        res = db.goals.insert_one(new_goal)
        new_goal['_id'] = res.inserted_id
        return jsonify(serialize_doc(new_goal))

    goals = list(db.goals.find({"user_id": ObjectId(current_user.id)}))
    return jsonify([serialize_doc(g) for g in goals])

if __name__ == "__main__":
    app.run(debug=True)
