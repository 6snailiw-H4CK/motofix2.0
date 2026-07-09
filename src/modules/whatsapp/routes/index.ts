export const whatsappApiRoutes = {
  connect: '/api/whatsapp/connect',
  status: '/api/whatsapp/status',
  qrcode: '/api/whatsapp/qrcode',
  disconnect: '/api/whatsapp/disconnect',
  reconnect: '/api/whatsapp/reconnect',
  send: '/api/whatsapp/send',
  sendDueReminders: '/api/whatsapp/reminders/send-due',
  messages: '/api/whatsapp/messages',
  contacts: '/api/whatsapp/contacts',
  automations: '/api/whatsapp/automations',
} as const;
