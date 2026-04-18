import { IUser } from "../interfaces/users";
import { ITransaction } from "../interfaces/transactions";
import Transaction from "../models/transactions";
import { Budget } from '../models/budgets';
import moment from "moment";
import { convertToUSD } from "../services/currency";

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

    const absAmount = Math.abs(amount);
    const { amountUSD, exchangeRate } = await convertToUSD(absAmount, currency);

    const transaction = new Transaction({
      user: user._id,
      type,
      amount: amountUSD,
      currency: 'USD',
      originalAmount: absAmount,
      originalCurrency: currency,
      exchangeRate,
      description,
      date: transactionDate
    });

    await transaction.save();

    // Format the date for the response using UTC
    const formattedDate = moment.utc(transactionDate).format('DD.MM.YYYY');
    const dateText = date ? ` на ${formattedDate}` : '';

    return `${type === 'expense' ? 'Expense' : 'Income'} of ${absAmount} ${currency} tracked successfully${dateText} with ID: ${transaction.ID}`;
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
    const updates: any = {};
    const updatedFields = [];

    if (description !== undefined && description !== null) {
      updates.description = description;
      updatedFields.push(`описание: "${description}"`);
    }
    if (type !== undefined && type !== null) {
      updates.type = type;
      updatedFields.push(`тип: ${type}`);
    }
    if (date !== undefined && date !== null) {
      const parsedDate = moment.utc(date, 'DD.MM.YYYY', true);
      if (parsedDate.isValid()) {
        updates.date = parsedDate.startOf('day').toDate();
        updatedFields.push(`дата: ${moment.utc(updates.date).format('DD.MM.YYYY')}`);
      } else {
        return `Неверный формат даты: "${date}". Используйте формат: ДД.ММ.ГГГГ`;
      }
    }

    // Handle amount/currency changes with USD conversion
    const newAmount = amount !== undefined && amount !== null ? Math.abs(amount) : null;
    const newCurrency = currency || null;

    if (newAmount !== null || newCurrency !== null) {
      const finalOriginalAmount = newAmount ?? transaction.originalAmount ?? transaction.amount;
      const finalOriginalCurrency = newCurrency ?? transaction.originalCurrency ?? transaction.currency;

      const { amountUSD, exchangeRate } = await convertToUSD(finalOriginalAmount, finalOriginalCurrency);
      updates.amount = amountUSD;
      updates.currency = 'USD';
      updates.originalAmount = finalOriginalAmount;
      updates.originalCurrency = finalOriginalCurrency;
      updates.exchangeRate = exchangeRate;

      if (newAmount !== null) updatedFields.push(`сумма: ${finalOriginalAmount} ${finalOriginalCurrency}`);
      if (newCurrency) updatedFields.push(`валюта: ${newCurrency}`);
    }

    // Check if there are any updates to apply
    if (Object.keys(updates).length === 0) {
      return "Не указаны параметры для обновления.";
    }

    // Apply the updates to the transaction
    await Transaction.findByIdAndUpdate(transaction._id, updates);

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
    // console.log(count,'count')

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
      
      // Calculate daily expense total in USD
      let dailyExpenseTotalUSD = 0;
      dayTransactions.forEach(transaction => {
        if (transaction.type === 'expense') {
          dailyExpenseTotalUSD += transaction.amount; // amount is always USD
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
      
      // Build spent attribute (USD)
      const spentAttr = dailyExpenseTotalUSD > 0
        ? ` spent="${Math.round(dailyExpenseTotalUSD * 100) / 100} USD"`
        : '';

      // Build allocated attribute (USD)
      let allocatedAttr = '';
      if (dailyAllocationTotals.size > 0) {
        const allocatedParts: string[] = [];
        dailyAllocationTotals.forEach((total, cur) => {
          allocatedParts.push(`${total.toFixed(2)} ${cur}`);
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
        
        // Add individual expense transactions in XML format (show original currency)
        sortedExpenseTransactions.forEach(t => {
          const displayAmt = t.originalAmount ?? t.amount;
          const displayCur = t.originalCurrency ?? t.currency;
          result += `    <tx id="${t.ID}" amt="${displayAmt}" cur="${displayCur}" desc="${t.description}"/>\n`;
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
    
    // Get all expense transactions (all in USD) from budget start to target date
    const budgetTransactions = allTransactions.filter(t =>
      t.type === 'expense' &&
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
    
    // Check for existing budget with same original currency
    const existingBudget = await Budget.findOne({
      user: user._id,
      originalCurrency: currency.toUpperCase()
    });

    if (existingBudget) {
      return `You already have a budget for ${currency.toUpperCase()}. Please delete it first.`;
    }

    // Convert to USD
    const origTotal = parseInt(totalAmount);
    const origDaily = parseInt(dailyAmount);
    const { amountUSD: totalAmountUSD, exchangeRate } = await convertToUSD(origTotal, currency);
    const { amountUSD: dailyAmountUSD } = await convertToUSD(origDaily, currency);

    // Create and save budget with auto-generated ID
    const budget = new Budget({
      user: user._id,
      days: parseInt(days),
      totalAmount: totalAmountUSD,
      dailyAmount: dailyAmountUSD,
      currency: 'USD',
      originalTotalAmount: origTotal,
      originalDailyAmount: origDaily,
      originalCurrency: currency.toUpperCase(),
      exchangeRate,
      startDate: parsedStartDate.utc().toDate(),
      endDate: parsedEndDate.utc().toDate()
    });

    await budget.save();

    // Format response
    const formattedStartDate = parsedStartDate.format('DD.MM.YYYY');
    const formattedEndDate = parsedEndDate.format('DD.MM.YYYY');
    const durationDays = parsedEndDate.diff(parsedStartDate, 'days');
    const dailyAllocation = Math.round(origTotal / durationDays * 100) / 100;

    return `Budget created successfully: ${origTotal} ${currency.toUpperCase()} (${totalAmountUSD} USD) from ${formattedStartDate} to ${formattedEndDate} (${durationDays} days, ${dailyAllocation} ${currency.toUpperCase()}/day)`;
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
    
    const displayCurrency = budget.originalCurrency || budget.currency;
    const displayAmount = budget.originalTotalAmount || budget.totalAmount;
    return `Budget for ${displayCurrency} (${displayAmount} ${displayCurrency}, ${formattedStartDate} - ${formattedEndDate}) has been deleted successfully.`;
  } catch (error) {
    console.error('Error deleting budget:', error);
    return "Error deleting budget.";
  }
}

export async function getBudgetInfoString(user: IUser): Promise<string> {
  try {
    const budgets = await Budget.find({ user: user._id }).sort({ created: -1 });
    
    if (budgets.length === 0) {
      return "<budgets>No budgets found</budgets>";
    }
    
    // XML opening tag
    let result = "<budgets>\n";
    
    const now = new Date();
    
    // XML data rows
    result += budgets.map(budget => {
      const startDate = moment(budget.startDate).format('DD.MM.YYYY');
      const endDate = moment(budget.endDate).format('DD.MM.YYYY');
      const daysRemaining = Math.max(0, Math.ceil((budget.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
      
      // Calculate daily allocation based on total budget period
      const totalDays = Math.ceil((budget.endDate.getTime() - budget.startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const dailyAllocation = Math.round(budget.totalAmount / totalDays * 100) / 100;
      
      const status = budget.endDate <= now ? 'expired' : 'active';
      
      const displayCur = budget.originalCurrency || budget.currency;
      const displayTotal = budget.originalTotalAmount || budget.totalAmount;
      return `  <budget id="${budget.ID}" cur="${displayCur}" total="${displayTotal}" total_usd="${budget.totalAmount}" start="${startDate}" end="${endDate}" days_rem="${daysRemaining}" daily_usd="${dailyAllocation}" status="${status}"/>`;
    }).join('\n');
    
    result += "\n</budgets>";
    
    return result;
  } catch (error) {
    console.error('Error formatting budget info:', error);
    return "Error retrieving budget information.";
  }
}