import { useCallback, useEffect, useRef, useState } from 'react';
import { accountMessages } from '../messages';
import { MESSAGES_READ_EVENT, type SupportMessage } from '../domain/support';

type MessageState = { ownerId: string | undefined; messages: SupportMessage[]; loading: boolean; error?: unknown };

export function useAccountMessages(userId?: string) {
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  const owner = useRef(userId);
  owner.current = userId;
  const generation = useRef({ active: false });
  const [state, setState] = useState<MessageState>({ ownerId: userId, messages: [], loading: !!userId });

  useEffect(() => {
    const current = { active: true };
    generation.current = current;
    setState({ ownerId: userId, messages: [], loading: !!userId });
    if (userId) void (async () => {
      try {
        const messages = await accountMessages.list(userId);
        if (messages.some(message => message.user_id !== userId)) throw Error('Message owner mismatch');
        if (current.active && owner.current === userId && generation.current === current) {
          setState({ ownerId: userId, messages, loading: false });
        }
      } catch (error) {
        if (current.active && owner.current === userId && generation.current === current) {
          console.error('Failed to fetch messages:', error);
          setState({ ownerId: userId, messages: [], loading: false, error });
        }
      }
    })();
    return () => { current.active = false; };
  }, [userId, attempt]);

  const markAsRead = useCallback(async (message: SupportMessage) => {
    if (!userId || owner.current !== userId || message.is_read || message.user_id !== userId) return;
    const current = generation.current;
    const isCurrent = () => current.active && owner.current === userId && generation.current === current;
    setState(previous => previous.ownerId === userId
      ? { ...previous, messages: previous.messages.map(item => item.id === message.id ? { ...item, is_read: true } : item) }
      : previous);
    try {
      await accountMessages.markRead(userId, message.id);
      if (isCurrent()) window.dispatchEvent(new Event(MESSAGES_READ_EVENT));
    } catch (error) {
      if (!isCurrent()) return;
      console.error('Failed to mark message as read:', error);
      setState(previous => previous.ownerId === userId
        ? { ...previous, messages: previous.messages.map(item => item.id === message.id ? { ...item, is_read: false } : item) }
        : previous);
    }
  }, [userId]);

  // Do not expose the previous owner's rows even in the render before effect cleanup.
  const visible = state.ownerId === userId ? state : { messages: [], loading: !!userId, error: undefined };
  return { messages: visible.messages, loading: visible.loading, error: visible.error, retry, markAsRead };
}
