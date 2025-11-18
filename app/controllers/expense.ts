import { IUser } from "../interfaces/users";
import { ITransaction } from "../interfaces/transactions";
import Transaction from "../models/transactions";
import { Budget } from '../models/budgets';
import moment from "moment";

export async function trackExpense(user: IUser, input): Promise<string> {
  try {    
    const { amount, description, type, currency, date } = input;

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
      type,
      amount: Math.abs(amount),
      currency,
      description,
      date: transactionDate
    });

    await transaction.save();

    // Format the date for the response using UTC
    const formattedDate = moment.utc(transactionDate).format('DD.MM.YYYY');
    const dateText = date ? ` на ${formattedDate}` : '';

    return `${type === 'expense' ? 'Expense' : 'Income'} of ${Math.abs(amount)} ${currency} tracked successfully${dateText} with ID: ${transaction.ID}`;
  } catch (error) {
    console.error('Error tracking expense:', error);
    return "Error tracking expense.";
  }
}

export async function editTransaction(user: IUser, input): Promise<string> {
  try {
    const { transactionId, amount, description, type, currency, date } = input;
    
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

    // Check if there are any updates to apply
    if (Object.keys(updates).length === 0) {
      return "Не указаны параметры для обновления.";
    }

    // Apply the updates to the transaction
    await Transaction.findByIdAndUpdate(transaction._id, updates);
    
    // Build success message with updated fields
    const updatedFields = [];
    if (updates.amount !== undefined) updatedFields.push(`сумма: ${updates.amount} ${updates.currency || transaction.currency}`);
    if (updates.description) updatedFields.push(`описание: "${updates.description}"`);
    if (updates.type) updatedFields.push(`тип: ${updates.type}`);
    if (updates.currency) updatedFields.push(`валюта: ${updates.currency}`);
    if (updates.date) updatedFields.push(`дата: ${moment.utc(updates.date).format('DD.MM.YYYY')}`);
    
    return `Транзакция "${transaction.description}" (ID: ${transaction.ID}) успешно обновлена. Изменения: ${updatedFields.join(', ')}.`;
  } catch (error) {
    console.error('Error editing transaction:', error);
    return "Ошибка при редактировании транзакции. Попробуйте позже.";
  }
}

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
    
    const transaction = await Transaction.findOne({ ID: numericId, user: user._id });
    if (!transaction) {
      return `Транзакция с ID ${transactionId} не найдена.`;
    }

    // Delete the transaction
    await Transaction.findByIdAndDelete(transaction._id);
    
    return `Транзакция удалена: ${transaction.ID}`;
    
  } catch (error) {
    console.error('Error deleting transaction:', error);
    return "Ошибка при удалении транзакции. Попробуйте позже.";
  }
}

export async function getTransactionsString(
  user: IUser, 
  params: {
    count?: number;
    start_date?: string;
    end_date?: string;
    includeBudgetInfo?: boolean;
  } = {}
): Promise<string> {
  try {
    const { count = +process.env.FINANCE_TRANSACTIONS_AMOUNT, start_date, end_date, includeBudgetInfo = true } = params;
    
    console.log(count,'count')

    // Build query
    let query: any = { user: user._id };
    
    // Add date range filter if provided
    if (start_date || end_date) {
      query.date = {};
      
      if (start_date) {
        // Convert DD.MM.YYYY to Date
        const startMoment = moment.utc(start_date, 'DD.MM.YYYY').startOf('day');
        query.date.$gte = startMoment.toDate();
      }
      
      if (end_date) {
        // Convert DD.MM.YYYY to Date
        const endMoment = moment.utc(end_date, 'DD.MM.YYYY').endOf('day');
        query.date.$lte = endMoment.toDate();
      }
    }
    
    // Get transactions
    const transactions = await Transaction.find(query)
      .sort({ date: -1 })
      .limit(count);
    
    if (transactions.length === 0) {
      return "<transactions><message>No recent transactions found.</message></transactions>";
    }

    // Get active budgets if budget info is requested
    let budgets = [];
    if (includeBudgetInfo) {
      const now = new Date();
      budgets = await Budget.find({ 
        user: user._id,
        startDate: { $lte: now },
        endDate: { $gte: now }
      });
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
    
    // Start XML output
    let result = "<transactions>\n";
    
    sortedDates.forEach(dateKey => {
      const dayTransactions = groupedByDate.get(dateKey)!;
      const transactionDate = moment.utc(dateKey, 'DD.MM.YYYY');
      
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
      
      // Calculate budget allocation totals by currency for this date (if requested)
      let dailyAllocationTotals = new Map<string, number>();
      if (includeBudgetInfo) {
        dailyAllocationTotals = calculateDayAllocationTotals(transactionDate, budgets, transactions);
      }
      
      // Determine date label
      const today = moment().utc().format('DD.MM.YYYY');
      const yesterday = moment().utc().subtract(1, 'day').format('DD.MM.YYYY');
      
      let dateLabel = '';
      if (dateKey === today) {
        dateLabel = 'today';
      } else if (dateKey === yesterday) {
        dateLabel = 'yesterday';
      }
      
      // Build spent attribute
      let spentAttr = '';
      if (dailyExpenseTotals.size > 0) {
        const spentParts: string[] = [];
        dailyExpenseTotals.forEach((total, currency) => {
          spentParts.push(`${total} ${currency}`);
        });
        spentAttr = ` spent="${spentParts.join(', ')}"`;
      }
      
      // Build allocated attribute
      let allocatedAttr = '';
      if (dailyAllocationTotals.size > 0) {
        const allocatedParts: string[] = [];
        dailyAllocationTotals.forEach((total, currency) => {
          allocatedParts.push(`${total.toFixed(2)} ${currency}`);
        });
        allocatedAttr = ` alloc="${allocatedParts.join(', ')}"`;
      }
      
      // Build label attribute
      const labelAttr = dateLabel ? ` label="${dateLabel}"` : '';
      
      // Open day tag
      result += `  <day date="${dateKey}"${labelAttr}${spentAttr}${allocatedAttr}>\n`;
      
      // Get only expense transactions for display
      const expenseTransactions = dayTransactions.filter(t => t.type === 'expense');
      
      if (expenseTransactions.length > 0) {
        // Sort expense transactions within the day by time (newest first)
        const sortedExpenseTransactions = expenseTransactions.sort((a, b) => 
          moment.utc(b.date).diff(moment.utc(a.date))
        );
        
        // Add individual expense transactions in XML format
        sortedExpenseTransactions.forEach(t => {
          result += `    <tx id="${t.ID}" amt="${t.amount}" cur="${t.currency}" desc="${t.description}"/>\n`;
        });
      }
      
      // Close day tag
      result += `  </day>\n`;
    });
    
    // Close transactions tag
    result += "</transactions>";
    
    return result;
  } catch (error) {
    console.error('Error formatting transactions:', error);
    return "<transactions><error>Error retrieving transactions.</error></transactions>";
  }
}

function calculateDayAllocationTotals(
  targetDate: moment.Moment, 
  budgets: any[], 
  allTransactions: ITransaction[]
): Map<string, number> {
  const allocationTotals = new Map<string, number>();

  budgets.forEach(budget => {
    const budgetStart = moment.utc(budget.startDate);
    const budgetEnd = moment.utc(budget.endDate);
    
    // Check if target date falls within budget period
    if (!targetDate.isBetween(budgetStart, budgetEnd, 'day', '[]')) {
      return; // Skip this budget
    }

    // Calculate base daily allocation
    const totalBudgetDays = budgetEnd.diff(budgetStart, 'days') + 1;
    const baseDailyAllocation = budget.totalAmount / totalBudgetDays;

    // Calculate rollover from previous days
    let rollover = 0;
    
    // Get all expense transactions for this budget's currency from budget start to target date
    const budgetTransactions = allTransactions.filter(t => 
      t.type === 'expense' &&
      t.currency === budget.currency &&
      moment.utc(t.date).isBetween(budgetStart, targetDate, 'day', '[)')
    );

    // Group transactions by date to calculate daily rollovers
    const dailySpending = new Map<string, number>();
    budgetTransactions.forEach(t => {
      const dateKey = moment.utc(t.date).format('YYYY-MM-DD');
      if (!dailySpending.has(dateKey)) {
        dailySpending.set(dateKey, 0);
      }
      dailySpending.set(dateKey, dailySpending.get(dateKey)! + t.amount);
    });

    // Calculate cumulative rollover up to target date
    const startDate = budgetStart.clone();
    while (startDate.isBefore(targetDate, 'day')) {
      const dateKey = startDate.format('YYYY-MM-DD');
      const daySpending = dailySpending.get(dateKey) || 0;
      rollover += baseDailyAllocation - daySpending;
      startDate.add(1, 'day');
    }

    // Final daily allocation includes rollover
    const dailyAllocation = Math.max(0, baseDailyAllocation + rollover);

    // Add to totals by currency
    const existingTotal = allocationTotals.get(budget.currency) || 0;
    allocationTotals.set(budget.currency, existingTotal + dailyAllocation);
  });

  return allocationTotals;
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
      
      // Calculate daily allocation based on total budget period
      const totalDays = Math.ceil((budget.endDate.getTime() - budget.startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const dailyAllocation = Math.round(budget.totalAmount / totalDays * 100) / 100;
      
      const status = budget.endDate <= now ? 'Expired' : 'Active';
      
      return `${budget.ID}|${budget.currency}|${budget.totalAmount}|${startDate}|${endDate}|${daysRemaining}|${dailyAllocation}|${status}`;
    }).join('\n');
    
    return result;
  } catch (error) {
    console.error('Error formatting budget info:', error);
    return "Error retrieving budget information.";
  }
}