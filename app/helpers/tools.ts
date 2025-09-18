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
    description: "Record financial transaction (expense/income/transfer)",
    input_schema: {
      type: "object",
      properties: {
        amount: { type: "number", description: "Amount (positive)" },
        description: { type: "string", description: "Transaction description (start with capital letter)" },
        accountId: { type: "string", description: "Account ID" },
        type: { type: "string", enum: ["expense", "income", "transfer"] },
        currency: { type: "string", description: "Currency (USD, EUR, GEL, etc.)" },
        date: { type: "string", description: "Date DD.MM.YYYY format, optional" }
      },
      required: ["amount", "description", "accountId", "type", "currency"]
    }
  },
  {
    name: "createAccount",
    description: "Create new financial account",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Account name" },
        type: { type: "string", enum: ["bank", "cash", "crypto"] },
        currency: { type: "string", description: "Currency code" },
        initial_balance: { type: "number", description: "Starting balance, default 0" },
        isDefault: { type: "boolean", description: "Set as default account" }
      },
      required: ["name", "type", "currency"]
    }
  },
  {
    name: "updateAccount",
    description: "Update existing account",
    input_schema: {
      type: "object",
      properties: {
        accountId: { type: "string", description: "Account ID to update" },
        name: { type: "string" },
        type: { type: "string", enum: ["bank", "cash", "crypto"] },
        currency: { type: "string" },
        balance: { type: "number" },
        isDefault: { type: "boolean" }
      },
      required: ["accountId"]
    }
  },
  {
    name: "editTransaction",
    description: "Edit existing transaction",
    input_schema: {
      type: "object",
      properties: {
        transactionId: { type: "string", description: "Transaction ID to edit" },
        amount: { type: "number" },
        description: { type: "string" },
        type: { type: "string", enum: ["expense", "income", "transfer"] },
        currency: { type: "string" },
        accountId: { type: "string" },
        date: { type: "string", description: "DD.MM.YYYY format" }
      },
      required: ["transactionId"]
    }
  },
  {
    name: "deleteTransaction",
    description: "Delete existing transaction by ID",
    input_schema: {
      type: "object",
      properties: {
        transactionId: { type: "string", description: "Transaction ID to delete" }
      },
      required: ["transactionId"]
    }
  },
  {
    name: "createBudget",
    description: "Create budget with amount, currency, dates",
    input_schema: {
      type: "object",
      properties: {
        days: { type: "number", description: "Total days count in period" },
        totalAmount: { type: "number", description: "Total allocated amount" },
        dailyAmount: { type: "number", description: "= Total amount / days" },
        currency: { type: "string" },
        startDate: { type: "string", description: "YYYY-MM-DD format" },
        endDate: { type: "string", description: "YYYY-MM-DD format" },
        description: { type: "string" }
      },
      required: ["days", "totalAmount", "dailyAmount", "currency", "startDate", "endDate"]
    }
  },
  {
    name: "deleteBudget",
    description: "Delete budget by ID",
    input_schema: {
      type: "object",
      properties: {
        ID: { type: "string", description: "Budget ID" }
      },
      required: ["ID"]
    }
  }
];