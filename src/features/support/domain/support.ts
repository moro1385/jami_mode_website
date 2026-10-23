export interface SupportMessage {
  id: string;
  user_id: string;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
}
export interface SupportTicket {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  subject: string;
  message: string;
  status: string;
  created_at: string;
}
export type TicketStatus = 'pending' | 'resolved';
export type OutgoingMessage = Pick<SupportMessage, 'user_id' | 'title' | 'body'>;
export type TicketWrite = Pick<SupportTicket, 'first_name' | 'last_name' | 'email' | 'subject' | 'message'>;
export interface ContactFormValues { firstName: string; lastName: string; email: string; subject: string; message: string }

export function contactTicket(values: ContactFormValues): TicketWrite {
  return { first_name: values.firstName, last_name: values.lastName, email: values.email || null,
    subject: values.subject, message: values.message };
}
export function nextTicketStatus(status: string): TicketStatus {
  return status === 'pending' ? 'resolved' : 'pending';
}
export const MESSAGES_READ_EVENT = 'messages_read_updated';
