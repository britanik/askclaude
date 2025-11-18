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
        type: { type: "string", enum: ["expense", "income", "transfer"] },
        currency: { type: "string", description: "Currency (USD, EUR, GEL, etc.)" },
        date: { type: "string", description: "Date DD.MM.YYYY format, optional" }
      },
      required: ["amount", "description", "type", "currency"]
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
        dailyAmount: { type: "number", description: "Total amount / days" },
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
  },
  {
    name: "loadMore",
    description: "Load additional transactions beyond the default 10 shown. Use when user needs more transaction history or asks about specific time periods. Can filter by count, date range, or both.",
    input_schema: {
      type: "object",
      properties: {
        count: { 
          type: "number", 
          description: "Number of additional transactions to load" 
        },
        start_date: { 
          type: "string", 
          description: "Start date in DD.MM.YYYY format" 
        },
        end_date: { 
          type: "string", 
          description: "End date in DD.MM.YYYY format" 
        }
      },
      required: []
    }
  }
];