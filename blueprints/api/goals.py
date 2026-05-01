from datetime import datetime
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from bson.objectid import ObjectId
from extensions import db
from utils import serialize_doc, parse_object_id, api_error

goals_bp = Blueprint("goals", __name__)


@goals_bp.route("/api/goals", methods=["GET", "POST"])
@goals_bp.route("/api/goals/<goal_id>", methods=["PUT", "DELETE"])
@login_required
def goals(goal_id=None):
    user_oid = ObjectId(current_user.id)

    if request.method == "DELETE":
        try:
            gid = parse_object_id(goal_id)
        except ValueError:
            return api_error("Invalid goal id")
        db.goals.delete_one({"_id": gid, "user_id": user_oid})
        return jsonify({"status": "deleted"})

    if request.method == "PUT":
        try:
            gid = parse_object_id(goal_id)
        except ValueError:
            return api_error("Invalid goal id")
        data = request.json
        db.goals.update_one(
            {"_id": gid, "user_id": user_oid},
            {"$set": {
                "title": data["title"],
                "type": data.get("type", "spending"),
                "target_amount": float(data["target_amount"]),
                "current_amount": float(data["current_amount"]),
                "deadline": data["deadline"],
            }},
        )
        return jsonify({"status": "updated"})

    if request.method == "POST":
        data = request.json
        new_goal = {
            "user_id": user_oid,
            "title": data["title"],
            "type": data.get("type", "spending"),
            "target_amount": float(data["target_amount"]),
            "current_amount": float(data.get("current_amount", 0)),
            "deadline": data["deadline"],
            "created_at": datetime.utcnow(),
        }
        res = db.goals.insert_one(new_goal)
        new_goal["_id"] = res.inserted_id
        return jsonify(serialize_doc(new_goal))

    items = list(db.goals.find({"user_id": user_oid}))
    return jsonify([serialize_doc(g) for g in items])
