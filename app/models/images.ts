import * as mongoose from 'mongoose'
import moment from 'moment'
import { IImage, ImageProvider } from '../interfaces/image'

// Define schema
const Schema = mongoose.Schema

const ImageSchema = new Schema<IImage>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  prompt: { type: String, required: true },
  created: { type: Date, default: () => moment().utc() },
  imageUrl: { type: String },
  telegramFileId: { type: String },
  localPath: { type: String },
  provider: { type: String, enum: ['openai', 'getimg', 'unknown'], default: 'unknown' }
})

// Add indexes for faster queries
ImageSchema.index({ user: 1, created: -1 })

export default mongoose.model('Image', ImageSchema)