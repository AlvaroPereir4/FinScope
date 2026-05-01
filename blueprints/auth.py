from datetime import datetime
from flask import Blueprint, render_template, request, redirect, url_for, flash, session
from flask_login import login_user, login_required, logout_user
from werkzeug.security import generate_password_hash, check_password_hash
from extensions import db
from models import User

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form.get("username")
        password = request.form.get("password")
        user_data = db.users.find_one({"username": username})
        if user_data and check_password_hash(user_data["password_hash"], password):
            session.permanent = True
            login_user(User(user_data))
            return redirect(url_for("pages.index"))
        flash("Usuário ou senha inválidos")
    return render_template("login.html")


@auth_bp.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        username = request.form.get("username")
        password = request.form.get("password")
        if db.users.find_one({"username": username}):
            flash("Nome de usuário já existe.")
        else:
            db.users.insert_one({
                "username": username,
                "password_hash": generate_password_hash(password),
                "created_at": datetime.utcnow(),
            })
            flash("Conta criada! Faça login.")
            return redirect(url_for("auth.login"))
    return render_template("register.html")


@auth_bp.route("/logout")
@login_required
def logout():
    logout_user()
    return redirect(url_for("auth.login"))
