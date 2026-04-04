// Lightweight app store using React state lifted to App level
// Manages connections, tabs, and workspace state

import { useState, useCallback, useRef, useEffect } from 'react';
import { MongoApi } from '@/lib/mongo-api';

export function useAppStore() {
  const [connections, setConnections] = useState([]);
  const [activeConnections, setActiveConnections] = useState([]);
  const [tabs, setTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const [explorerState, setExplorerState] = useState({});
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const tabStateRef = useRef({});

  useEffect(() => {
    async function loadConnections() {
      try {
        const saved = await MongoApi.getSavedConnections();
        setConnections(saved);
      } catch {
        setConnections([]);
      }
    }
    loadConnections();
  }, []);

  const addConnection = useCallback((config) => {
    return MongoApi.saveConnection(config).then((saved) => {
      setConnections(prev => {
        if (prev.some(c => c.id === saved.id)) {
          return prev.map(c => (c.id === saved.id ? saved : c));
        }
        return [saved, ...prev];
      });
      return saved;
    });
  }, []);

  const updateConnection = useCallback((id, data) => {
    return MongoApi.saveConnection({ ...data, id }).then((saved) => {
      setConnections(prev => prev.map(c => c.id === id ? saved : c));
      return saved;
    });
  }, []);

  const removeConnection = useCallback((id) => {
    return MongoApi.removeConnection(id).finally(() => {
      setConnections(prev => prev.filter(c => c.id !== id));
      setActiveConnections(prev => prev.filter(c => c.connectionId !== id));
    });
  }, []);

  const connectToServer = useCallback((connectionId, meta) => {
    setActiveConnections(prev => {
      if (prev.some(c => c.connectionId === connectionId)) return prev;
      return [...prev, { connectionId, ...meta, connectedAt: Date.now() }];
    });
  }, []);

  const disconnectFromServer = useCallback((connectionId) => {
    setActiveConnections(prev => prev.filter(c => c.connectionId !== connectionId));
    setTabs(prev => prev.filter(t => t.connectionId !== connectionId));
  }, []);

  const openTab = useCallback((tab) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const newTab = { id, ...tab, dirty: false };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(id);
    return id;
  }, []);

  const closeTab = useCallback((tabId) => {
    setTabs(prev => {
      const idx = prev.findIndex(t => t.id === tabId);
      const next = prev.filter(t => t.id !== tabId);
      if (tabId === activeTabId && next.length > 0) {
        const newIdx = Math.min(idx, next.length - 1);
        setActiveTabId(next[newIdx].id);
      } else if (next.length === 0) {
        setActiveTabId(null);
      }
      return next;
    });
    delete tabStateRef.current[tabId];
  }, [activeTabId]);

  const updateTab = useCallback((tabId, data) => {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, ...data } : t));
  }, []);

  const reorderTabs = useCallback((fromIndex, toIndex) => {
    setTabs(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  const getTabState = useCallback((tabId) => {
    return tabStateRef.current[tabId] || {};
  }, []);

  const setTabState = useCallback((tabId, state) => {
    tabStateRef.current[tabId] = { ...tabStateRef.current[tabId], ...state };
  }, []);

  const toggleExplorerNode = useCallback((nodeKey) => {
    setExplorerState(prev => ({ ...prev, [nodeKey]: !prev[nodeKey] }));
  }, []);

  return {
    connections, addConnection, updateConnection, removeConnection,
    activeConnections, connectToServer, disconnectFromServer,
    tabs, activeTabId, setActiveTabId, openTab, closeTab, updateTab, reorderTabs,
    getTabState, setTabState,
    explorerState, toggleExplorerNode,
    sidebarWidth, setSidebarWidth,
  };
}