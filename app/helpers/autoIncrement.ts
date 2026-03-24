import * as mongoose from 'mongoose'
export function createAutoIncrementMiddleware(modelName: string) {
  return async function() {
    if (this.isNew && !this.ID) {
      const lastRecord: any = await mongoose.model(modelName).findOne({}, {}, { sort: { 'ID': -1 } });
      this.ID = lastRecord ? lastRecord.ID + 1 : 1;
    }
  };
}