import { IAccount } from "../interfaces/accounts";
import { IUser } from "../interfaces/users";
import { ITransaction } from "../interfaces/transactions";
import Account from "../models/accounts";
import Transaction from "../models/transactions";
import moment from "moment";
import { getReadableId } from "../helpers/helpers";

export async function getUserAccounts(user: IUser): Promise<IAccount[]> {
  try {
    return await Account.find({ user: user._id, }).sort({ created: -1 });
  } catch (error) {
    console.error('Error fetching user accounts:', error);
    return [];
  }
}

export async function getUserAccountsString(user: IUser): Promise<string> {
  try {
    const accounts = await getUserAccounts(user);
    if (accounts.length === 0) {
      return "No accounts found.";
    }
    
    // CSV header
    let result = "ID|Name|Type|Currency|Balance|Default\n";
    
    // CSV data rows
    result += accounts.map(account => 
      `${account.ID}|${account.name}|${account.type}|${account.currency}|${account.balance}|${account.isDefault ? 'Yes' : 'No'}`
    ).join('\n');
    
    return result;
  } catch (error) {
    console.error('Error formatting user accounts:', error);
    return "Error retrieving accounts.";
  }
}

export async function getRecentTransactionsString(user: IUser): Promise<string> {
  try {
    const transactions = await Transaction.find({ user: user._id })
      .populate('account', 'name')
      .sort({ date: -1 })
      .limit(50);
    
    if (transactions.length === 0) {
      return "No recent transactions found.";
    }
    
    // CSV header
    let result = "ID|Date|Type|Amount|Currency|Account|Description\n";
    
    // CSV data rows
    result += transactions.map(transaction => {
      const date = moment(transaction.date).format('MM/DD/YYYY');
      const accountName = (transaction.account as any)?.name || 'Unknown Account';
      
      return `${transaction.ID}|${date}|${transaction.type}|${transaction.amount}|${transaction.currency}|${accountName}|${transaction.description}`;
    }).join('\n');
    
    return result;
  } catch (error) {
    console.error('Error formatting recent transactions:', error);
    return "Error retrieving transactions.";
  }
}

export async function createAccount(user: IUser, input): Promise<string> {
  try {
    const { name, type, currency, initial_balance, isDefault } = input;
    
    if (isDefault) {
      await Account.updateMany({ user: user._id }, { isDefault: false });
    }

    const account = new Account({
      ID: getReadableId(),
      user: user._id,
      name,
      type,
      currency,
      balance: initial_balance || 0,
      isDefault: isDefault || false
    });

    await account.save();
    return `Account "${name}" created successfully with ID: ${account.ID}`;
  } catch (error) {
    console.error('Error creating account:', error);
    return "Error creating account.";
  }
}

export async function updateAccount(user: IUser, input): Promise<string> {
  try {
    const { accountId, name, type, currency, balance, isDefault } = input;
    
    // Validate that we have an account ID
    if (!accountId) {
      return "Не указан ID счета для обновления.";
    }
    
    // Try to find by readable ID
    const account = await findAccountByReadableId(user, accountId);
    if (!account) {
      return `Счет с ID ${accountId} не найден.`;
    }

    // Build update object with only provided fields
    const possibleUpdates = { name, type, currency, balance, isDefault };
    const updates: any = {};
    
    for (const [key, value] of Object.entries(possibleUpdates)) {
      if (value !== undefined && value !== null) {
        updates[key] = value;
      }
    }

    // Check if there are any updates to apply
    if (Object.keys(updates).length === 0) {
      return "Не указаны параметры для обновления.";
    }

    // If setting as default, unset other accounts first
    if (isDefault === true) {
      await Account.updateMany({ user: user._id }, { isDefault: false });
    }

    // Apply the updates
    await Account.findByIdAndUpdate(account._id, updates);
    
    // Build success message with updated fields
    const updatedFields = [];
    if (updates.name) updatedFields.push(`название: "${updates.name}"`);
    if (updates.type) updatedFields.push(`тип: ${updates.type}`);
    if (updates.currency) updatedFields.push(`валюта: ${updates.currency}`);
    if (updates.balance !== undefined) updatedFields.push(`баланс: ${updates.balance} ${account.currency}`);
    if (updates.isDefault === true) updatedFields.push('установлен как основной');
    if (updates.isDefault === false) updatedFields.push('снят статус основного');
    
    return `Счет "${account.name}" (ID: ${account.ID}) успешно обновлен. Изменения: ${updatedFields.join(', ')}.`;
  } catch (error) {
    console.error('Error updating account:', error);
    return "Ошибка при обновлении счета. Попробуйте позже.";
  }
}

export async function trackExpense(user: IUser, input): Promise<string> {
  try {    
    const { amount, description, accountId, type, currency } = input;

    const account = await findAccountByReadableId(user, accountId);
    if (!account) {
      return "Account not found.";
    }

    const transaction = new Transaction({
      ID: getReadableId(),
      user: user._id,
      account: account._id,
      type,
      amount: Math.abs(amount),
      currency,
      description
    });

    await transaction.save();
    
    account.balance -= Math.abs(amount);
    await account.save();

    return `Expense of ${Math.abs(amount)} ${account.currency} tracked successfully with ID: ${transaction.ID}`;
  } catch (error) {
    console.error('Error tracking expense:', error);
    return "Error tracking expense.";
  }
}

export async function editTransaction(user: IUser, input): Promise<string> {
  try {
    const { transactionId, amount, description, type, currency, accountId, date } = input;
    
    // Validate that we have a transaction ID
    if (!transactionId) {
      return "Не указан ID транзакции для редактирования.";
    }
    
    // Find the transaction by readable ID
    const transaction = await findTransactionByReadableId(user, transactionId);
    if (!transaction) {
      return `Транзакция с ID ${transactionId} не найдена.`;
    }

    // Get the current account for balance adjustments
    const currentAccount = await Account.findById(transaction.account);
    if (!currentAccount) {
      return "Связанный счет не найден.";
    }

    // Store original values for balance calculations
    const originalAmount = transaction.amount;
    const originalType = transaction.type;

    // Build update object with only provided fields
    const possibleUpdates = { amount, description, type, currency, date };
    const updates: any = {};
    
    for (const [key, value] of Object.entries(possibleUpdates)) {
      if (value !== undefined && value !== null) {
        if (key === 'amount') {
          updates[key] = Math.abs(value); // Ensure amount is positive
        } else if (key === 'date') {
          updates[key] = moment(value).toDate(); // Convert to Date object
        } else {
          updates[key] = value;
        }
      }
    }

    // Handle account change if provided
    let newAccount = currentAccount;
    if (accountId && accountId !== currentAccount.ID.toString()) {
      newAccount = await findAccountByReadableId(user, accountId);
      if (!newAccount) {
        return `Новый счет с ID ${accountId} не найден.`;
      }
      updates.account = newAccount._id;
    }

    // Check if there are any updates to apply
    if (Object.keys(updates).length === 0) {
      return "Не указаны параметры для обновления.";
    }

    // Calculate balance adjustments
    const finalAmount = updates.amount !== undefined ? updates.amount : originalAmount;
    const finalType = updates.type !== undefined ? updates.type : originalType;

    // Revert original transaction impact on current account
    if (originalType === 'expense') {
      currentAccount.balance += originalAmount; // Add back the expense
    } else if (originalType === 'income') {
      currentAccount.balance -= originalAmount; // Remove the income
    }

    // Apply new transaction impact
    if (newAccount._id.equals(currentAccount._id)) {
      // Same account - apply new impact
      if (finalType === 'expense') {
        newAccount.balance -= finalAmount;
      } else if (finalType === 'income') {
        newAccount.balance += finalAmount;
      }
      await newAccount.save();
    } else {
      // Different account - save current account and update new account
      await currentAccount.save();
      
      if (finalType === 'expense') {
        newAccount.balance -= finalAmount;
      } else if (finalType === 'income') {
        newAccount.balance += finalAmount;
      }
      await newAccount.save();
    }

    // Apply the updates to the transaction
    await Transaction.findByIdAndUpdate(transaction._id, updates);
    
    // Build success message with updated fields
    const updatedFields = [];
    if (updates.amount !== undefined) updatedFields.push(`сумма: ${updates.amount} ${updates.currency || transaction.currency}`);
    if (updates.description) updatedFields.push(`описание: "${updates.description}"`);
    if (updates.type) updatedFields.push(`тип: ${updates.type}`);
    if (updates.currency) updatedFields.push(`валюта: ${updates.currency}`);
    if (updates.account) updatedFields.push(`счет: ${newAccount.name}`);
    if (updates.date) updatedFields.push(`дата: ${moment(updates.date).format('DD.MM.YYYY')}`);
    
    return `Транзакция "${transaction.description}" (ID: ${transaction.ID}) успешно обновлена. Изменения: ${updatedFields.join(', ')}.`;
  } catch (error) {
    console.error('Error editing transaction:', error);
    return "Ошибка при редактировании транзакции. Попробуйте позже.";
  }
}

// Helper function to find account by readable ID
export async function findAccountByReadableId(user: IUser, readableId: string): Promise<IAccount | null> {
  try {
    // Check if the ID is numeric (readable ID)
    const numericId = parseInt(readableId);
    if (!isNaN(numericId)) {
      return await Account.findOne({ ID: numericId, user: user._id });
    }
    return null;
  } catch (error) {
    console.error('Error finding account by readable ID:', error);
    return null;
  }
}

// Helper function to find transaction by readable ID
export async function findTransactionByReadableId(user: IUser, readableId: string): Promise<ITransaction | null> {
  try {
    // Check if the ID is numeric (readable ID)
    const numericId = parseInt(readableId);
    if (!isNaN(numericId)) {
      return await Transaction.findOne({ ID: numericId, user: user._id });
    }
    return null;
  } catch (error) {
    console.error('Error finding transaction by readable ID:', error);
    return null;
  }
}