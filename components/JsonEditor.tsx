

import React, { useState, useRef, useEffect, useContext, createContext, useCallback } from 'react';
import { ChevronRight, ChevronDown, Plus, Trash2, X, FileType, ExternalLink, GripVertical, Copy, Check, FoldVertical, UnfoldVertical, ClipboardPaste } from 'lucide-react';
import { useSync } from './SyncContext';

// --- Mutation Context (For Global Moves) ---
interface JsonMutationContextType {
    handleGlobalMove: (fromPath: string, toPath: string, position: 'before' | 'after' | 'inside', operation: 'move' | 'copy', draggedValue?: any, fromZone?: string) => void;
}

const JsonMutationContext = createContext<JsonMutationContextType | null>(null);

// --- Helper: Path Traversal & Manipulation ---

const getPathParts = (path: string) => path.split('/').filter(p => p !== '#' && p !== '');

const getNodeByPath = (root: any, path: string) => {
    const parts = getPathParts(path);
    let current = root;
    for (const part of parts) {
        if (current && typeof current === 'object') {
            current = Array.isArray(current) ? current[parseInt(part)] : current[part];
        } else {
            return undefined;
        }
    }
    return current;
};

const getParentAndKey = (root: any, path: string) => {
    const parts = getPathParts(path);
    if (parts.length === 0) return { parent: null, key: null };
    
    const key = parts.pop()!;
    let parent = root;
    for (const part of parts) {
        parent = Array.isArray(parent) ? parent[parseInt(part)] : parent[part];
    }
    return { parent, key };
};

// --- Recursive Command Interface ---
interface RecursiveCommand {
    type: 'expand' | 'collapse';
    id: number;
}

// --- Editor Component ---

interface JsonEditorProps {
  data: any;
  onChange: (newData: any) => void;
  onDelete?: () => void;
  fieldKey?: string; 
  onKeyChange?: (newKey: string) => void; 
  isRoot?: boolean;
  defaultOpen?: boolean;
  path?: string; 
  index?: number;
  onFocusPath?: (path: string) => void;
  // Command passed from parent to force children to expand/collapse
  recursiveCommand?: RecursiveCommand;
  // Sync Props
  syncZone?: string;
  syncTarget?: string; 
}

const getDataType = (data: any): 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null' => {
  if (data === null) return 'null';
  if (Array.isArray(data)) return 'array';
  return typeof data as any;
};

const getInitialValue = (type: string) => {
    switch (type) {
        case 'object': return {};
        case 'array': return [];
        case 'string': return "new_value";
        case 'number': return 0;
        case 'boolean': return true;
        case 'null': return null;
        default: return "";
    }
};

const TypeSelector = ({ onSelect, onCancel }: { onSelect: (t: string) => void, onCancel: () => void }) => (
  <div 
    className="flex items-center gap-0.5 bg-white border border-zinc-900 rounded shadow-hard-sm absolute z-50 right-0 -top-9 p-1 animate-in fade-in zoom-in-95 duration-100 origin-bottom-right whitespace-nowrap"
    onMouseDown={(e) => e.stopPropagation()}
    onClick={(e) => e.stopPropagation()}
  >
      <button onClick={() => onSelect('object')} className="px-2 py-1 text-[10px] font-bold bg-zinc-50 hover:bg-zinc-200 text-zinc-900 border border-zinc-200 rounded-sm transition-colors" title="Object">Dict</button>
      <button onClick={() => onSelect('array')} className="px-2 py-1 text-[10px] font-bold bg-zinc-50 hover:bg-zinc-200 text-zinc-900 border border-zinc-200 rounded-sm transition-colors" title="Array">List</button>
      <button onClick={() => onSelect('string')} className="px-2 py-1 text-[10px] font-bold bg-zinc-50 hover:bg-zinc-200 text-emerald-700 border border-zinc-200 rounded-sm transition-colors" title="String">Str</button>
      <button onClick={() => onSelect('number')} className="px-2 py-1 text-[10px] font-bold bg-zinc-50 hover:bg-zinc-200 text-orange-600 border border-zinc-200 rounded-sm transition-colors" title="Number">123</button>
      <button onClick={() => onSelect('boolean')} className="px-2 py-1 text-[10px] font-bold bg-zinc-50 hover:bg-zinc-200 text-blue-600 border border-zinc-200 rounded-sm transition-colors" title="Boolean">T/F</button>
      <div className="w-[1px] h-4 bg-zinc-200 mx-0.5"></div>
      <button onClick={onCancel} className="p-1 text-rose-500 hover:bg-rose-100 rounded-sm"><X size={12}/></button>
  </div>
);

export const JsonEditor: React.FC<JsonEditorProps> = ({ 
  data, 
  onChange, 
  onDelete, 
  fieldKey, 
  onKeyChange, 
  isRoot = false, 
  defaultOpen = true,
  path,
  index,
  onFocusPath,
  recursiveCommand,
  syncZone = 'editor',
  syncTarget = 'diff'
}) => {
  // Initialize isOpen state. Prioritize recursiveCommand if present.
  const [isOpen, setIsOpen] = useState(() => {
    if (recursiveCommand) {
        return recursiveCommand.type === 'expand';
    }
    return defaultOpen;
  });
  
  const type = getDataType(data);
  const [localKey, setLocalKey] = useState(fieldKey || '');
  const [localValue, setLocalValue] = useState(data);
  
  // Internal command state to pass to children.
  // Initialize with props to ensure children get the correct command on mount.
  const [internalCommand, setInternalCommand] = useState<RecursiveCommand | undefined>(recursiveCommand);
  
  // Track the ID of the last processed parent command to avoid infinite loops or overwriting local toggles unnecessarily.
  const lastParentCmdId = useRef<number>(recursiveCommand?.id || 0);

  // Interaction States
  const [isChangingType, setIsChangingType] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  // DnD State
  const [isDragging, setIsDragging] = useState(false);
  const [dropState, setDropState] = useState<'none' | 'before' | 'after' | 'inside'>('none');
  const [isCopyMode, setIsCopyMode] = useState(false);
  
  const ref = useRef<HTMLDivElement>(null);
  const keyInputRef = useRef<HTMLInputElement>(null);
  const valueInputRef = useRef<HTMLInputElement>(null);

  // Contexts
  const { register, unregister, syncTo } = useSync();
  const mutationContext = useContext(JsonMutationContext);
  
  const currentPath = isRoot ? '#' : (path || '');

  // Register for Navigation
  useEffect(() => {
      register(syncZone, currentPath, () => setIsOpen(true));
      return () => unregister(syncZone, currentPath);
  }, [currentPath, register, unregister, syncZone]);

  // Handle Default Open changes (only if no active recursive command)
  useEffect(() => {
      if (!internalCommand) {
          setIsOpen(defaultOpen);
      }
  }, [defaultOpen]); // internalCommand omitted to avoid dependency loop

  useEffect(() => setLocalValue(data), [data]);
  useEffect(() => { if(fieldKey !== undefined) setLocalKey(fieldKey); }, [fieldKey]);

  // --- Recursive Command Synchronization ---
  // If the parent passes a NEW recursive command (ID changed), we must adopt it.
  useEffect(() => {
      if (recursiveCommand && recursiveCommand.id !== lastParentCmdId.current) {
          lastParentCmdId.current = recursiveCommand.id;
          
          // 1. Update internal state so we pass this command down to our children
          setInternalCommand(recursiveCommand);
          
          // 2. Update our own open state (unless we are root)
          if (!isRoot) {
              setIsOpen(recursiveCommand.type === 'expand');
          }
      }
  }, [recursiveCommand, isRoot]);

  // --- Handlers ---
  
  const handleFocus = (e: React.FocusEvent | React.MouseEvent) => {
      e.stopPropagation();
      if (onFocusPath) onFocusPath(currentPath);
  }

  // KEY BLUR / SUBMIT
  const commitKeyChange = () => {
    if (onKeyChange && localKey !== fieldKey) {
        onKeyChange(localKey);
    }
  };

  const handleKeyKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
          e.preventDefault();
          commitKeyChange();
          // Optional: Focus value input
          if (valueInputRef.current) valueInputRef.current.focus();
      }
      if (e.key === 'Tab' && !e.shiftKey) {
          // Allow default tab but also ensure value focus if adjacent
      }
  };

  // VALUE BLUR / SUBMIT
  const commitValueChange = () => {
      let valString = String(localValue);
      let parsed: any = valString;
      
      // Basic type inference for direct input
      if (valString === 'true') parsed = true;
      else if (valString === 'false') parsed = false;
      else if (valString === 'null') parsed = null;
      else if (!isNaN(Number(valString)) && valString.trim() !== '') parsed = Number(valString);
      
      // Only call onChange if different
      if (parsed !== data) {
          onChange(parsed);
      }
  };

  const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalValue(e.target.value);
  };

  const handleValueKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
          e.preventDefault();
          commitValueChange();
          e.currentTarget.blur();
      }
      if (e.key === 'Tab' && e.shiftKey) {
          // Allow default shift tab
      }
  };

  const handleChildChange = (key: string | number, newData: any) => {
    if (type === 'array') {
      const newArr = [...(data as any[])];
      newArr[key as number] = newData;
      onChange(newArr);
    } else if (type === 'object') {
      const newObj = { ...data };
      newObj[key] = newData;
      onChange(newObj);
    }
  };

  const handleChildKeyChange = (oldKey: string, newKey: string) => {
    if (type === 'object') {
      const newObj: Record<string, any> = {};
      Object.keys(data).forEach(k => {
        if (k === oldKey) newObj[newKey] = data[k];
        else newObj[k] = data[k];
      });
      onChange(newObj);
    }
  };

  const handleDeleteChild = (key: string | number) => {
    if (type === 'array') {
      const newArr = (data as any[]).filter((_, i) => i !== key);
      onChange(newArr);
    } else if (type === 'object') {
      const newObj = { ...data };
      delete newObj[key];
      onChange(newObj);
    }
  };

  const handleAddChild = (dataType: string) => {
    const newValue = getInitialValue(dataType);
    if (type === 'array') {
      // PREPEND: Add to the beginning of the array
      onChange([newValue, ...data]);
    } else if (type === 'object') {
      // PREPEND: Create a new object with the new key first to preserve order in modern JS engines
      const newObj: Record<string, any> = {};
      
      // Generate a unique key
      let i = 1;
      while (Object.prototype.hasOwnProperty.call(data, `new_key_${i}`)) i++;
      const newKey = `new_key_${i}`;
      
      // 1. Insert new key first
      newObj[newKey] = newValue;
      
      // 2. Append existing keys
      Object.keys(data).forEach(k => {
          newObj[k] = data[k];
      });
      
      onChange(newObj);
    }
    setIsOpen(true); 
  };

  const handleDirectAdd = () => {
    let targetType = 'string';
    if (Array.isArray(data) && data.length > 0) {
       targetType = getDataType(data[0]);
    } else if (typeof data === 'object' && data !== null) {
       const keys = Object.keys(data);
       if (keys.length > 0) {
          targetType = getDataType(data[keys[0]]);
       }
    }
    handleAddChild(targetType);
  };

  const handleChangeType = (newType: string) => {
      onChange(getInitialValue(newType));
      setIsChangingType(false);
  };

  const handleCopy = (e: React.MouseEvent) => {
      e.stopPropagation();
      let textToCopy = "";

      if (fieldKey !== undefined) {
         const wrapper = { [fieldKey]: data };
         const json = JSON.stringify(wrapper, null, 2);
         const lines = json.split('\n');
         if (lines.length >= 3) {
             textToCopy = lines.slice(1, -1)
                .map(line => line.startsWith('  ') ? line.substring(2) : line)
                .join('\n');
         } else {
             textToCopy = json.trim().replace(/^{/, '').replace(/}$/, '').trim();
         }
      } else {
         textToCopy = JSON.stringify(data, null, 2);
      }

      navigator.clipboard.writeText(textToCopy);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
  };

  const handlePaste = async (e: React.MouseEvent) => {
      e.stopPropagation();
      
      const processPastedText = (text: string) => {
          if (!text.trim()) return;

          let parsed;
          try {
              parsed = JSON.parse(text);
          } catch {
              // Try wrapping in braces to support "key": "value" format
              try {
                 parsed = JSON.parse(`{${text}}`);
              } catch {
                 // Try fixing unquoted keys: { key: "val" } -> { "key": "val" } (Basic fallback)
                 try {
                     const fixed = text.replace(/([{,]\s*)([a-zA-Z0-9_]+)(\s*:) /g, '$1"$2"$3');
                     parsed = JSON.parse(fixed);
                 } catch {
                     try {
                         // Try fixing unquoted keys wrapped
                         const fixedWrapped = `{${text}}`.replace(/([{,]\s*)([a-zA-Z0-9_]+)(\s*:) /g, '$1"$2"$3');
                         parsed = JSON.parse(fixedWrapped);
                     } catch {
                         // Finally treat as string
                         parsed = text;
                     }
                 }
              }
          }

          if (type === 'array') {
              // Prepend
              onChange([parsed, ...data]);
              setIsOpen(true);
          } else if (type === 'object') {
              const newObj: Record<string, any> = {};

              // Strategy:
              // 1. If parsed is Object: Flatten it and insert keys at top.
              // 2. If parsed is Primitive/Array: Insert as single key at top.

              if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
                  // It's a dictionary. Insert its keys first.
                  
                  // 1. Add Pasted Keys
                  Object.keys(parsed).forEach(k => {
                      if (!Object.prototype.hasOwnProperty.call(data, k)) {
                          newObj[k] = parsed[k];
                      }
                  });
                  
                  // 2. Add Existing Keys (maintain their values and relative order)
                  Object.keys(data).forEach(k => {
                      newObj[k] = data[k];
                  });
              } else {
                  // It is a value. Generate one key.
                  let i = 1;
                  while (Object.prototype.hasOwnProperty.call(data, `pasted_key_${i}`)) i++;
                  const newKey = `pasted_key_${i}`;
                  
                  newObj[newKey] = parsed;
                  
                  Object.keys(data).forEach(k => {
                      newObj[k] = data[k];
                  });
              }
              onChange(newObj);
              setIsOpen(true);
          }
      };

      const useFallback = () => {
         // Fallback for environments where Clipboard API is blocked or permission denied
         // We use window.prompt because it's the simplest way to get input without a complex UI change,
         // effectively bypassing the clipboard read permission check.
         const text = window.prompt("Paste JSON here:");
         if (text) processPastedText(text);
      }

      if (!navigator.clipboard || !navigator.clipboard.readText) {
          useFallback();
          return;
      }

      try {
          // Explicitly try to read. Browsers might throw or reject here if denied.
          const text = await navigator.clipboard.readText();
          processPastedText(text);
      } catch (err) {
          // Log warning for developer debugging, but handle gracefully for user
          console.warn("Clipboard API access denied or failed. Using fallback.", err);
          useFallback();
      }
  };

  const handleToggleRecursive = (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const nextType = internalCommand?.type === 'collapse' ? 'expand' : 'collapse';
      setInternalCommand({ type: nextType, id: Date.now() + Math.random() });
      setIsOpen(true);
      // Ensure we set focus so the path updates
      if (onFocusPath) onFocusPath(currentPath);
  };

  const handleChevronToggle = (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsOpen(!isOpen);
      if (onFocusPath) onFocusPath(currentPath);
  };

  // --- Global Move Logic (Root Only) ---
  
  const performGlobalMove = useCallback((
      fromPath: string, 
      toPath: string, 
      position: 'before' | 'after' | 'inside', 
      operation: 'move' | 'copy' = 'move', 
      draggedValue?: any, 
      fromZone?: string
  ) => {
      const newData = JSON.parse(JSON.stringify(data));
      
      // Determine Source & Value
      let val = draggedValue;
      let isCrossZone = fromZone && fromZone !== syncZone;
      
      const { parent: fromParent, key: fromKey } = getParentAndKey(newData, fromPath);
      // Helper to check if source path is valid in THIS tree
      const isValidSource = fromParent && fromKey !== null && (Array.isArray(fromParent) ? fromParent[Number(fromKey)] !== undefined : Object.prototype.hasOwnProperty.call(fromParent, fromKey));

      // If internal D&D and value not passed (legacy/internal), fetch from tree
      if (val === undefined && !isCrossZone && isValidSource) {
          val = Array.isArray(fromParent) ? fromParent[Number(fromKey)] : fromParent[fromKey];
      }
      
      // If we still don't have a value, we can't proceed (prevent null/undefined insertion)
      if (val === undefined) return;

      // Handle Delete (Move Operation)
      // Only delete if it's a move AND it's within the same zone/tree
      if (operation === 'move' && !isCrossZone && isValidSource) {
           if (Array.isArray(fromParent)) fromParent.splice(Number(fromKey), 1);
           else delete fromParent[fromKey];
      }

      // Check drops inside self
      if (toPath.startsWith(fromPath + '/') && !isCrossZone) return; 

      let targetParent, targetKey;
      if (position === 'inside') {
          targetParent = getNodeByPath(newData, toPath);
          if (typeof targetParent !== 'object' || targetParent === null) return; 
      } else {
          const res = getParentAndKey(newData, toPath);
          targetParent = res.parent;
          targetKey = res.key;
          if (!targetParent) return;
      }

      // Insert Value
      if (Array.isArray(targetParent)) {
          if (position === 'inside') {
              targetParent.push(val);
          } else {
              let idx = Number(targetKey);
              if (position === 'after') idx += 1;
              targetParent.splice(idx, 0, val);
          }
      } else {
          // Object Logic with Rename
          const originalKey = getPathParts(fromPath).pop() || 'key';
          
          if (position === 'inside') {
              let k = originalKey;
              let i = 1;
              while (Object.prototype.hasOwnProperty.call(targetParent, k)) {
                  k = `${originalKey}_${i}`;
                  i++;
              }
              targetParent[k] = val;
          } else {
              // Reorder / Insert Sibling
              const entries = Object.entries(targetParent);
              const newEntries: [string, any][] = [];
              
              let safeKey = originalKey;
              let c = 1;
              
              // Simple collision check: if key exists in target, rename it
              // Note: If we 'moved' (deleted) it from the same parent, it won't be in targetParent properties anymore, so no collision.
              while (Object.prototype.hasOwnProperty.call(targetParent, safeKey)) {
                  safeKey = `${originalKey}_${c++}`;
              }
              
              entries.forEach(([k, v]) => {
                  if (k === targetKey && position === 'before') newEntries.push([safeKey, val]);
                  newEntries.push([k, v]);
                  if (k === targetKey && position === 'after') newEntries.push([safeKey, val]);
              });
              
              // Clear and rebuild
              for (const k in targetParent) delete targetParent[k];
              newEntries.forEach(([k, v]) => targetParent[k] = v);
          }
      }
      onChange(newData);
  }, [data, onChange, syncZone]);

  // --- DnD Event Handlers ---

  const handleDragStart = (e: React.DragEvent) => {
      e.stopPropagation();
      setIsDragging(true);
      e.dataTransfer.setData('lineart/path', currentPath);
      e.dataTransfer.setData('lineart/json', JSON.stringify(localValue));
      e.dataTransfer.setData('lineart/zone', syncZone);
      e.dataTransfer.effectAllowed = 'copyMove';
      const preview = document.createElement('div');
      preview.innerText = `{ ${localKey || 'Item'} }`;
      preview.style.background = 'black';
      preview.style.color = 'white';
      preview.style.padding = '4px 8px';
      preview.style.borderRadius = '4px';
      preview.style.position = 'absolute';
      preview.style.top = '-1000px';
      document.body.appendChild(preview);
      e.dataTransfer.setDragImage(preview, 0, 0);
      setTimeout(() => document.body.removeChild(preview), 0);
  };

  const handleDragEnd = () => { setIsDragging(false); setDropState('none'); setIsCopyMode(false); };

  const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault(); e.stopPropagation();
      if (isDragging) return; 
      const copyMode = e.altKey;
      if (copyMode !== isCopyMode) setIsCopyMode(copyMode);
      e.dataTransfer.dropEffect = e.altKey ? 'copy' : 'move';

      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return;
      const y = e.clientY - rect.top;
      const height = rect.height;
      
      if ((type === 'object' || type === 'array') && isOpen) {
          if (y < height * 0.25 && !isRoot) setDropState('before');
          else if (y > height * 0.75 && !isRoot) setDropState('after');
          else setDropState('inside');
      } else {
          if (y < height * 0.5 && !isRoot) setDropState('before');
          else if (!isRoot) setDropState('after');
          else setDropState('inside');
      }
  };

  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDropState('none'); setIsCopyMode(false); };

  const handleDrop = (e: React.DragEvent) => {
      e.preventDefault(); e.stopPropagation();
      const fromPath = e.dataTransfer.getData('lineart/path');
      const draggedJson = e.dataTransfer.getData('lineart/json');
      const fromZone = e.dataTransfer.getData('lineart/zone');
      
      if (!fromPath || fromPath === currentPath) return; 
      
      let draggedValue = undefined;
      try {
          if (draggedJson) draggedValue = JSON.parse(draggedJson);
      } catch (e) { console.error("Failed to parse dragged JSON", e); }

      // Force 'copy' if crossing zones (since we can't easily delete from the source editor)
      let operation: 'copy' | 'move' = e.altKey ? 'copy' : 'move';
      if (fromZone && fromZone !== syncZone) {
          operation = 'copy';
      }

      if (isRoot) performGlobalMove(fromPath, currentPath, dropState === 'none' ? 'inside' : dropState, operation, draggedValue, fromZone);
      else if (mutationContext) mutationContext.handleGlobalMove(fromPath, currentPath, dropState === 'none' ? 'inside' : dropState, operation, draggedValue, fromZone);
      setDropState('none'); setIsCopyMode(false);
  };

  const isContainer = type === 'object' || type === 'array';
  const childCount = isContainer ? Object.keys(data).length : 0;
  const isRef = typeof localValue === 'string' && localValue.startsWith('#/');

  const handleSyncJump = (e: React.MouseEvent) => { e.stopPropagation(); syncTo(syncTarget, currentPath); };

  // --- Render ---

  const content = (
    <div 
        ref={ref}
        className={`font-mono text-sm leading-7 ${!isRoot ? 'ml-4' : ''} relative transition-all duration-200 ${isDragging ? 'opacity-40' : 'opacity-100'}`} 
        data-sync-id={`${syncZone}:${currentPath}`}
        draggable={!isRoot}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onDoubleClick={handleSyncJump}
        onClick={handleFocus}
    >
      {dropState === 'before' && <div className={`absolute -top-[2px] left-0 right-0 h-[4px] rounded-full z-10 pointer-events-none ${isDragging ? '' : (isCopyMode ? 'bg-emerald-500' : 'bg-accent')}`} />}
      {dropState === 'after' && <div className={`absolute -bottom-[2px] left-0 right-0 h-[4px] rounded-full z-10 pointer-events-none ${isDragging ? '' : (isCopyMode ? 'bg-emerald-500' : 'bg-accent')}`} />}
      {dropState === 'inside' && <div className={`absolute inset-0 border-2 rounded z-10 pointer-events-none ${isDragging ? '' : (isCopyMode ? 'bg-emerald-500/10 border-emerald-500' : 'bg-accent/10 border-accent')}`} />}

      <div className="flex items-center gap-2 group hover:bg-zinc-100 rounded px-1 -ml-1 transition-colors relative">
        {!isRoot && (
            <div className="absolute -left-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-40 hover:!opacity-100 cursor-grab active:cursor-grabbing transition-opacity p-0.5 text-zinc-400">
                <GripVertical size={12} />
            </div>
        )}

        {isContainer ? (
          <button onClick={handleChevronToggle} className="w-4 h-4 flex items-center justify-center text-zinc-500 hover:text-black focus:outline-none transition-colors">
            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : ( <span className="w-4" /> )}

        {!isRoot && fieldKey !== undefined && onKeyChange && (
          <div className="flex items-center gap-1">
             <input 
               ref={keyInputRef}
               className="bg-transparent border-b border-transparent focus:border-zinc-400 focus:bg-white focus:outline-none font-bold text-zinc-800 w-auto min-w-[30px] transition-all"
               style={{ width: `${Math.max(localKey.length, 4)}ch` }}
               value={localKey}
               onChange={(e) => setLocalKey(e.target.value)}
               onKeyDown={handleKeyKeyDown}
               onBlur={commitKeyChange}
               spellCheck={false}
             />
             <span className="text-zinc-400 cursor-pointer hover:text-accent hover:font-bold transition-colors px-0.5 select-none" onClick={(e) => { e.stopPropagation(); syncTo(syncTarget, currentPath); }} title="Reveal in Sync Target">:</span>
          </div>
        )}

        {!isRoot && fieldKey === undefined && <span className="text-zinc-300 mr-1 select-none">•</span>}

        {isContainer ? (
          <div className="flex items-center gap-2">
            <span className="text-zinc-500 font-bold select-none">{type === 'array' ? '[' : '{'}</span>
            {!isOpen && (
              <button className="text-zinc-400 text-xs px-1.5 py-0.5 bg-zinc-100 hover:bg-zinc-200 rounded cursor-pointer select-none transition-colors" onClick={(e) => { e.stopPropagation(); setIsOpen(true); }}>
                 {childCount} items
              </button>
            )}
            {!isOpen && <span className="text-zinc-500 font-bold select-none">{type === 'array' ? ']' : '}'}</span>}
          </div>
        ) : (
          <div className="flex-1 flex items-center relative">
              <input 
                ref={valueInputRef}
                className={`bg-transparent border-b border-zinc-200 focus:border-accent focus:bg-white focus:outline-none w-full min-w-[100px] font-medium
                  ${type === 'string' ? 'text-emerald-700' : type === 'number' ? 'text-orange-600' : type === 'boolean' ? 'text-blue-600' : 'text-purple-600'}`}
                value={localValue === null || localValue === undefined ? 'null' : localValue.toString()}
                onChange={handleValueChange}
                onKeyDown={handleValueKeyDown}
                onBlur={commitValueChange}
                spellCheck={false}
                title={localValue === null || localValue === undefined ? 'null' : localValue.toString()}
              />
              {isRef && <button onClick={(e) => { e.stopPropagation(); syncTo(syncZone, localValue); }} className="ml-2 text-zinc-400 hover:text-accent p-0.5 hover:bg-blue-50 rounded transition-colors" title="Jump to definition"><ExternalLink size={12} /></button>}
          </div>
        )}

        {/* Actions Menu */}
        <div className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 flex items-center gap-1 transition-opacity ml-2 bg-white/80 backdrop-blur-sm rounded-sm z-20 shadow-sm border border-zinc-100">
           <button onClick={handleCopy} className={`p-1 hover:bg-zinc-200 text-zinc-600 rounded focus:outline-none focus:ring-2 focus:ring-black ${isCopied ? 'text-emerald-600 bg-emerald-50' : ''}`} title="Copy JSON">
               {isCopied ? <Check size={14} /> : <Copy size={14} />}
           </button>

           {isContainer && (
             <div className="relative flex gap-1">
                <button onClick={handlePaste} className="p-1 hover:bg-zinc-200 text-zinc-600 rounded focus:outline-none focus:ring-2 focus:ring-black" title="Paste JSON (Insert at Top)">
                    <ClipboardPaste size={14} />
                </button>

                <button 
                  onClick={handleToggleRecursive}
                  className={`p-1 hover:bg-zinc-200 text-zinc-600 rounded focus:outline-none focus:ring-2 focus:ring-black ${internalCommand?.type === 'collapse' ? 'bg-amber-100 text-amber-700' : ''}`}
                  title={internalCommand?.type === 'collapse' ? "Expand Inner Recursive" : "Collapse Inner Recursive"}
                >
                    {internalCommand?.type === 'collapse' ? <UnfoldVertical size={14} /> : <FoldVertical size={14} />}
                </button>
                
                <button onClick={(e) => { e.stopPropagation(); handleDirectAdd(); }} className="p-1 hover:bg-emerald-100 text-emerald-600 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500" title="Add Field">
                    <Plus size={14} />
                </button>
             </div>
           )}

           <div className="relative">
                <button onClick={(e) => { e.stopPropagation(); setIsChangingType(!isChangingType); }} className={`p-1 hover:bg-blue-100 text-blue-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 ${isChangingType ? 'bg-blue-100' : ''}`} title="Change Type">
                   <FileType size={14} />
                </button>
                {isChangingType && <TypeSelector onSelect={handleChangeType} onCancel={() => setIsChangingType(false)} />}
           </div>

           {!isRoot && onDelete && (
             <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="p-1 hover:bg-rose-100 text-rose-600 rounded focus:outline-none focus:ring-2 focus:ring-rose-500">
                <Trash2 size={14} />
             </button>
           )}
        </div>
      </div>

      {isContainer && isOpen && (
        <div className="border-l border-zinc-200 ml-[7px] pl-2 my-1">
          {type === 'array' ? (
             (data as any[]).map((item, idx) => (
                <JsonEditor 
                  key={idx}
                  index={idx}
                  data={item}
                  onChange={(val) => handleChildChange(idx, val)}
                  onDelete={() => handleDeleteChild(idx)}
                  defaultOpen={defaultOpen}
                  path={`${currentPath}/${idx}`}
                  onFocusPath={onFocusPath}
                  recursiveCommand={internalCommand}
                  syncZone={syncZone}
                  syncTarget={syncTarget}
                />
             ))
          ) : (
            Object.keys(data).map((key, idx) => (
               <JsonEditor 
                 key={key}
                 index={idx}
                 fieldKey={key}
                 data={data[key]}
                 onKeyChange={(newKey) => handleChildKeyChange(key, newKey)}
                 onChange={(val) => handleChildChange(key, val)}
                 onDelete={() => handleDeleteChild(key)}
                 defaultOpen={defaultOpen}
                 path={`${currentPath}/${key}`}
                 onFocusPath={onFocusPath}
                 recursiveCommand={internalCommand}
                 syncZone={syncZone}
                 syncTarget={syncTarget}
               />
            ))
          )}
          <div className="ml-4 text-zinc-500 font-bold select-none">{type === 'array' ? ']' : '}'}</div>
        </div>
      )}
    </div>
  );

  if (isRoot) {
      return (
          <JsonMutationContext.Provider value={{ handleGlobalMove: performGlobalMove }}>
              {content}
          </JsonMutationContext.Provider>
      );
  }

  return content;
};
