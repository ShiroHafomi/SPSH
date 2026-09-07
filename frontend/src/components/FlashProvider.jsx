import { createContext, useContext, useState, useCallback } from 'react';
import { normalizeFlashInput } from './flash.js';

const FlashContext = createContext(null);

export function FlashProvider({ children }) {
  const [messages, setMessages] = useState([]);

  const addFlash = useCallback((message, type = 'success') => {
    const normalized = normalizeFlashInput(message, type);
    setMessages((prev) => [...prev, { ...normalized, id: Date.now() + Math.random() }]);
  }, []);

  const removeFlash = useCallback((id) => {
    setMessages((prev) => prev.filter((msg) => msg.id !== id));
  }, []);

  return (
    <FlashContext.Provider value={{ messages, addFlash, removeFlash }}>
      {children}
    </FlashContext.Provider>
  );
}

export function useFlash() {
  const context = useContext(FlashContext);
  if (!context) {
    throw new Error('useFlash must be used within a FlashProvider');
  }
  return context;
}