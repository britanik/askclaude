import * as mongoose from 'mongoose'
import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'
import { MongoClient } from 'mongodb'
import Message from '../app/models/messages'

// Load environment variables
if (fs.existsSync(path.join(__dirname, '../.env'))) {
  dotenv.config({ path: path.join(__dirname, '../.env') })
  console.log('-- .ENV loaded from ../.env')
}

// Connect to MongoDB directly using MongoClient for better control
async function cleanupEmbeddedMessages() {
  let client;
  try {
    // Connect directly to MongoDB
    const mongoString = process.env.MONGO_STRING
    console.log('Connecting to MongoDB...')
    
    client = new MongoClient(mongoString)
    await client.connect()
    console.log('Connected to MongoDB')
    
    // Get the database name from connection string or use 'test' as default
    let dbName = 'test'; // Default database name
    try {
      const urlParts = mongoString.split('/');
      if (urlParts.length > 3) {
        const dbPart = urlParts[3].split('?')[0];
        if (dbPart) dbName = dbPart;
      }
    } catch (e) {
      console.log('Could not parse database name from connection string, using "test"')
    }
    
    console.log(`Using database: ${dbName}`)
    const db = client.db(dbName)
    
    // Create a backup collection first
    console.log('Creating a backup of threads collection...')
    const backupCollectionName = 'threads_backup_' + Date.now()
    
    const threadsCollection = db.collection('threads')
    const backupCollection = db.collection(backupCollectionName)
    
    // Copy all documents from threads to backup
    const threads = await threadsCollection.find({}).toArray()
    if (threads.length > 0) {
      await backupCollection.insertMany(threads)
      console.log(`Backup created successfully as collection: ${backupCollectionName} with ${threads.length} documents`)
    } else {
      console.log('No threads found to backup')
      return
    }

    // Verify that messages were migrated successfully by connecting to Mongoose
    await mongoose.connect(process.env.MONGO_STRING)
    const messageCount = await Message.countDocuments()
    console.log(`Found ${messageCount} messages in the new Message collection`)

    if (messageCount === 0) {
      console.error('No messages found in the new collection. Aborting cleanup to prevent data loss.')
      return
    }
    await mongoose.disconnect()

    // Get all thread IDs
    const threadIds = await threadsCollection.distinct('_id')
    console.log(`Found ${threadIds.length} threads to process`)

    // Process threads in batches to avoid memory issues
    const batchSize = 100
    let processedCount = 0

    for (let i = 0; i < threadIds.length; i += batchSize) {
      const batch = threadIds.slice(i, i + batchSize)
      
      // For each thread in the batch, remove the messages array
      const result = await threadsCollection.updateMany(
        { _id: { $in: batch } },
        { $unset: { messages: "" } }
      )
      
      processedCount += result.modifiedCount
      console.log(`Processed batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(threadIds.length/batchSize)}, removed messages from ${result.modifiedCount} threads`)
    }

    console.log(`Cleanup completed. Removed embedded messages from ${processedCount} threads.`)
    console.log(`A backup of the original data was created in collection: ${backupCollectionName}`)

  } catch (error) {
    console.error('Error during cleanup:', error)
  } finally {
    // Close connections
    if (client) await client.close()
    console.log('Disconnected from MongoDB')
  }
}

// Ask for confirmation before running
console.log('WARNING: This script will remove the embedded messages from all threads.')
console.log('Make sure you have run the migration script first and verified the data.')
console.log('A backup will be created, but proceed with caution.')
console.log('Type "CONFIRM" to proceed:')

process.stdin.once('data', (data) => {
  const input = data.toString().trim()
  if (input === 'CONFIRM') {
    cleanupEmbeddedMessages()
      .then(() => console.log('Cleanup completed'))
      .catch(err => console.error('Cleanup failed:', err))
      .finally(() => process.exit())
  } else {
    console.log('Cleanup aborted.')
    process.exit()
  }
})