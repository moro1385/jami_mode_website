import { useEffect, useRef, useState } from 'react';
import { accountMessages } from '../messages';
import { MESSAGES_READ_EVENT } from '../domain/support';

export function useUnreadMessages(userId?: string) {
  const owner = useRef(userId);
  owner.current = userId;
  const [state, setState] = useState<{ ownerId?: string; count: number }>({ ownerId: userId, count: 0 });

  useEffect(() => {
    let active = true, serial = 0;
    setState({ ownerId: userId, count: 0 });
    if (!userId) return () => { active = false; };
    const refresh = async () => {
      const request = ++serial;
      try {
        const count = await accountMessages.unreadCount(userId);
        if (active && owner.current === userId && serial === request && count !== null) {
          setState({ ownerId: userId, count });
        }
      } catch {
        // A failed refresh keeps only this owner's previous count.
      }
    };
    void refresh();
    const interval = window.setInterval(refresh, 60000);
    window.addEventListener(MESSAGES_READ_EVENT, refresh);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener(MESSAGES_READ_EVENT, refresh);
    };
  }, [userId]);

  return state.ownerId === userId && userId ? state.count : 0;
}
