import { IUser } from "../interfaces/users";

export function getStep( user:IUser ):string {
  return user.step
}

export function getMessage( user:IUser, name:string ){
  if( user.messages[name] ){
    return user.messages[name]
  } else {
    return false
  }
}

export async function updateMessage(user, name: string, messageId: number | number[] | null) {
  user.messages[name] = messageId;
  return await user.save();
}

export async function blocked( user:IUser ){
  user.blocked = true
  return await user.save()
}

export async function updatePref(user:IUser, pref:string, val) {
  try {
    user.prefs[pref] = val
    return await user.save()
  } catch(err) { console.log(err) }
}

export async function addStep( user, step ):Promise<IUser>{
  user.step = step
  return await user.save()
}