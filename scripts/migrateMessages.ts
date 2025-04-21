import * as mongoose from 'mongoose'
import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'
import Message from '../app/models/messages'

// Load environment variables
if (fs.existsSync(path.join(__dirname, '../.env'))) {
  dotenv.config({ path: path.join(__dirname, '../.env') })
  console.log('-- .ENV loaded from ../.env')
}

// Define the old Thread schema structure for migration purposes
const OldThreadSchema = new mongoose.Schema({
  _id: String,
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  created: Date,
  messages: [{
    role: String,
    content: String,
    tool_calls: Array,
    created: Date,
    name: String,
    images: [String],
    mediaGroupId: String
  }]
})

const OldThread = mongoose.model('OldThread', OldThreadSchema, 'threads')

async function migrateMessages() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_STRING)
    console.log('Connected to MongoDB')

    // Get all threads
    const threads = await OldThread.find({})
    console.log(`Found ${threads.length} threads to migrate`)

    let totalMessages = 0
    let successfullyMigrated = 0

    // Process each thread
    for (const thread of threads) {
      if (!thread.messages || thread.messages.length === 0) {
        console.log(`Thread ${thread._id} has no messages, skipping`)
        continue
      }

      totalMessages += thread.messages.length
      console.log(`Migrating ${thread.messages.length} messages from thread ${thread._id}`)

      // Create new message documents for each message in the thread
      const messagePromises = thread.messages.map(msg => {
        const newMessage = new Message({
          thread: thread._id,
          role: msg.role,
          content: msg.content,
          tool_calls: msg.tool_calls,
          created: msg.created || new Date(),
          name: msg.name,
          images: msg.images,
          mediaGroupId: msg.mediaGroupId
        })

        return newMessage.save()
      })

      // Wait for all messages to be saved
      const results = await Promise.allSettled(messagePromises)
      
      // Count successful migrations
      const successful = results.filter(r => r.status === 'fulfilled').length
      successfullyMigrated += successful

      console.log(`Successfully migrated ${successful}/${thread.messages.length} messages from thread ${thread._id}`)
    }

    console.log('Migration summary:')
    console.log(`Total threads: ${threads.length}`)
    console.log(`Total messages: ${totalMessages}`)
    console.log(`Successfully migrated: ${successfullyMigrated}`)
    console.log(`Migration completion: ${(successfullyMigrated / totalMessages * 100).toFixed(2)}%`)

  } catch (error) {
    console.error('Error during migration:', error)
  } finally {
    // Close MongoDB connection
    await mongoose.disconnect()
    console.log('Disconnected from MongoDB')
  }
}

// Run the migration
migrateMessages()
  .then(() => console.log('Migration completed'))
  .catch(err => console.error('Migration failed:', err))