import re
from datetime import datetime
from dateutil.relativedelta import relativedelta
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from bson.objectid import ObjectId
from extensions import db
from utils import serialize_doc, parse_object_id, api_error

expenses_bp = Blueprint("expenses", __name__)

# ── shared $lookup stage that enriches expenses with card_name ────────────────
_CARD_LOOKUP = {
    "$lookup": {
        "from": "credit_cards",
        "localField": "card_id",
        "foreignField": "_id",
        "as": "_card",
    }
}
_CARD_NAME_ADD = {
    "$addFields": {
        "card_name": {"$arrayElemAt": ["$_card.name", 0]},
    }
}
_CARD_UNSET = {"$unset": "_card"}


@expenses_bp.route("/api/macro-expenses", methods=["GET", "POST"])
@expenses_bp.route("/api/macro-expenses/<expense_id>", methods=["PUT", "DELETE"])
@login_required
def macro_expenses(expense_id=None):
    user_oid = ObjectId(current_user.id)

    if request.method == "DELETE":
        try:
            eid = parse_object_id(expense_id)
        except ValueError:
            return api_error("Invalid expense id")
        db.macro_expenses.delete_one({"_id": eid, "user_id": user_oid})
        return jsonify({"status": "deleted"})

    if request.method == "PUT":
        try:
            eid = parse_object_id(expense_id)
        except ValueError:
            return api_error("Invalid expense id")
        data = request.json
        card_id = data.get("card_id")
        db.macro_expenses.update_one(
            {"_id": eid, "user_id": user_oid},
            {"$set": {
                "description": data["description"],
                "amount": float(data["amount"]),
                "category": data.get("category", "General"),
                "date": data["date"],
                "payment_method": data.get("payment_method", "debit"),
                "card_id": ObjectId(card_id) if card_id else None,
            }},
        )
        return jsonify({"status": "updated"})

    if request.method == "POST":
        data = request.json
        card_id = data.get("card_id")
        new_expense = {
            "user_id": user_oid,
            "description": data["description"],
            "amount": float(data["amount"]),
            "category": data.get("category", "General"),
            "date": data["date"],
            "payment_method": data.get("payment_method", "debit"),
            "card_id": ObjectId(card_id) if card_id else None,
            "is_consolidated": True,
            "created_at": datetime.utcnow(),
        }
        res = db.macro_expenses.insert_one(new_expense)
        new_expense["_id"] = res.inserted_id
        return jsonify([serialize_doc(new_expense, "macro")])

    # GET — use $lookup instead of N+1 queries
    match = {"user_id": user_oid}
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")
    if start_date or end_date:
        match["date"] = {}
        if start_date:
            match["date"]["$gte"] = start_date
        if end_date:
            match["date"]["$lte"] = end_date

    pipeline = [
        {"$match": match},
        {"$sort": {"date": -1}},
        _CARD_LOOKUP,
        _CARD_NAME_ADD,
        _CARD_UNSET,
    ]
    items = list(db.macro_expenses.aggregate(pipeline))
    return jsonify([serialize_doc(e, "macro") for e in items])


@expenses_bp.route("/api/expenses", methods=["GET", "POST"])
@expenses_bp.route("/api/expenses/<expense_id>", methods=["PUT", "DELETE"])
@login_required
def expenses(expense_id=None):
    user_oid = ObjectId(current_user.id)

    if request.method == "DELETE":
        try:
            eid = parse_object_id(expense_id)
        except ValueError:
            return api_error("Invalid expense id")
        db.expenses.delete_one({"_id": eid, "user_id": user_oid})
        return jsonify({"status": "deleted"})

    if request.method == "PUT":
        try:
            eid = parse_object_id(expense_id)
        except ValueError:
            return api_error("Invalid expense id")
        data = request.json
        card_id = data.get("card_id")
        db.expenses.update_one(
            {"_id": eid, "user_id": user_oid},
            {"$set": {
                "description": data["description"],
                "amount": float(data["amount"]),
                "category": data.get("category", "General"),
                "date": data["date"],
                "establishment": data.get("establishment"),
                "buyer": data.get("buyer"),
                "payment_method": data.get("payment_method"),
                "card_id": ObjectId(card_id) if card_id else None,
                "installments": data.get("installments"),
                "observation": data.get("observation"),
            }},
        )
        return jsonify({"status": "updated"})

    if request.method == "POST":
        return _create_expense(request.json, user_oid)

    # GET — use $lookup instead of N+1 queries
    match = {"user_id": user_oid}
    search_term = request.args.get("search")
    if search_term:
        regex = re.compile(search_term, re.IGNORECASE)
        match["$or"] = [
            {"description": regex},
            {"establishment": regex},
            {"category": regex},
            {"buyer": regex},
        ]
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")
    if start_date or end_date:
        match["date"] = {}
        if start_date:
            match["date"]["$gte"] = start_date
        if end_date:
            match["date"]["$lte"] = end_date

    pipeline = [
        {"$match": match},
        {"$sort": {"date": -1}},
        _CARD_LOOKUP,
        _CARD_NAME_ADD,
        _CARD_UNSET,
    ]
    items = list(db.expenses.aggregate(pipeline))
    return jsonify([serialize_doc(e, "micro") for e in items])


def _create_expense(data, user_oid):
    installments_str = data.get("installments")
    base_date = datetime.strptime(data["date"], "%Y-%m-%d")
    match = re.match(r"(\d+)/(\d+)", str(installments_str))

    if match:
        current_inst = int(match.group(1))
        total_inst = int(match.group(2))
        for i in range(1, total_inst + 1):
            inst_date = base_date + relativedelta(months=i - current_inst)
            inst_label = f"{i}/{total_inst}"
            exists = db.expenses.find_one({
                "user_id": user_oid,
                "description": data["description"],
                "amount": float(data["amount"]),
                "installments": inst_label,
            })
            if not exists:
                obs = data.get("observation", "")
                if i != current_inst:
                    obs = f"[Gerado Auto] {obs}".strip()
                db.expenses.insert_one({
                    "user_id": user_oid,
                    "description": data["description"],
                    "amount": float(data["amount"]),
                    "category": data.get("category", "General"),
                    "date": inst_date.strftime("%Y-%m-%d"),
                    "establishment": data.get("establishment"),
                    "buyer": data.get("buyer"),
                    "payment_method": data.get("payment_method"),
                    "card_id": ObjectId(data["card_id"]) if data.get("card_id") else None,
                    "installments": inst_label,
                    "observation": obs,
                    "is_consolidated": False,
                    "created_at": datetime.utcnow(),
                })
        return jsonify({"status": "success", "message": "Parcelas geradas"})

    new_expense = {
        "user_id": user_oid,
        "description": data["description"],
        "amount": float(data["amount"]),
        "category": data.get("category", "General"),
        "date": data["date"],
        "establishment": data.get("establishment"),
        "buyer": data.get("buyer"),
        "payment_method": data.get("payment_method"),
        "card_id": ObjectId(data["card_id"]) if data.get("card_id") else None,
        "installments": data.get("installments"),
        "observation": data.get("observation"),
        "is_consolidated": False,
        "created_at": datetime.utcnow(),
    }
    res = db.expenses.insert_one(new_expense)
    new_expense["_id"] = res.inserted_id
    return jsonify([serialize_doc(new_expense, "micro")])
