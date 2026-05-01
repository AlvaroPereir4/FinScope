from datetime import datetime
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from bson.objectid import ObjectId
from extensions import db
from utils import serialize_doc, parse_object_id, api_error

incomes_bp = Blueprint("incomes", __name__)


@incomes_bp.route("/api/incomes", methods=["GET", "POST"])
@incomes_bp.route("/api/incomes/<income_id>", methods=["PUT", "DELETE"])
@login_required
def incomes(income_id=None):
    user_oid = ObjectId(current_user.id)

    if request.method == "DELETE":
        try:
            iid = parse_object_id(income_id)
        except ValueError:
            return api_error("Invalid income id")
        db.incomes.delete_one({"_id": iid, "user_id": user_oid})
        return jsonify({"status": "deleted"})

    if request.method == "PUT":
        try:
            iid = parse_object_id(income_id)
        except ValueError:
            return api_error("Invalid income id")
        data = request.json
        db.incomes.update_one(
            {"_id": iid, "user_id": user_oid},
            {"$set": {
                "description": data["description"],
                "amount": float(data["amount"]),
                "date": data["date"],
            }},
        )
        return jsonify({"status": "updated"})

    if request.method == "POST":
        data = request.json
        new_income = {
            "user_id": user_oid,
            "description": data["description"],
            "amount": float(data["amount"]),
            "date": data["date"],
            "created_at": datetime.utcnow(),
        }
        res = db.incomes.insert_one(new_income)
        new_income["_id"] = res.inserted_id
        return jsonify([serialize_doc(new_income)])

    query = {"user_id": user_oid}
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")
    if start_date or end_date:
        query["date"] = {}
        if start_date:
            query["date"]["$gte"] = start_date
        if end_date:
            query["date"]["$lte"] = end_date

    items = list(db.incomes.find(query).sort("date", -1))
    return jsonify([serialize_doc(i) for i in items])
