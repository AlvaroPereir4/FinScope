from datetime import datetime
from bson.objectid import ObjectId
from flask import jsonify


def serialize_doc(doc, source=None):
    if not doc:
        return None
    doc = doc.copy()
    doc["_id"] = str(doc["_id"])
    if "user_id" in doc:
        doc["user_id"] = str(doc["user_id"])
    if "card_id" in doc and doc["card_id"]:
        doc["card_id"] = str(doc["card_id"])
    if "investment_id" in doc:
        doc["investment_id"] = str(doc["investment_id"])
    if source:
        doc["source"] = source
    return doc


def format_date_label(key, granularity):
    if granularity == "day":
        return datetime.strptime(key, "%Y-%m-%d").strftime("%d/%m")
    if granularity == "month":
        return datetime.strptime(key, "%Y-%m").strftime("%m/%Y")
    return key


def get_group_id_expr(granularity):
    if granularity == "day":
        return {"$dateToString": {"format": "%Y-%m-%d", "date": {"$toDate": "$date"}}}
    if granularity == "year":
        return {"$substr": ["$date", 0, 4]}
    return {"$substr": ["$date", 0, 7]}


def parse_object_id(value):
    """Returns ObjectId or None; raises ValueError for invalid strings."""
    if not value:
        return None
    try:
        return ObjectId(value)
    except Exception:
        raise ValueError(f"Invalid id: {value}")


def api_error(message, status=400):
    return jsonify({"error": message}), status
