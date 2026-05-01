from datetime import datetime
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from bson.objectid import ObjectId
from extensions import db
from utils import serialize_doc, parse_object_id, api_error

wallets_bp = Blueprint("wallets", __name__)


@wallets_bp.route("/api/wallets", methods=["GET", "POST"])
@wallets_bp.route("/api/wallets/<wallet_id>", methods=["PUT", "DELETE"])
@login_required
def wallets(wallet_id=None):
    user_oid = ObjectId(current_user.id)

    if request.method == "DELETE":
        try:
            wid = parse_object_id(wallet_id)
        except ValueError:
            return api_error("Invalid wallet id")
        db.wallets.delete_one({"_id": wid, "user_id": user_oid})
        return jsonify({"status": "deleted"})

    if request.method == "PUT":
        try:
            wid = parse_object_id(wallet_id)
        except ValueError:
            return api_error("Invalid wallet id")
        data = request.json
        db.wallets.update_one(
            {"_id": wid, "user_id": user_oid},
            {"$set": {
                "name": data["name"],
                "balance": float(data["balance"]),
                "updated_at": datetime.utcnow(),
            }},
        )
        return jsonify({"status": "updated"})

    if request.method == "POST":
        data = request.json
        new_wallet = {
            "user_id": user_oid,
            "name": data["name"],
            "balance": float(data["balance"]),
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
        res = db.wallets.insert_one(new_wallet)
        new_wallet["_id"] = res.inserted_id
        return jsonify(serialize_doc(new_wallet))

    items = list(db.wallets.find({"user_id": user_oid}))
    return jsonify([serialize_doc(w) for w in items])
