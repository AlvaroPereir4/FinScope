import os
from dotenv import load_dotenv
from flask_login import LoginManager
from pymongo import MongoClient

load_dotenv()

client = MongoClient(os.getenv("MONGO_URI", "mongodb://localhost:27017/finscope"))
db = client.get_database()

login_manager = LoginManager()
login_manager.login_view = "auth.login"
