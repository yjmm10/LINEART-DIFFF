

import React, { createContext, useContext, useRef } from 'react';

type Zone = string;

interface SyncContextType {
    register: (zone: Zone, path: string, expand: () => void) => void;
    unregister: (zone: Zone, path: string) => void;
    syncTo: (targetZone: Zone, path: string) => void;
    registerZone: (zone: Zone, handler: (path: string) => void) => void;
    unregisterZone: (zone: Zone) => void;
}

const SyncContext = createContext<SyncContextType>({
    register: () => {}, unregister: () => {}, syncTo: () => {}, registerZone: () => {}, unregisterZone: () => {}
});

export const useSync = () => useContext(SyncContext);

export const SyncProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
    const registry = useRef<Map<string, () => void>>(new Map());
    const zoneHandlers = useRef<Map<string, (path: string) => void>>(new Map());

    const getKey = (zone: Zone, path: string) => `${zone}:${path}`;

    const register = (zone: Zone, path: string, expand: () => void) => {
        registry.current.set(getKey(zone, path), expand);
    };

    const unregister = (zone: Zone, path: string) => {
        registry.current.delete(getKey(zone, path));
    };

    const registerZone = (zone: Zone, handler: (path: string) => void) => {
        zoneHandlers.current.set(zone, handler);
    };

    const unregisterZone = (zone: Zone) => {
        zoneHandlers.current.delete(zone);
    };

    const syncTo = (targetZone: Zone, path: string) => {
        // 1. Check if there is a Zone Handler (e.g. Text Mode Controller)
        const zoneHandler = zoneHandlers.current.get(targetZone);
        if (zoneHandler) {
            zoneHandler(path);
            return; 
        }

        // 2. Existing Tree Mode Logic (DOM & Registry)
        const parts = path.split('/').filter(p => p !== '#' && p !== '');
        let currentPath = '#';

        const expandPath = (p: string) => {
            const expandFn = registry.current.get(getKey(targetZone, p));
            if (expandFn) expandFn();
        };

        // Always try to expand root
        expandPath('#');

        // Expand each segment down to the target
        parts.forEach(part => {
            currentPath += `/${part}`;
            expandPath(currentPath);
        });

        // Scroll and highlight attempt with retries
        const attemptScroll = (attemptsLeft: number) => {
            const selector = `[data-sync-id="${getKey(targetZone, path)}"]`;
            const el = document.querySelector(selector);
            
            if (el) {
                // Use block: 'center' to keep context visible
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.classList.add('bg-yellow-100/50', 'ring-2', 'ring-yellow-400', 'rounded');
                setTimeout(() => {
                    el.classList.remove('bg-yellow-100/50', 'ring-2', 'ring-yellow-400', 'rounded');
                }, 1500);
            } else if (attemptsLeft > 0) {
                // If element is inside a freshly expanded detail, it might take a render cycle
                setTimeout(() => attemptScroll(attemptsLeft - 1), 50);
            }
        };

        // Start attempts
        attemptScroll(5);
    };

    return (
        <SyncContext.Provider value={{ register, unregister, syncTo, registerZone, unregisterZone }}>
            {children}
        </SyncContext.Provider>
    );
};
