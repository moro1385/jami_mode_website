import type { OutgoingMessage, SupportMessage, SupportTicket, TicketStatus, TicketWrite } from '../domain/support';

export interface AdminSupportRepository {
  listMessages(): Promise<SupportMessage[]>;
  insertMessage(message: OutgoingMessage): Promise<void>;
  listTickets(): Promise<SupportTicket[]>;
  setTicketStatus(id: string, status: TicketStatus): Promise<void>;
}
export interface AccountMessagesRepository {
  list(userId: string): Promise<SupportMessage[]>;
  markRead(userId: string, messageId: string): Promise<void>;
  unreadCount(userId: string): Promise<number | null>;
}
export interface ContactRepository {
  insertTicket(ticket: TicketWrite): Promise<void>;
}
