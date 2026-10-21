import { useEffect, useRef, useState } from 'react';
import type { AppView, ColorMode } from '../types';
import type { ServiceListFilter } from './useMaintenanceStats';

export type AppToastState = { message: string; type: 'success' | 'error' } | null;

const getInitialColorMode = (): ColorMode => {
  // Default to dark mode unless the user explicitly saved 'light'
  if (typeof window === 'undefined') return 'dark';
  const saved = window.localStorage.getItem('motofix-theme');
  return saved === 'light' ? 'light' : 'dark';
};

export const useAppShellState = () => {
  const [view, setView] = useState<AppView>('dashboard');
  const [clientScheduleReturnView, setClientScheduleReturnView] = useState<AppView>('clients-schedule');
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
    // Only toggle the `light` class for light mode. The `retro` stylesheet
    // produces gray/alternative visuals and should be opt-in, not automatic.
    document.documentElement.classList.toggle('light', colorMode === 'light');
    try {
      window.localStorage.setItem('motofix-theme', colorMode);
    } catch {
      /* ignore */
    }
  }, [colorMode]);

  useEffect(() => {
    const handleThemeChange = (event: Event) => {
      const mode = (event as CustomEvent<ColorMode>).detail;
      if (mode === 'dark' || mode === 'light') setColorMode(mode);
    };

    window.addEventListener('motofix-theme-change', handleThemeChange);
    return () => window.removeEventListener('motofix-theme-change', handleThemeChange);
  }, []);

  return {
    clientScheduleReturnView,
    colorMode,
    expandedTopService,
    isNewService,
    searchQuery,
    serviceListFilter,
    setColorMode,
    setClientScheduleReturnView,
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
