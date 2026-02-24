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
    except Exception as e:
        print(f"Error loading user {user_id}: {e}")
    return None

def serialize_doc(doc, source=None):
    if not doc: return None
    doc['_id'] = str(doc['_id'])
    if 'user_id' in doc: doc['user_id'] = str(doc['user_id'])
    if 'card_id' in doc and doc['card_id']: doc['card_id'] = str(doc['card_id'])
    if 'investment_id' in doc: doc['investment_id'] = str(doc['investment_id'])
    if source: doc['source'] = source
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

@app.route('/wallet')
@login_required
def wallet_page():
    return render_template('wallet.html')

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
    years_macro = list(db.macro_expenses.aggregate(pipeline))
    
    all_years = set()
    for y in years_inc: all_years.add(y['_id'])
    for y in years_exp: all_years.add(y['_id'])
    for y in years_macro: all_years.add(y['_id'])
    
    current_year = str(datetime.now().year)
    all_years.add(current_year)
    return jsonify(sorted(list(all_years), reverse=True))

@app.route('/api/balance', methods=['GET'])
@login_required
def get_total_balance():
    pipeline = [
        {"$match": {"user_id": ObjectId(current_user.id)}},
        {"$group": {"_id": None, "total": {"$sum": "$balance"}}}
    ]
    res = list(db.wallets.aggregate(pipeline))
    total_balance = res[0]['total'] if res else 0
    return jsonify({"balance": total_balance})

@app.route('/api/transactions', methods=['GET'])
@login_required
def get_transactions():
    page = int(request.args.get('page', 1))
    items_per_page = int(request.args.get('limit', 30))
    
    user_id = ObjectId(current_user.id)

    # Usando Aggregation Framework para unir e paginar
    pipeline = [
        # Unir as coleções
        {"$unionWith": {"coll": "expenses", "pipeline": [{"$addFields": {"type": "expense", "source": "micro"}}]}},
        {"$unionWith": {"coll": "macro_expenses", "pipeline": [{"$addFields": {"type": "expense", "source": "macro"}}]}},
        
        # Filtrar pelo usuário atual
        {"$match": {"user_id": user_id}},
        
        # Ordenar por data (mais recente primeiro)
        {"$sort": {"date": -1}},
        
        # Faceta para contar o total e paginar
        {"$facet": {
            "metadata": [{"$count": "total"}],
            "data": [{"$skip": (page - 1) * items_per_page}, {"$limit": items_per_page}]
        }}
    ]

    # A coleção inicial da pipeline pode ser qualquer uma, aqui usamos 'incomes'
    incomes_pipeline_base = [{"$addFields": {"type": "income", "source": "income"}}]
    result = list(db.incomes.aggregate(incomes_pipeline_base + pipeline))

    total_items = result[0]['metadata'][0]['total'] if result and result[0]['metadata'] else 0
    transactions = result[0]['data'] if result and result[0]['data'] else []

    # Serializar os documentos
    serialized_transactions = [serialize_doc(t) for t in transactions]

    return jsonify({
        "items": serialized_transactions,
        "total_items": total_items,
        "current_page": page,
        "total_pages": (total_items + items_per_page - 1) // items_per_page
    })

@app.route('/api/dashboard', methods=['GET'])
@login_required
def get_dashboard_data():
    # 1. Obter filtros da query string
    period = request.args.get('period', 'all')
    year = request.args.get('year', str(datetime.now().year))
    granularity = request.args.get('granularity', 'month') # 'day', 'month', 'year'

    # 2. Montar filtro de data
    date_filter = {}
    if period != 'all':
        end_date = datetime.now()
        if period == '30':
            start_date = end_date - timedelta(days=30)
        elif period == '180':
            start_date = end_date - relativedelta(months=6)
        elif period == 'year':
            start_date = datetime(int(year), 1, 1)
            end_date = datetime(int(year), 12, 31)
        
        date_filter = {"date": {"$gte": start_date.strftime('%Y-%m-%d'), "$lte": end_date.strftime('%Y-%m-%d')}}

    # 3. Calcular totais para o Summary
    user_id_filter = {"user_id": ObjectId(current_user.id)}
    
    total_income = sum(d['amount'] for d in db.incomes.find({**user_id_filter, **date_filter}))
    total_expense_micro = sum(d['amount'] for d in db.expenses.find({**user_id_filter, **date_filter}))
    total_expense_macro = sum(d['amount'] for d in db.macro_expenses.find({**user_id_filter, **date_filter}))
    total_expense = total_expense_micro + total_expense_macro

    balance_res = list(db.wallets.aggregate([{"$match": user_id_filter}, {"$group": {"_id": None, "total": {"$sum": "$balance"}}}]))
    balance = balance_res[0]['total'] if balance_res else 0

    invested_res = list(db.investments.aggregate([{"$match": user_id_filter}, {"$group": {"_id": None, "total": {"$sum": "$current_amount"}}}]))
    total_invested = invested_res[0]['total'] if invested_res else 0

    summary = {
        "total_income": total_income,
        "total_expense": total_expense,
        "balance": balance,
        "total_invested": total_invested,
        "net_worth": balance + total_invested
    }

    # 4. Preparar dados para o Gráfico (agregação no MongoDB)
    if granularity == 'day':
        group_id = {"$dateToString": {"format": "%Y-%m-%d", "date": {"$toDate": "$date"}}}
        sort_field = "_id"
    elif granularity == 'year':
        group_id = {"$substr": ["$date", 0, 4]}
        sort_field = "_id"
    else: # month
        group_id = {"$substr": ["$date", 0, 7]}
        sort_field = "_id"

    def aggregate_by_granularity(collection, amount_field='amount', extra_filter=None):
        match_filter = {**user_id_filter, **date_filter}
        if extra_filter:
            match_filter.update(extra_filter)
            
        pipeline = [
            {"$match": match_filter},
            {"$group": {"_id": group_id, "total": {"$sum": f"${amount_field}"}}},
            {"$sort": {sort_field: 1}}
        ]
        return {item['_id']: item['total'] for item in collection.aggregate(pipeline)}

    income_data = aggregate_by_granularity(db.incomes)
    expense_micro_data = aggregate_by_granularity(db.expenses)
    expense_macro_data = aggregate_by_granularity(db.macro_expenses)
    investment_data = aggregate_by_granularity(db.investment_entries, extra_filter={"type": "contribution"})

    # Unificar chaves de data e montar o dataMap
    all_keys = sorted(list(set(income_data.keys()) | set(expense_micro_data.keys()) | set(expense_macro_data.keys()) | set(investment_data.keys())))
    
    labels = []
    income_values = []
    expense_values = []
    investment_values = []

    for key in all_keys:
        if granularity == 'day':
            labels.append(datetime.strptime(key, '%Y-%m-%d').strftime('%d/%m'))
        elif granularity == 'month':
            labels.append(datetime.strptime(key, '%Y-%m').strftime('%m/%Y'))
        else:
            labels.append(key)
        
        income_values.append(income_data.get(key, 0))
        total_exp = expense_micro_data.get(key, 0) + expense_macro_data.get(key, 0)
        expense_values.append(total_exp)
        investment_values.append(investment_data.get(key, 0))

    chart_data = {
        "labels": labels,
        "datasets": [
            {"label": "Rendas", "data": income_values, "borderColor": "#2ecc71", "backgroundColor": "rgba(46, 204, 113, 0.1)", "tension": 0.4, "fill": True},
            {"label": "Saídas", "data": expense_values, "borderColor": "#e74c3c", "backgroundColor": "rgba(231, 76, 60, 0.1)", "tension": 0.4, "fill": True},
            {"label": "Investido", "data": investment_values, "borderColor": "#3498db", "backgroundColor": "rgba(52, 152, 219, 0.1)", "tension": 0.4, "fill": True}
        ]
    }

    return jsonify({
        "summary": summary,
        "chart_data": chart_data
    })

# --- CARTEIRA (WALLETS) ---
@app.route('/api/wallets', methods=['GET', 'POST'])
@app.route('/api/wallets/<wallet_id>', methods=['PUT', 'DELETE'])
@login_required
def wallets(wallet_id=None):
    if request.method == 'DELETE':
        db.wallets.delete_one({"_id": ObjectId(wallet_id), "user_id": ObjectId(current_user.id)})
        return jsonify({"status": "deleted"})

    if request.method == 'PUT':
        data = request.json
        db.wallets.update_one(
            {"_id": ObjectId(wallet_id), "user_id": ObjectId(current_user.id)},
            {"$set": {
                "name": data['name'],
                "balance": float(data['balance']),
                "updated_at": datetime.utcnow()
            }}
        )
        return jsonify({"status": "updated"})

    if request.method == 'POST':
        data = request.json
        new_wallet = {
            "user_id": ObjectId(current_user.id),
            "name": data['name'],
            "balance": float(data['balance']),
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        res = db.wallets.insert_one(new_wallet)
        new_wallet['_id'] = res.inserted_id
        return jsonify(serialize_doc(new_wallet))

    # GET
    wallets = list(db.wallets.find({"user_id": ObjectId(current_user.id)}))
    return jsonify([serialize_doc(w) for w in wallets])

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
        "expenses": [serialize_doc(e, 'micro') for e in expenses]
    })

# --- Rendas (ATUALIZADO COM DELETE/PUT) ---
@app.route('/api/incomes', methods=['GET', 'POST'])
@app.route('/api/incomes/<income_id>', methods=['PUT', 'DELETE'])
@login_required
def incomes(income_id=None):
    if request.method == 'DELETE':
        db.incomes.delete_one({"_id": ObjectId(income_id), "user_id": ObjectId(current_user.id)})
        return jsonify({"status": "deleted"})

    if request.method == 'PUT':
        data = request.json
        update_data = {
            "description": data['description'],
            "amount": float(data['amount']),
            "date": data['date']
        }
        db.incomes.update_one({"_id": ObjectId(income_id), "user_id": ObjectId(current_user.id)}, {"$set": update_data})
        return jsonify({"status": "updated"})

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

# --- GASTOS MACRO ---
@app.route('/api/macro-expenses', methods=['GET', 'POST'])
@app.route('/api/macro-expenses/<expense_id>', methods=['PUT', 'DELETE'])
@login_required
def macro_expenses(expense_id=None):
    if request.method == 'DELETE':
        db.macro_expenses.delete_one({"_id": ObjectId(expense_id), "user_id": ObjectId(current_user.id)})
        return jsonify({"status": "deleted"})

    if request.method == 'PUT':
        data = request.json
        card_id = data.get('card_id')
        update_data = {
            "description": data['description'],
            "amount": float(data['amount']),
            "category": data.get('category', 'Geral'),
            "date": data['date'],
            "payment_method": data.get('payment_method', 'debito'),
            "card_id": ObjectId(card_id) if card_id else None
        }
        db.macro_expenses.update_one({"_id": ObjectId(expense_id), "user_id": ObjectId(current_user.id)}, {"$set": update_data})
        return jsonify({"status": "updated"})

    if request.method == 'POST':
        data = request.json
        card_id = data.get('card_id')
        new_expense = {
            "user_id": ObjectId(current_user.id),
            "description": data['description'],
            "amount": float(data['amount']),
            "category": data.get('category', 'Geral'),
            "date": data['date'],
            "payment_method": data.get('payment_method', 'debito'),
            "card_id": ObjectId(card_id) if card_id else None,
            "is_consolidated": True,
            "created_at": datetime.utcnow()
        }
        res = db.macro_expenses.insert_one(new_expense)
        new_expense['_id'] = res.inserted_id
        return jsonify([serialize_doc(new_expense, 'macro')])

    # GET
    query = {"user_id": ObjectId(current_user.id)}
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    if start_date or end_date:
        query["date"] = {}
        if start_date: query["date"]["$gte"] = start_date
        if end_date: query["date"]["$lte"] = end_date

    expenses = list(db.macro_expenses.find(query).sort("date", -1))
    for expense in expenses:
        if expense.get('card_id'):
            card = db.credit_cards.find_one({"_id": expense['card_id']})
            if card: expense['card_name'] = card['name']
            
    return jsonify([serialize_doc(e, 'macro') for e in expenses])

# --- GASTOS MICRO ---
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
            "observation": data.get('observation')
        }
        db.expenses.update_one({"_id": ObjectId(expense_id), "user_id": ObjectId(current_user.id)}, {"$set": update_data})
        return jsonify({"status": "updated"})

    if request.method == 'POST':
        data = request.json
        installments_str = data.get('installments')
        base_date = datetime.strptime(data['date'], '%Y-%m-%d')
        
        match = re.match(r'(\d+)/(\d+)', str(installments_str))
        
        if match:
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
                "is_consolidated": False,
                "created_at": datetime.utcnow()
            }
            res = db.expenses.insert_one(new_expense)
            new_expense['_id'] = res.inserted_id
            return jsonify([serialize_doc(new_expense, 'micro')])
            
    # GET (Micro)
    query = {"user_id": ObjectId(current_user.id)}
    
    search_term = request.args.get('search')
    if search_term:
        regex = re.compile(search_term, re.IGNORECASE)
        query["$or"] = [{"description": regex}, {"establishment": regex}, {"category": regex}, {"buyer": regex}]
    
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    if start_date or end_date:
        query["date"] = {}
        if start_date: query["date"]["$gte"] = start_date
        if end_date: query["date"]["$lte"] = end_date

    expenses = list(db.expenses.find(query).sort("date", -1))
    for expense in expenses:
        if expense.get('card_id'):
            card = db.credit_cards.find_one({"_id": expense['card_id']})
            if card: expense['card_name'] = card['name']
            
    return jsonify([serialize_doc(e, 'micro') for e in expenses])

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
