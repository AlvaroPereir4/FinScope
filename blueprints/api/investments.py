from datetime import datetime
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from bson.objectid import ObjectId
from extensions import db
from utils import serialize_doc, parse_object_id, api_error

investments_bp = Blueprint("investments", __name__)


@investments_bp.route("/api/investments", methods=["GET", "POST"])
@investments_bp.route("/api/investments/<inv_id>", methods=["PUT", "DELETE"])
@login_required
def investments(inv_id=None):
    user_oid = ObjectId(current_user.id)

    if request.method == "DELETE":
        try:
            iid = parse_object_id(inv_id)
        except ValueError:
            return api_error("Invalid investment id")
        db.investments.delete_one({"_id": iid, "user_id": user_oid})
        db.investment_entries.delete_many({"investment_id": iid})
        return jsonify({"status": "deleted"})

    if request.method == "PUT":
        try:
            iid = parse_object_id(inv_id)
        except ValueError:
            return api_error("Invalid investment id")
        data = request.json
        db.investments.update_one(
            {"_id": iid, "user_id": user_oid},
            {"$set": {
                "name": data["name"],
                "type": data["type"],
                "target_amount": float(data.get("target_amount", 0)),
                "updated_at": datetime.utcnow(),
            }},
        )
        return jsonify({"status": "updated"})

    if request.method == "POST":
        data = request.json
        new_inv = {
            "user_id": user_oid,
            "name": data["name"],
            "type": data["type"],
            "current_amount": float(data.get("current_amount", 0)),
            "target_amount": float(data.get("target_amount", 0)),
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
        res = db.investments.insert_one(new_inv)
        new_inv["_id"] = res.inserted_id
        return jsonify(serialize_doc(new_inv))

    items = list(db.investments.find({"user_id": user_oid}))
    return jsonify([serialize_doc(i) for i in items])


@investments_bp.route("/api/investments/history", methods=["GET"])
@login_required
def investments_history():
    user_oid = ObjectId(current_user.id)
    entries = list(db.investment_entries.find({"user_id": user_oid}).sort("date", 1))
    return jsonify([serialize_doc(e) for e in entries])


@investments_bp.route("/api/investments/<inv_id>/entries", methods=["GET", "POST"])
@login_required
def investment_entries(inv_id):
    user_oid = ObjectId(current_user.id)
    try:
        iid = parse_object_id(inv_id)
    except ValueError:
        return api_error("Invalid investment id")

    if request.method == "POST":
        data = request.json
        amount = float(data["amount"])
        entry_type = data["type"]
        new_entry = {
            "user_id": user_oid,
            "investment_id": iid,
            "type": entry_type,
            "amount": amount,
            "date": data["date"],
            "created_at": datetime.utcnow(),
        }
        db.investment_entries.insert_one(new_entry)

        inv = db.investments.find_one({"_id": iid})
        current_val = float(inv.get("current_amount", 0))
        new_val = current_val - amount if entry_type == "withdrawal" else current_val + amount
        db.investments.update_one(
            {"_id": iid},
            {"$set": {"current_amount": new_val, "updated_at": datetime.utcnow()}},
        )
        return jsonify({"status": "success", "new_balance": new_val})

    entries = list(db.investment_entries.find({"investment_id": iid}).sort("date", -1))
    return jsonify([serialize_doc(e) for e in entries])
