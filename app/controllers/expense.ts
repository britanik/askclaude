import { IAccount } from "../interfaces/accounts";
import { IUser } from "../interfaces/users";
import { ITransaction } from "../interfaces/transactions";
import Account from "../models/accounts";
import Transaction from "../models/transactions";
import { Budget } from '../models/budgets';
import moment from "moment";

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
    
    // Group transactions by date
    const groupedByDate = new Map<string, ITransaction[]>();
    
    transactions.forEach(transaction => {
      const dateKey = moment.utc(transaction.date).format('DD.MM.YYYY');
      if (!groupedByDate.has(dateKey)) {
        groupedByDate.set(dateKey, []);
      }
      groupedByDate.get(dateKey)!.push(transaction);
    });
    
    // Sort dates in descending order (newest first)
    const sortedDates = Array.from(groupedByDate.keys()).sort((a, b) => {
      const dateA = moment.utc(a, 'DD.MM.YYYY');
      const dateB = moment.utc(b, 'DD.MM.YYYY');
      return dateB.diff(dateA);
    });
    
    // CSV header
    let result = "ID|Date (DD.MM.YYYY)|Type|Amount|Currency|Account|Description\n";
    
    sortedDates.forEach(dateKey => {
      const dayTransactions = groupedByDate.get(dateKey)!;
      
      // Calculate daily expense totals by currency
      const dailyExpenseTotals = new Map<string, number>();
      
      dayTransactions.forEach(transaction => {
        if (transaction.type === 'expense') {
          const currency = transaction.currency;
          if (!dailyExpenseTotals.has(currency)) {
            dailyExpenseTotals.set(currency, 0);
          }
          dailyExpenseTotals.set(currency, dailyExpenseTotals.get(currency)! + transaction.amount);
        }
      });
      
      // Format date header with totals
      const today = moment().utc().format('DD.MM.YYYY');
      const yesterday = moment().utc().subtract(1, 'day').format('DD.MM.YYYY');
      
      let dateLabel = dateKey;
      if (dateKey === today) {
        dateLabel += ' (today';
      } else if (dateKey === yesterday) {
        dateLabel += ' (yesterday';
      } else {
        dateLabel += ' (';
      }
      
      // Add expense totals to the date label
      if (dailyExpenseTotals.size > 0) {
        const totalLines: string[] = [];
        dailyExpenseTotals.forEach((total, currency) => {
          totalLines.push(`${total} ${currency}`);
        });
        if (dateKey === today || dateKey === yesterday) {
          dateLabel += `, total spent: ${totalLines.join(', ')})`;
        } else {
          dateLabel += `total spent: ${totalLines.join(', ')})`;
        }
      } else {
        dateLabel += ')';
      }
      
      result += `--- ${dateLabel} ---\n`;
      
      // Get only expense transactions for display
      const expenseTransactions = dayTransactions.filter(t => t.type === 'expense');
      
      if (expenseTransactions.length > 0) {
        // Sort expense transactions within the day by time (newest first)
        const sortedExpenseTransactions = expenseTransactions.sort((a, b) => 
          moment.utc(b.date).diff(moment.utc(a.date))
        );
        
        // Add individual expense transactions in CSV format
        sortedExpenseTransactions.forEach(transaction => {
          const accountName = (transaction.account as any)?.name || 'Unknown Account';
          const date = moment.utc(transaction.date).format('DD.MM.YYYY');
          
          result += `${transaction.ID}|${date}|${transaction.type}|${transaction.amount}|${transaction.currency}|${accountName}|${transaction.description}\n`;
        });
      }
    });
    
    return result.trim();
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
      // ID will be auto-assigned by the pre-save middleware
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
    
    // Try to find by simple numeric ID
    const numericId = parseInt(accountId);
    if (isNaN(numericId)) {
      return `Неверный ID счета: ${accountId}. ID должен быть числом.`;
    }
    
    const account = await Account.findOne({ ID: numericId, user: user._id });
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
    const { amount, description, accountId, type, currency, date } = input;

    const account = await findAccountByReadableId(user, accountId);
    if (!account) {
      return "Account not found.";
    }

    // Parse date if provided, otherwise use current date
    let transactionDate: Date;
    if (date) {
      // Parse the date in UTC and set to start of day to avoid timezone issues
      const parsedDate = moment.utc(date, 'DD.MM.YYYY', true);
      if (parsedDate.isValid()) {
        transactionDate = parsedDate.startOf('day').toDate();
      } else {
        return `Неверный формат даты: "${date}". Используйте формат: ДД.ММ.ГГГГ (например, 15.06.2024)`;
      }
    } else {
      // For current date, use start of today in UTC
      transactionDate = moment().utc().startOf('day').toDate();
    }

    const transaction = new Transaction({
      // ID will be auto-assigned by the pre-save middleware
      user: user._id,
      account: account._id,
      type,
      amount: Math.abs(amount),
      currency,
      description,
      date: transactionDate
    });

    await transaction.save();
    
    account.balance -= Math.abs(amount);
    await account.save();

    // Format the date for the response using UTC
    const formattedDate = moment.utc(transactionDate).format('DD.MM.YYYY');
    const dateText = date ? ` на ${formattedDate}` : '';

    return `Expense of ${Math.abs(amount)} ${account.currency} tracked successfully${dateText} with ID: ${transaction.ID}`;
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
    
    // Find the transaction by simple numeric ID
    const numericId = parseInt(transactionId);
    if (isNaN(numericId)) {
      return `Неверный ID транзакции: ${transactionId}. ID должен быть числом.`;
    }
    
    const transaction = await Transaction.findOne({ ID: numericId, user: user._id });
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
          // Parse date properly with UTC and start of day
          const parsedDate = moment.utc(value, 'DD.MM.YYYY', true);
          if (parsedDate.isValid()) {
            updates[key] = parsedDate.startOf('day').toDate();
          } else {
            return `Неверный формат даты: "${value}". Используйте формат: ДД.ММ.ГГГГ`;
          }
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
    if (updates.date) updatedFields.push(`дата: ${moment.utc(updates.date).format('DD.MM.YYYY')}`);
    
    return `Транзакция "${transaction.description}" (ID: ${transaction.ID}) успешно обновлена. Изменения: ${updatedFields.join(', ')}.`;
  } catch (error) {
    console.error('Error editing transaction:', error);
    return "Ошибка при редактировании транзакции. Попробуйте позже.";
  }
}

// Add this function to /controllers/expense.ts

export async function deleteTransaction(user: IUser, input): Promise<string> {
  try {
    const { transactionId } = input;
    
    // Validate that we have a transaction ID
    if (!transactionId) {
      return "Не указан ID транзакции для удаления.";
    }
    
    // Find the transaction by simple numeric ID
    const numericId = parseInt(transactionId);
    if (isNaN(numericId)) {
      return `Неверный ID транзакции: ${transactionId}. ID должен быть числом.`;
    }
    
    const transaction = await Transaction.findOne({ ID: numericId, user: user._id }).populate('account');
    if (!transaction) {
      return `Транзакция с ID ${transactionId} не найдена.`;
    }

    // Get the associated account
    const account = transaction.account as any;
    if (!account) {
      return "Связанный счет не найден.";
    }

    // Delete the transaction first
    await Transaction.findByIdAndDelete(transaction._id);

    // Only update account balance after successful deletion
    if (transaction.type === 'expense') {
      // Add back the expense amount
      account.balance += transaction.amount;
    } else if (transaction.type === 'income') {
      // Subtract the income amount
      account.balance -= transaction.amount;
    }
    // Note: for transfers, you might need more complex logic depending on your implementation

    // Save the updated account balance
    await account.save();
    
    return `Транзакция удалена: ${transaction.ID}`;
    
  } catch (error) {
    console.error('Error deleting transaction:', error);
    return "Ошибка при удалении транзакции. Попробуйте позже.";
  }
}

export async function findAccountByReadableId(user: IUser, readableId: string): Promise<IAccount | null> {
  try {
    // Check if the ID is numeric (simple numeric ID)
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

export async function findTransactionByReadableId(user: IUser, readableId: string): Promise<ITransaction | null> {
  try {
    // Check if the ID is numeric (simple numeric ID)
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

/* Budgets */
export async function createBudget(user: IUser, input: any): Promise<string> {  
  try {
    const { days, totalAmount, dailyAmount, currency, startDate, endDate } = input;
    
    // Validate required fields
    if ( !days || !totalAmount || !dailyAmount || !currency || !startDate || !endDate) {
      return "Days count, total amount, daily amount, currency, start date and end date are required.";
    }
    
    // Parse dates (support both ISO and DD.MM.YYYY formats)
    let parsedStartDate = moment.utc(startDate, 'YYYY-MM-DD', true);
    if (!parsedStartDate.isValid()) {
      parsedStartDate = moment.utc(startDate, 'DD.MM.YYYY', true);
    }
    
    let parsedEndDate = moment.utc(endDate, 'YYYY-MM-DD', true);
    if (!parsedEndDate.isValid()) {
      parsedEndDate = moment.utc(endDate, 'DD.MM.YYYY', true);
    }
    
    if (!parsedStartDate.isValid() || !parsedEndDate.isValid()) {
      return "Invalid date format. Use YYYY-MM-DD or DD.MM.YYYY format.";
    }
    
    if (parsedEndDate.isSameOrBefore(parsedStartDate)) {
      return "End date must be after start date.";
    }
    
    // Check for existing budget with same currency (since we don't use isActive anymore)
    const existingBudget = await Budget.findOne({ 
      user: user._id, 
      currency: currency.toUpperCase()
    });
    
    if (existingBudget) {
      return `You already have a budget for ${currency.toUpperCase()}. Please delete it first.`;
    }
    
    // Create and save budget with auto-generated ID
    const budget = new Budget({
      // ID will be auto-assigned by the pre-save middleware
      user: user._id,
      days: parseInt(days),
      totalAmount: parseInt(totalAmount),
      dailyAmount: parseInt(dailyAmount),
      currency: currency.toUpperCase(),
      startDate: parsedStartDate.utc().toDate(),
      endDate: parsedEndDate.utc().toDate()
    });

    await budget.save();
    
    // Format response
    const formattedStartDate = parsedStartDate.format('DD.MM.YYYY');
    const formattedEndDate = parsedEndDate.format('DD.MM.YYYY');
    const durationDays = parsedEndDate.diff(parsedStartDate, 'days');
    const dailyAllocation = Math.round(totalAmount / durationDays * 100) / 100;
    
    return `Budget created successfully: ${totalAmount} ${currency.toUpperCase()} from ${formattedStartDate} to ${formattedEndDate} (${durationDays} days, ${dailyAllocation}/day)`;
  } catch (error) {
    console.error('Error creating budget:', error);
    return "Error creating budget.";
  }
}

export async function deleteBudget(user: IUser, input: any): Promise<string> {
  try {
    const { ID } = input;
    
    if (!ID) {
      return "Budget ID is required.";
    }
    
    // Convert to number if it's a string
    const budgetId = typeof ID === 'string' ? parseInt(ID) : ID;
    
    if (isNaN(budgetId)) {
      return `Invalid budget ID: ${ID}. ID must be a number.`;
    }
    
    const budget = await Budget.findOneAndDelete({
      user: user._id, 
      ID: budgetId
    });
    
    if (!budget) {
      return `No budget found with ID ${ID}.`;
    }
    
    const formattedStartDate = moment(budget.startDate).format('DD.MM.YYYY');
    const formattedEndDate = moment(budget.endDate).format('DD.MM.YYYY');
    
    return `Budget for ${budget.currency} (${budget.totalAmount} ${budget.currency}, ${formattedStartDate} - ${formattedEndDate}) has been deleted successfully.`;
  } catch (error) {
    console.error('Error deleting budget:', error);
    return "Error deleting budget.";
  }
}

export async function getBudgetInfoString(user: IUser): Promise<string> {
  try {
    const budgets = await Budget.find({ user: user._id }).sort({ created: -1 });
    
    if (budgets.length === 0) {
      return "No budgets found.";
    }
    
    // CSV header
    let result = "ID|Currency|Total|Start Date|End Date|Days Remaining|Daily Allocation|Status\n";
    
    const now = new Date();
    
    // CSV data rows
    result += budgets.map(budget => {
      const startDate = moment(budget.startDate).format('MM/DD/YYYY');
      const endDate = moment(budget.endDate).format('MM/DD/YYYY');
      const daysRemaining = Math.max(0, Math.ceil((budget.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
      const dailyAllocation = daysRemaining > 0 ? Math.round(budget.totalAmount / daysRemaining * 100) / 100 : 0;
      const status = budget.endDate <= now ? 'Expired' : 'Active';
      
      return `${budget.ID}|${budget.currency}|${budget.totalAmount}|${startDate}|${endDate}|${daysRemaining}|${dailyAllocation}|${status}`;
    }).join('\n');
    
    return result;
  } catch (error) {
    console.error('Error formatting budget info:', error);
    return "Error retrieving budget information.";
  }
}