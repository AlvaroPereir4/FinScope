# FinScope

## Overview

FinScope is a comprehensive personal finance management application designed to give users a clear 360-degree view of their financial health. It goes beyond simple expense tracking by integrating credit card management, investment portfolios, wallet balances, and financial goals into a single, cohesive dashboard.

The project aims to solve the fragmentation of financial data by consolidating "Micro" expenses (daily spending) and "Macro" expenses (consolidated bills) to provide accurate net worth tracking.

## Features

*   **Dashboard:** Real-time overview of income, expenses, and net worth.
*   **Expense Tracking:** Detailed breakdown of daily expenses and consolidated monthly bills.
*   **Credit Card Management:** Manage limits, closing dates, and view estimated invoices with installment logic.
*   **Investments:** Track portfolio performance, contributions, and earnings.
*   **Goals:** Set and track financial goals (savings or spending limits).
*   **Wallets:** Manage actual bank account balances.
*   **Authentication:** Secure login and registration system.

## Documentation & Roadmap

For detailed specifications, references, ideas, and future improvements, please refer to documentation on Notion:

[**FinScope Documentation on Notion**](https://www.notion.so/FinScope-2f30166bb9f68093b059e9fc28216280?source=copy_link)

## Prerequisites

Before you begin, ensure you have met the following requirements:

*   **Python:** version 3.8 or higher.
*   **MongoDB:** You need a running instance of MongoDB (Local or Atlas).

## Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/finscope.git
    cd finscope
    ```

2.  **Create a Virtual Environment (Optional but recommended):**
    ```bash
    python -m venv venv
    # Windows
    venv\Scripts\activate
    # Linux/Mac
    source venv/bin/activate
    ```

3.  **Install Dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

4.  **Environment Configuration:**
    Create a `.env` file in the root directory and add your configuration:

    ```env
    MONGO_URI=mongodb://localhost:27017/finscope
    ```
    *(If using MongoDB Atlas, replace the URI with your connection string).*

## Usage

To run the application locally:

```bash
python app.py
```

Access the application in your browser at: `http://127.0.0.1:5000`

## Project Structure

*   `app.py`: Main Flask application and API routes.
*   `templates/`: HTML files for the frontend.
*   `static/`: CSS styles and JavaScript logic.
*   `static/js/script.js`: Handles frontend logic, API calls, and Chart.js rendering.

## Feedback & Contributing

Welcome community feedback! If you have any comments, suggestions, or want to report a bug, please feel free to open an issue in this repository.
