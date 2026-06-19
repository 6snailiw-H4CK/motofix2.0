import { useEffect, useRef, useState } from 'react';
import type { AppView, ColorMode } from '../types';
import type { ServiceListFilter } from './useMaintenanceStats';

export type AppToastState = { message: string; type: 'success' | 'error' } | null;

const getInitialColorMode = (): ColorMode => {
  if (typeof window === 'undefined') return 'light';
  const saved = window.localStorage.getItem('motofix-theme');
  return saved === 'dark' ? 'dark' : 'light';
};

export const useAppShellState = () => {
  const [view, setView] = useState<AppView>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState<AppToastState>(null);
  const [isNewService, setIsNewService] = useState(false);
  const [serviceListFilter, setServiceListFilter] = useState<ServiceListFilter>('all');
  const [expandedTopService, setExpandedTopService] = useState<string | null>(null);
  const [colorMode, setColorMode] = useState<ColorMode>(getInitialColorMode);
  const scrollRaf = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const applyScroll = () => {
      document.documentElement.style.setProperty('--scroll-offset', `${window.scrollY}px`);
      scrollRaf.current = null;
    };

    const handleScroll = () => {
      if (scrollRaf.current === null) {
        scrollRaf.current = window.requestAnimationFrame(applyScroll);
      }
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (scrollRaf.current !== null) window.cancelAnimationFrame(scrollRaf.current);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.toggle('retro', colorMode === 'light');
    document.documentElement.classList.toggle('light', colorMode === 'light');
    try {
      window.localStorage.setItem('motofix-theme', colorMode);
    } catch {
      /* ignore */
    }
  }, [colorMode]);

  return {
    colorMode,
    expandedTopService,
    isNewService,
    searchQuery,
    serviceListFilter,
    setColorMode,
    setExpandedTopService,
    setIsNewService,
    setSearchQuery,
    setServiceListFilter,
    setToast,
    setView,
    toast,
    view,
  };
};
