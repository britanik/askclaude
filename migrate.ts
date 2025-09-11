import { connect } from 'mongoose'
import Transaction from './app/models/transactions'
import Account from './app/models/accounts'
import { Budget } from './app/models/budgets'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'

// Load environment variables
if (fs.existsSync(path.join(__dirname, '.env'))) {
  dotenv.config({ path: path.join(__dirname, '.env') })
} else if (fs.existsSync(path.join(__dirname, '../.env'))) {
  dotenv.config({ path: path.join(__dirname, "../.env") })
}

async function migrateToSimpleIDs() {
  try {
    console.log('🔄 Starting migration to simple IDs...')
    
    // Connect to MongoDB
    await connect(process.env.MONGO_STRING!)
    console.log('✅ Connected to MongoDB')
    
    // Backup current state
    console.log('📋 Creating backup of current IDs...')
    const transactionBackup = await Transaction.find({}, { _id: 1, ID: 1 }).lean()
    const accountBackup = await Account.find({}, { _id: 1, ID: 1 }).lean()
    const budgetBackup = await Budget.find({}, { _id: 1, ID: 1 }).lean()
    
    console.log(`Found ${transactionBackup.length} transactions, ${accountBackup.length} accounts, ${budgetBackup.length} budgets`)
    
    // Save backup to file
    const backupData = {
      timestamp: new Date(),
      transactions: transactionBackup,
      accounts: accountBackup,
      budgets: budgetBackup
    }
    const backupFileName = `migration-backup-${Date.now()}.json`
    fs.writeFileSync(backupFileName, JSON.stringify(backupData, null, 2))
    console.log(`💾 Backup saved to ${backupFileName}`)
    
    // Migrate Transactions
    console.log('\n🔄 Migrating Transactions...')
    const transactions = await Transaction.find({}).sort({ created: 1 })
    for (let i = 0; i < transactions.length; i++) {
      const newID = i + 1
      await Transaction.findByIdAndUpdate(transactions[i]._id, { ID: newID })
      console.log(`  Transaction ${transactions[i].ID} → ${newID}`)
    }
    console.log(`✅ Migrated ${transactions.length} transactions`)
    
    // Migrate Accounts
    console.log('\n🔄 Migrating Accounts...')
    const accounts = await Account.find({}).sort({ created: 1 })
    for (let i = 0; i < accounts.length; i++) {
      const newID = i + 1
      await Account.findByIdAndUpdate(accounts[i]._id, { ID: newID })
      console.log(`  Account ${accounts[i].ID} → ${newID}`)
    }
    console.log(`✅ Migrated ${accounts.length} accounts`)
    
    // Migrate Budgets
    console.log('\n🔄 Migrating Budgets...')
    const budgets = await Budget.find({}).sort({ created: 1 })
    for (let i = 0; i < budgets.length; i++) {
      const newID = i + 1
      await Budget.findByIdAndUpdate(budgets[i]._id, { ID: newID })
      console.log(`  Budget ${budgets[i].ID} → ${newID}`)
    }
    console.log(`✅ Migrated ${budgets.length} budgets`)
    
    // Verification
    console.log('\n🔍 Verifying migration...')
    
    // Check for duplicate IDs
    const dupTransactions = await Transaction.aggregate([
      { $group: { _id: '$ID', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } }
    ])
    
    const dupAccounts = await Account.aggregate([
      { $group: { _id: '$ID', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } }
    ])
    
    const dupBudgets = await Budget.aggregate([
      { $group: { _id: '$ID', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } }
    ])
    
    if (dupTransactions.length > 0 || dupAccounts.length > 0 || dupBudgets.length > 0) {
      console.error('❌ Found duplicate IDs after migration!')
      console.error('Duplicate transactions:', dupTransactions)
      console.error('Duplicate accounts:', dupAccounts)
      console.error('Duplicate budgets:', dupBudgets)
      return
    }
    
    // Check ID sequences
    const maxTransactionID = await Transaction.findOne({}, {}, { sort: { ID: -1 } })
    const maxAccountID = await Account.findOne({}, {}, { sort: { ID: -1 } })
    const maxBudgetID = await Budget.findOne({}, {}, { sort: { ID: -1 } })
    
    console.log('\n📊 Migration Summary:')
    console.log(`  Transactions: 1 → ${maxTransactionID?.ID || 0} (${transactions.length} total)`)
    console.log(`  Accounts: 1 → ${maxAccountID?.ID || 0} (${accounts.length} total)`)
    console.log(`  Budgets: 1 → ${maxBudgetID?.ID || 0} (${budgets.length} total)`)
    
    console.log('\n✅ Migration completed successfully!')
    console.log(`\n💾 Backup saved as: ${backupFileName}`)
    console.log('\n📝 Next steps:')
    console.log('  1. Deploy the updated models with auto-increment middleware')
    console.log('  2. Test creating new records to ensure auto-increment works')
    console.log('  3. Keep the backup file until you verify everything works correctly')
    
  } catch (error) {
    console.error('❌ Migration failed:', error)
    console.log('\n💡 If this fails, you can restore from the backup file using the rollback function')
  } finally {
    process.exit(0)
  }
}

async function rollbackMigration(backupFilePath: string) {
  try {
    console.log('🔄 Rolling back migration...')
    
    if (!fs.existsSync(backupFilePath)) {
      console.error(`❌ Backup file not found: ${backupFilePath}`)
      return
    }
    
    await connect(process.env.MONGO_STRING!)
    console.log('✅ Connected to MongoDB')
    
    const backupData = JSON.parse(fs.readFileSync(backupFilePath, 'utf8'))
    console.log(`📂 Loaded backup from ${backupFilePath}`)
    
    // Restore transactions
    console.log('🔄 Restoring transactions...')
    for (const tx of backupData.transactions) {
      await Transaction.findByIdAndUpdate(tx._id, { ID: tx.ID })
    }
    console.log(`✅ Restored ${backupData.transactions.length} transactions`)
    
    // Restore accounts
    console.log('🔄 Restoring accounts...')
    for (const acc of backupData.accounts) {
      await Account.findByIdAndUpdate(acc._id, { ID: acc.ID })
    }
    console.log(`✅ Restored ${backupData.accounts.length} accounts`)
    
    // Restore budgets
    console.log('🔄 Restoring budgets...')
    for (const budget of backupData.budgets) {
      await Budget.findByIdAndUpdate(budget._id, { ID: budget.ID })
    }
    console.log(`✅ Restored ${backupData.budgets.length} budgets`)
    
    console.log('\n✅ Rollback completed successfully!')
  } catch (error) {
    console.error('❌ Rollback failed:', error)
  } finally {
    process.exit(0)
  }
}

// Parse command line arguments
const args = process.argv.slice(2)

if (args[0] === 'rollback') {
  if (!args[1]) {
    console.error('❌ Usage: npm run migrate:rollback <backup-file-path>')
    console.error('Example: npm run migrate:rollback migration-backup-1234567890.json')
    process.exit(1)
  }
  rollbackMigration(args[1])
} else {
  migrateToSimpleIDs()
}