from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from bson.objectid import ObjectId
from extensions import db
from utils import serialize_doc

settings_bp = Blueprint("settings", __name__)


@settings_bp.route("/api/settings", methods=["GET", "POST"])
@login_required
def settings():
    user_oid = ObjectId(current_user.id)

    if request.method == "POST":
        data = request.json
        update_data = {}
        if "categories" in data:
            update_data["categories"] = data["categories"]
        if "buyers" in data:
            update_data["buyers"] = data["buyers"]
        db.user_settings.update_one(
            {"user_id": user_oid},
            {"$set": update_data},
            upsert=True,
        )
        return jsonify({"status": "success"})

    doc = db.user_settings.find_one({"user_id": user_oid})
    if not doc:
        return jsonify({"categories": ["Food", "Housing", "Transport"], "buyers": ["Me"]})
    return jsonify(serialize_doc(doc))
