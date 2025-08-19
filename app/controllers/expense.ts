import { IAccount } from "../interfaces/accounts";
import { IUser } from "../interfaces/users";
import { ITransaction } from "../interfaces/transactions";
import Account from "../models/accounts";
import Transaction from "../models/transactions";
import moment from "moment";

export interface ICreateAccountParams {
  user: IUser;
  name: string;
  type: string;
  currency: string;
  initial_balance?: number;
  isDefault?: boolean;
}

export interface IUpdateAccountParams {
  user: IUser;
  account_id: string;
  name?: string;
  type?: string;
  currency?: string;
  isDefault?: boolean;
}

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
    return accounts.map((account, index) => 
      `${index + 1}. ${account.name}${account.isDefault ? ' (Default)' : ''} - ID: ${account._id}`
    ).join('\n');
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
    
    return transactions.map((transaction, index) => {
      const date = moment(transaction.date).format('MM/DD');
      const accountName = (transaction.account as any)?.name || 'Unknown Account';
      const typeSymbol = transaction.type === 'income' ? '+' : '-';
      
      return `${index + 1}. ${date} ${typeSymbol}${transaction.amount} ${transaction.currency} (${accountName}) - ${transaction.description}`;
    }).join('\n');
  } catch (error) {
    console.error('Error formatting recent transactions:', error);
    return "Error retrieving transactions.";
  }
}

export async function createAccount(params: ICreateAccountParams): Promise<string> {
  console.log(params, 'createAccount')
  try {
    const { user, name, type, currency, initial_balance, isDefault } = params;
    
    if (isDefault) {
      await Account.updateMany({ user: user._id }, { isDefault: false });
    }

    const account = new Account({
      user: user._id,
      name,
      type,
      currency,
      balance: initial_balance || 0,
      isDefault: isDefault || false
    });

    await account.save();
    return `Account "${name}" created successfully with ID: ${account._id}`;
  } catch (error) {
    console.error('Error creating account:', error);
    return "Error creating account.";
  }
}

export async function updateAccount(params: IUpdateAccountParams): Promise<string> {
  console.log(params, 'updateAccount')
  try {
    const { user, account_id, name, type, currency, isDefault } = params;
    const updates = { name, type, currency, isDefault };
    
    const account = await Account.findOne({ _id: account_id, user: user._id });
    if (!account) {
      return "Account not found.";
    }

    if (isDefault) {
      await Account.updateMany({ user: user._id }, { isDefault: false });
    }

    await Account.findByIdAndUpdate(account_id, updates);
    return `Account updated successfully.`;
  } catch (error) {
    console.error('Error updating account:', error);
    return "Error updating account.";
  }
}

export interface ITrackExpenseParams {
  user: IUser;
  account_id: string;
  amount: number;
  description: string;
  date?: Date;
}

export async function trackExpense(params: ITrackExpenseParams): Promise<string> {
  try {
    const { user, account_id, amount, description, date } = params;
    
    const account = await Account.findOne({ _id: account_id, user: user._id });
    if (!account) {
      return "Account not found.";
    }

    const transaction = new Transaction({
      user: user._id,
      account: account_id,
      type: 'expense',
      amount: Math.abs(amount),
      currency: account.currency,
      date: date || new Date(),
      description
    });

    await transaction.save();
    
    account.balance -= Math.abs(amount);
    await account.save();

    return `Expense of ${Math.abs(amount)} ${account.currency} tracked successfully.`;
  } catch (error) {
    console.error('Error tracking expense:', error);
    return "Error tracking expense.";
  }
}