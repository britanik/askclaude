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
        }
      },
      required: ["amount", "description", "account", "type", "currency"]
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
          description: "Name of the account (e.g., 'Bank of Georgia', 'ByBit', 'Наличные')"
        },
        type: {
          type: "string",
          enum: ["bank", "cash", "crypto"],
          description: "Type of account"
        },
        currency: {
          type: "string",
          description: "Primary currency for this account (USD, EUR, GEL, etc.)"
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
          description: "New name for the account (optional)"
        },
        type: {
          type: "string",
          enum: ["bank", "cash", "crypto"],
          description: "New type for the account (optional)"
        },
        currency: {
          type: "string",
          description: "New currency for the account (optional)"
        },
        isDefault: {
          type: "boolean",
          description: "Whether this account should be set as the default account (optional)"
        }
      },
      required: ["accountId"]
    }
  }
];