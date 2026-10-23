import { contactTicket, nextTicketStatus, type ContactFormValues, type SupportTicket } from '../domain/support';
import type { AccountMessagesRepository, AdminSupportRepository, ContactRepository } from './supportRepositories';

export function createAdminSupportService(repository: AdminSupportRepository) {
  return {
    listMessages: () => repository.listMessages(),
    sendMessage: (userId: string, title: string, body: string) =>
      repository.insertMessage({ user_id: userId, title: title.trim(), body: body.trim() }),
    listTickets: () => repository.listTickets(),
    async toggleTicket(ticket: Pick<SupportTicket, 'id' | 'status'>) {
      const status = nextTicketStatus(ticket.status);
      await repository.setTicketStatus(ticket.id, status);
      return status;
    },
  };
}
export function createAccountMessagesService(repository: AccountMessagesRepository) {
  return {
    list: (userId: string) => repository.list(userId),
    markRead: (userId: string, messageId: string) => repository.markRead(userId, messageId),
    unreadCount: (userId: string) => repository.unreadCount(userId),
  };
}
export function createContactService(repository: ContactRepository) {
  return { submit: (values: ContactFormValues) => repository.insertTicket(contactTicket(values)) };
}
