import os
from datetime import timedelta
from flask import Flask
from extensions import db, login_manager
import models  # registers @login_manager.user_loader

from blueprints.auth import auth_bp
from blueprints.pages import pages_bp
from blueprints.api.settings import settings_bp
from blueprints.api.dashboard import dashboard_bp
from blueprints.api.wallets import wallets_bp
from blueprints.api.cards import cards_bp
from blueprints.api.incomes import incomes_bp
from blueprints.api.expenses import expenses_bp
from blueprints.api.investments import investments_bp
from blueprints.api.goals import goals_bp


def create_app():
    app = Flask(__name__)
    app.secret_key = os.getenv("SECRET_KEY", "dev_key_mongo")
    app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(hours=6)

    login_manager.init_app(app)

    app.register_blueprint(auth_bp)
    app.register_blueprint(pages_bp)
    app.register_blueprint(settings_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(wallets_bp)
    app.register_blueprint(cards_bp)
    app.register_blueprint(incomes_bp)
    app.register_blueprint(expenses_bp)
    app.register_blueprint(investments_bp)
    app.register_blueprint(goals_bp)

    _ensure_indexes()

    return app


def _ensure_indexes():
    db.expenses.create_index([("user_id", 1), ("date", -1)])
    db.macro_expenses.create_index([("user_id", 1), ("date", -1)])
    db.incomes.create_index([("user_id", 1), ("date", -1)])
    db.investments.create_index([("user_id", 1)])
    db.investment_entries.create_index([("user_id", 1), ("investment_id", 1)])
    db.goals.create_index([("user_id", 1)])
    db.wallets.create_index([("user_id", 1)])
    db.credit_cards.create_index([("user_id", 1)])


app = create_app()

if __name__ == "__main__":
    app.run(debug=True)
