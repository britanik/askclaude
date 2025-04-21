import { IMenuButton } from "../interfaces/menu-button";

export const menuButtons = [
  { name: '/start', method: 'start' },
  { name: '/new', method: 'new' },
  { name: '/settings', method: 'settings' },
  { name: '/invite', method: 'invite' },
  { name: '/image', method: 'imageAskPrompt' },
  { name: '/run_scheduler', method: 'adminRunScheduler' },
  { name: '/admin', method: 'admin' },
  { name: '/pm', method: 'pm' },
  { name: '/updateUserSchema', method: 'updateUserSchema' }
];

export const isMenuClicked = ( msg ):IMenuButton | false => {
  // Остановим действие если была нажата одна из кнопок меню
  if( msg.text ){
    for( let btn of menuButtons ){
      // if msg.text equals btn.name or it ends with it
      if( msg.text == btn.name || msg.text.endsWith(btn.name) || msg.text.startsWith(btn.name) ){
        return btn
      }
    }
  }
  return false 
}