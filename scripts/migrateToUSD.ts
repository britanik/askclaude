import * as mongoose from 'mongoose'
import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'
import Transaction from '../app/models/transactions'
import { Budget } from '../app/models/budgets'
import { convertToUSD } from '../app/services/currency'

// Load environment variables
if (fs.existsSync(path.join(__dirname, '../.env'))) {
  dotenv.config({ path: path.join(__dirname, '../.env') })
  console.log('-- .ENV loaded from ../.env')
}

async function migrateToUSD() {
  try {
    await mongoose.connect(process.env.MONGO_STRING)
    console.log('Connected to MongoDB')

    // Migrate Transactions
    const transactions = await Transaction.find({ originalAmount: { $exists: false } })
    console.log(`Found ${transactions.length} transactions to migrate`)

    let txSuccess = 0
    let txErrors = 0

    for (const tx of transactions) {
      try {
        const { amountUSD, exchangeRate } = await convertToUSD(tx.amount, tx.currency)

        tx.originalAmount = tx.amount
        tx.originalCurrency = tx.currency
        tx.exchangeRate = exchangeRate
        tx.amount = amountUSD
        tx.currency = 'USD'

        await tx.save()
        txSuccess++
      } catch (error) {
        console.error(`Error migrating transaction ${tx.ID}: ${error.message}`)
        txErrors++
      }
    }

    console.log(`Transactions: ${txSuccess} migrated, ${txErrors} errors`)

    // Migrate Budgets
    const budgets = await Budget.find({ originalTotalAmount: { $exists: false } })
    console.log(`Found ${budgets.length} budgets to migrate`)

    let budgetSuccess = 0
    let budgetErrors = 0

    for (const budget of budgets) {
      try {
        const { amountUSD: totalUSD, exchangeRate } = await convertToUSD(budget.totalAmount, budget.currency)
        const { amountUSD: dailyUSD } = await convertToUSD(budget.dailyAmount, budget.currency)

        budget.originalTotalAmount = budget.totalAmount
        budget.originalDailyAmount = budget.dailyAmount
        budget.originalCurrency = budget.currency
        budget.exchangeRate = exchangeRate
        budget.totalAmount = totalUSD
        budget.dailyAmount = dailyUSD
        budget.currency = 'USD'

        await budget.save()
        budgetSuccess++
      } catch (error) {
        console.error(`Error migrating budget ${budget.ID}: ${error.message}`)
        budgetErrors++
      }
    }

    console.log(`Budgets: ${budgetSuccess} migrated, ${budgetErrors} errors`)
    console.log('Migration complete!')

  } catch (error) {
    console.error('Migration failed:', error)
  } finally {
    await mongoose.disconnect()
  }
}

migrateToUSD()
