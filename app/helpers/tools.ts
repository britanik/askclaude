export const searchTool = [
  {
    type: "web_search_20250305",
    name: "web_search",
    max_uses: +(process.env.WEB_SEARCH_MAX_USES || 5)
  }
]

export const financeTools = [
  {
    name: "trackExpense",
    description: "Record a financial transaction (expense, income, or transfer)",
    input_schema: {
      type: "object",
      properties: {
        amount: {
          type: "number",
          description: "The amount of money (always positive number)"
        },
        description: {
          type: "string",
          description: "Description of the transaction"
        },
        accountId: {
          type: "string",
          description: "ID of the account to use for this transaction (e.g., 240119001)"
        },
        type: {
          type: "string",
          enum: ["expense", "income", "transfer"],
          description: "Type of transaction"
        },
        currency: {
          type: "string",
          description: "Currency code (USD, EUR, GEL, etc.)"
        },
        date: {
          type: "string",
          description: "Transaction date in DD.MM.YYYY format (e.g., 15.06.2024). If not provided, uses current date."
        }
      },
      required: ["amount", "description", "accountId", "type", "currency"]
    }
  },
  {
    name: "createAccount",
    description: "Create a new financial account for the user",
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Name of the account (e.g., 'Main Card', 'Cash Wallet')"
        },
        type: {
          type: "string",
          enum: ["bank", "cash", "crypto"],
          description: "Type of the account"
        },
        currency: {
          type: "string",
          description: "Currency code (USD, EUR, GEL, etc.)"
        },
        initial_balance: {
          type: "number",
          description: "Starting balance for the account (optional, defaults to 0)"
        },
        isDefault: {
          type: "boolean",
          description: "Whether this account should be set as the default account (optional, defaults to false)"
        }
      },
      required: ["name", "type", "currency"]
    }
  },
  {
    name: "updateAccount",
    description: "Update an existing financial account",
    input_schema: {
      type: "object",
      properties: {
        accountId: {
          type: "string",
          description: "Readable ID of the account to update (e.g., 240119001)"
        },
        name: {
          type: "string",
          description: "New name for the account"
        },
        type: {
          type: "string",
          enum: ["bank", "cash", "crypto"],
          description: "New type for the account"
        },
        currency: {
          type: "string",
          description: "New currency for the account"
        },
        balance: {
          type: "number",
          description: "New balance for the account"
        },
        isDefault: {
          type: "boolean",
          description: "Whether this account should be set as the default account"
        }
      },
      required: ["accountId"]
    }
  },
  {
    name: "editTransaction",
    description: "Edit an existing financial transaction",
    input_schema: {
      type: "object",
      properties: {
        transactionId: {
          type: "string",
          description: "Readable ID of the transaction to edit (e.g., 240119001)"
        },
        amount: {
          type: "number",
          description: "New amount for the transaction (always positive number)"
        },
        description: {
          type: "string",
          description: "New description for the transaction"
        },
        type: {
          type: "string",
          enum: ["expense", "income", "transfer"],
          description: "New type of transaction"
        },
        currency: {
          type: "string",
          description: "New currency code (USD, EUR, GEL, etc.)"
        },
        accountId: {
          type: "string",
          description: "ID of the account to move this transaction to (e.g., 240119001)"
        },
        date: {
          type: "string",
          description: "Date for the transaction strictly in DD.MM.YYYY format (e.g., 15.06.2024)"
        }
      },
      required: ["transactionId"]
    }
  },
  {
    name: "createBudget",
    description: "Create a new budget for the user with specified amount, currency and end date. Automatically deactivates previous budgets for the same currency.",
    input_schema: {
      type: "object",
      properties: {
        totalAmount: {
          type: "number",
          description: "Total budget amount"
        },
        currency: {
          type: "string", 
          description: "Currency code: USD, EUR, GEL, RUB, etc"
        },
        startDate: {
          type: "string",
          description: "Budget start date in ISO format (YYYY-MM-DD)"
        },
        endDate: {
          type: "string",
          description: "Budget end date in ISO format (YYYY-MM-DD)"
        },
        description: {
          type: "string",
          description: "Optional budget description"
        }
      },
      required: ["totalAmount", "currency", "startDate", "endDate"]
    }
  },
  {
    name: "deleteBudget",
    description: "Permanently delete an existing budget for the user",
    input_schema: {
      type: "object",
      properties: {
        ID: {
          type: "string",
          description: "ID of the budget to delete (e.g., 240119001)"
        }
      },
      required: ["ID"]
    }
  },
];