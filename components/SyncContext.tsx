
import React, { createContext, useContext, useRef } from 'react';

type Zone = 'editor' | 'diff';

interface SyncContextType {
    register: (zone: Zone, path: string, expand: () => void) => void;
    unregister: (zone: Zone, path: string) => void;
    syncTo: (targetZone: Zone, path: string) => void;
}

const SyncContext = createContext<SyncContextType>({
    register: () => {}, unregister: () => {}, syncTo: () => {}
});

export const useSync = () => useContext(SyncContext);

export const SyncProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
    const registry = useRef<Map<string, () => void>>(new Map());

    const getKey = (zone: Zone, path: string) => `${zone}:${path}`;

    const register = (zone: Zone, path: string, expand: () => void) => {
        registry.current.set(getKey(zone, path), expand);
    };

    const unregister = (zone: Zone, path: string) => {
        registry.current.delete(getKey(zone, path));
    };

    const syncTo = (targetZone: Zone, path: string) => {
        // Parse path parts to expand parents sequentially
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

        // Scroll and highlight with a slight delay to allow expansion rendering
        setTimeout(() => {
            const selector = `[data-sync-id="${getKey(targetZone, path)}"]`;
            const el = document.querySelector(selector);
            if (el) {
                // Use block: 'start' to ensure the element header is visible at the top
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                el.classList.add('bg-yellow-100/50', 'ring-2', 'ring-yellow-400', 'rounded');
                setTimeout(() => {
                    el.classList.remove('bg-yellow-100/50', 'ring-2', 'ring-yellow-400', 'rounded');
                }, 1500);
            }
        }, 150);
    };

    return (
        <SyncContext.Provider value={{ register, unregister, syncTo }}>
            {children}
        </SyncContext.Provider>
    );
};
