from flask import Blueprint, render_template
from flask_login import login_required, current_user

pages_bp = Blueprint("pages", __name__)


@pages_bp.route("/")
@login_required
def index():
    return render_template("index.html", username=current_user.username)


@pages_bp.route("/detailed")
@login_required
def detailed_page():
    return render_template("detailed_expenses.html")


@pages_bp.route("/cards")
@login_required
def cards_page():
    return render_template("cards.html")


@pages_bp.route("/investments")
@login_required
def investments_page():
    return render_template("investments.html")


@pages_bp.route("/goals")
@login_required
def goals_page():
    return render_template("goals.html")


@pages_bp.route("/wallet")
@login_required
def wallet_page():
    return render_template("wallet.html")
