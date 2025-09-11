import * as mongoose from 'mongoose'
export function createAutoIncrementMiddleware(modelName: string) {
  return async function(next: mongoose.CallbackWithoutResultAndOptionalError) {
    if (this.isNew && !this.ID) {
      try {
        // Find the highest ID and increment by 1
        const lastRecord = await mongoose.model(modelName).findOne({}, {}, { sort: { 'ID': -1 } });
        this.ID = lastRecord ? lastRecord.ID + 1 : 1;
        next();
      } catch (error) {
        next(error);
      }
    } else {
      next();
    }
  };
}