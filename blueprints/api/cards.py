from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from bson.objectid import ObjectId
from extensions import db
from utils import serialize_doc, parse_object_id, api_error

cards_bp = Blueprint("cards", __name__)


@cards_bp.route("/api/cards", methods=["GET", "POST"])
@login_required
def cards():
    user_oid = ObjectId(current_user.id)

    if request.method == "POST":
        data = request.json
        new_card = {
            "user_id": user_oid,
            "name": data["name"],
            "holder_name": data.get("holder_name"),
            "limit_amount": float(data.get("limit_amount", 0)),
            "closing_day": int(data.get("closing_day")),
            "due_day": int(data.get("due_day")),
            "created_at": datetime.utcnow(),
        }
        res = db.credit_cards.insert_one(new_card)
        new_card["_id"] = res.inserted_id
        return jsonify(serialize_doc(new_card))

    items = list(db.credit_cards.find({"user_id": user_oid}))
    return jsonify([serialize_doc(c) for c in items])


@cards_bp.route("/api/cards/<card_id>/invoice", methods=["GET"])
@login_required
def card_invoice(card_id):
    user_oid = ObjectId(current_user.id)
    ref_month_str = request.args.get("month")
    if not ref_month_str:
        return api_error("Month required")

    try:
        cid = parse_object_id(card_id)
    except ValueError:
        return api_error("Invalid card id")

    card = db.credit_cards.find_one({"_id": cid, "user_id": user_oid})
    if not card:
        return api_error("Card not found", 404)

    closing_day = card.get("closing_day", 1)
    ref_date = datetime.strptime(ref_month_str, "%Y-%m")
    end_date = ref_date.replace(day=closing_day)
    start_date = (end_date - relativedelta(months=1)) + timedelta(days=1)

    query = {
        "user_id": user_oid,
        "card_id": cid,
        "date": {
            "$gte": start_date.strftime("%Y-%m-%d"),
            "$lte": end_date.strftime("%Y-%m-%d"),
        },
    }
    expenses = list(db.expenses.find(query).sort("date", -1))

    buyers_summary = {}
    total_amount = 0
    for exp in expenses:
        amount = float(exp["amount"])
        buyer = exp.get("buyer") or "Others"
        total_amount += amount
        buyers_summary[buyer] = buyers_summary.get(buyer, 0) + amount

    return jsonify({
        "card": serialize_doc(card),
        "period": {
            "start": start_date.strftime("%Y-%m-%d"),
            "end": end_date.strftime("%Y-%m-%d"),
        },
        "total": total_amount,
        "buyers_summary": buyers_summary,
        "expenses": [serialize_doc(e, "micro") for e in expenses],
    })
