from flask_login import UserMixin
from bson.objectid import ObjectId
from extensions import db, login_manager


class User(UserMixin):
    def __init__(self, user_doc):
        self.id = str(user_doc["_id"])
        self.username = user_doc["username"]
        self.password_hash = user_doc["password_hash"]


@login_manager.user_loader
def load_user(user_id):
    try:
        user_data = db.users.find_one({"_id": ObjectId(user_id)})
        if user_data:
            return User(user_data)
    except Exception:
        return None
    return None
