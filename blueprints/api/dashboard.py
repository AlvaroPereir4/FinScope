from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from bson.objectid import ObjectId
from extensions import db
from utils import get_group_id_expr, format_date_label

dashboard_bp = Blueprint("dashboard", __name__)

CATEGORY_COLORS = [
    "#e74c3c", "#e67e22", "#f1c40f", "#2ecc71", "#1abc9c",
    "#3498db", "#9b59b6", "#34495e", "#16a085", "#27ae60",
    "#2980b9", "#8e44ad", "#2c3e50", "#f39c12", "#d35400",
    "#c0392b", "#bdc3c7", "#7f8c8d",
]


@dashboard_bp.route("/api/years", methods=["GET"])
@login_required
def get_years():
    user_oid = ObjectId(current_user.id)
    pipeline = [
        {"$match": {"user_id": user_oid}},
        {"$project": {"year": {"$substr": ["$date", 0, 4]}}},
        {"$unionWith": {"coll": "expenses", "pipeline": [
            {"$match": {"user_id": user_oid}},
            {"$project": {"year": {"$substr": ["$date", 0, 4]}}},
        ]}},
        {"$unionWith": {"coll": "macro_expenses", "pipeline": [
            {"$match": {"user_id": user_oid}},
            {"$project": {"year": {"$substr": ["$date", 0, 4]}}},
        ]}},
        {"$group": {"_id": "$year"}},
    ]
    years = {doc["_id"] for doc in db.incomes.aggregate(pipeline)}
    years.add(str(datetime.now().year))
    return jsonify(sorted(years, reverse=True))


@dashboard_bp.route("/api/balance", methods=["GET"])
@login_required
def get_total_balance():
    user_oid = ObjectId(current_user.id)
    res = list(db.wallets.aggregate([
        {"$match": {"user_id": user_oid}},
        {"$group": {"_id": None, "total": {"$sum": "$balance"}}},
    ]))
    return jsonify({"balance": res[0]["total"] if res else 0})


@dashboard_bp.route("/api/transactions", methods=["GET"])
@login_required
def get_transactions():
    user_oid = ObjectId(current_user.id)
    page = int(request.args.get("page", 1))
    limit = int(request.args.get("limit", 30))
    date_filter = request.args.get("date")
    scope = request.args.get("scope", "macro")

    match_query = {"user_id": user_oid}
    if date_filter:
        if len(date_filter) == 7:
            match_query["date"] = {"$regex": f"^{date_filter}"}
        else:
            match_query["date"] = date_filter

    expense_coll = "expenses" if scope == "micro" else "macro_expenses"
    source_label = "micro" if scope == "micro" else "macro"

    pipeline = [
        {"$unionWith": {"coll": expense_coll, "pipeline": [
            {"$addFields": {"type": "expense", "source": source_label}},
        ]}},
        {"$match": match_query},
        {"$sort": {"date": -1}},
        {"$facet": {
            "metadata": [{"$count": "total"}],
            "data": [{"$skip": (page - 1) * limit}, {"$limit": limit}],
        }},
    ]

    result = list(db.incomes.aggregate(
        [{"$addFields": {"type": "income", "source": "income"}}] + pipeline
    ))

    total_items = result[0]["metadata"][0]["total"] if result and result[0]["metadata"] else 0
    transactions = result[0]["data"] if result and result[0]["data"] else []

    from utils import serialize_doc
    return jsonify({
        "items": [serialize_doc(t) for t in transactions],
        "total_items": total_items,
        "current_page": page,
        "total_pages": (total_items + limit - 1) // limit,
    })


@dashboard_bp.route("/api/dashboard", methods=["GET"])
@login_required
def get_dashboard_data():
    user_oid = ObjectId(current_user.id)
    period = request.args.get("period", "all")
    year = request.args.get("year", str(datetime.now().year))
    granularity = request.args.get("granularity", "month")
    view_mode = request.args.get("view_mode", "general")

    date_filter = _build_date_filter(period, year)
    user_filter = {"user_id": user_oid}
    combined = {**user_filter, **date_filter}

    summary = _build_summary(user_filter, combined)
    group_id = get_group_id_expr(granularity)
    custom_colors = _load_category_colors(user_filter)

    if view_mode == "category":
        chart_data = _chart_by_category(combined, group_id, granularity, custom_colors)
    else:
        chart_data = _chart_general(combined, user_filter, group_id, granularity)

    return jsonify({"summary": summary, "chart_data": chart_data})


# ── helpers ──────────────────────────────────────────────────────────────────

def _build_date_filter(period, year):
    if period == "all":
        return {}
    end_date = datetime.now()
    if period == "30":
        start_date = end_date - timedelta(days=30)
    elif period == "180":
        start_date = end_date - relativedelta(months=6)
    else:  # 'year'
        start_date = datetime(int(year), 1, 1)
        end_date = datetime(int(year), 12, 31)
    return {"date": {
        "$gte": start_date.strftime("%Y-%m-%d"),
        "$lte": end_date.strftime("%Y-%m-%d"),
    }}


def _build_summary(user_filter, combined):
    total_income = sum(d["amount"] for d in db.incomes.find(combined))
    total_expense = sum(d["amount"] for d in db.macro_expenses.find(combined))

    balance_res = list(db.wallets.aggregate([
        {"$match": user_filter},
        {"$group": {"_id": None, "total": {"$sum": "$balance"}}},
    ]))
    balance = balance_res[0]["total"] if balance_res else 0

    invested_res = list(db.investments.aggregate([
        {"$match": user_filter},
        {"$group": {"_id": None, "total": {"$sum": "$current_amount"}}},
    ]))
    total_invested = invested_res[0]["total"] if invested_res else 0

    return {
        "total_income": total_income,
        "total_expense": total_expense,
        "balance": balance,
        "total_invested": total_invested,
        "net_worth": balance + total_invested,
    }


def _load_category_colors(user_filter):
    settings = db.user_settings.find_one(user_filter)
    if not settings or "categories" not in settings:
        return {}
    return {
        cat["name"]: cat["color"]
        for cat in settings["categories"]
        if isinstance(cat, dict) and "name" in cat and "color" in cat
    }


def _aggregate_by_period(collection, group_id, combined, amount_field="amount", extra_filter=None):
    match = dict(combined)
    if extra_filter:
        match.update(extra_filter)
    pipeline = [
        {"$match": match},
        {"$group": {"_id": group_id, "total": {"$sum": f"${amount_field}"}}},
        {"$sort": {"_id": 1}},
    ]
    return {item["_id"]: item["total"] for item in collection.aggregate(pipeline)}


def _chart_general(combined, user_filter, group_id, granularity):
    income_data = _aggregate_by_period(db.incomes, group_id, combined)
    expense_data = _aggregate_by_period(db.macro_expenses, group_id, combined)
    investment_data = _aggregate_by_period(
        db.investment_entries, group_id,
        {**user_filter, **{k: v for k, v in combined.items() if k != "user_id"}},
        extra_filter={"type": "contribution"},
    )

    all_keys = sorted(set(income_data) | set(expense_data) | set(investment_data))
    labels = [format_date_label(k, granularity) for k in all_keys]

    return {
        "labels": labels,
        "datasets": [
            {
                "label": "Income",
                "data": [income_data.get(k, 0) for k in all_keys],
                "borderColor": "#2ecc71",
                "backgroundColor": "rgba(46, 204, 113, 0.1)",
                "tension": 0.4,
                "fill": True,
            },
            {
                "label": "Expenses",
                "data": [expense_data.get(k, 0) for k in all_keys],
                "borderColor": "#e74c3c",
                "backgroundColor": "rgba(231, 76, 60, 0.1)",
                "tension": 0.4,
                "fill": True,
            },
            {
                "label": "Invested",
                "data": [investment_data.get(k, 0) for k in all_keys],
                "borderColor": "#3498db",
                "backgroundColor": "rgba(52, 152, 219, 0.1)",
                "tension": 0.4,
                "fill": True,
            },
        ],
    }


def _chart_by_category(combined, group_id, granularity, custom_colors):
    pipeline_macro = [
        {"$match": combined},
        {"$project": {"amount": 1, "date": 1, "category": {"$ifNull": ["$category", "Others"]}}},
        {"$group": {"_id": {"date": group_id, "category": "$category"}, "total": {"$sum": "$amount"}}},
        {"$sort": {"_id.date": 1}},
    ]
    pipeline_income = [
        {"$match": combined},
        {"$project": {"amount": 1, "date": 1, "category": {"$literal": "Income"}}},
        {"$group": {"_id": {"date": group_id, "category": "$category"}, "total": {"$sum": "$amount"}}},
        {"$sort": {"_id.date": 1}},
    ]
    results = list(db.macro_expenses.aggregate(pipeline_macro)) + list(db.incomes.aggregate(pipeline_income))

    data_map = {}
    all_categories = set()
    all_dates = set()
    for item in results:
        date_key = item["_id"]["date"]
        cat = item["_id"]["category"]
        data_map.setdefault(date_key, {})[cat] = item["total"]
        all_categories.add(cat)
        all_dates.add(date_key)

    sorted_dates = sorted(all_dates)
    labels = [format_date_label(k, granularity) for k in sorted_dates]

    datasets = []
    for idx, cat in enumerate(sorted(all_categories)):
        color = "#2ecc71" if cat == "Income" else custom_colors.get(cat, CATEGORY_COLORS[idx % len(CATEGORY_COLORS)])
        datasets.append({
            "label": cat,
            "data": [data_map.get(d, {}).get(cat, 0) for d in sorted_dates],
            "borderColor": color,
            "backgroundColor": color + "1A",
            "tension": 0.2,
            "fill": False,
            "borderWidth": 2 if cat == "Income" else 1.5,
            "pointRadius": 0,
            "pointHoverRadius": 4,
        })

    return {"labels": labels, "datasets": datasets}
