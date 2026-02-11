
import React, { useState, useRef, useEffect, useContext, createContext, useId, useCallback } from 'react';
import { ChevronRight, ChevronDown, Plus, Trash2, X, MoreHorizontal, FileType, ExternalLink, Link as LinkIcon, GripVertical, CornerDownRight, Copy, Check } from 'lucide-react';
import { useSync } from './SyncContext';

// --- Mutation Context (For Global Moves) ---
interface JsonMutationContextType {
    handleGlobalMove: (fromPath: string, toPath: string, position: 'before' | 'after' | 'inside') => void;
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
  <div className="flex items-center gap-0.5 bg-white border border-zinc-900 rounded shadow-hard-sm absolute z-20 left-0 -top-8 p-1 animate-in fade-in zoom-in-95 duration-100 origin-bottom-left">
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
  index
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const type = getDataType(data);
  const [localKey, setLocalKey] = useState(fieldKey || '');
  const [localValue, setLocalValue] = useState(data);
  
  // Interaction States
  const [isAdding, setIsAdding] = useState(false);
  const [isChangingType, setIsChangingType] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  // DnD State
  const [isDragging, setIsDragging] = useState(false);
  const [dropState, setDropState] = useState<'none' | 'before' | 'after' | 'inside'>('none');
  const ref = useRef<HTMLDivElement>(null);

  // Contexts
  const { register, unregister, syncTo } = useSync();
  const mutationContext = useContext(JsonMutationContext);
  
  const currentPath = isRoot ? '#' : (path || '');

  // Register for Navigation
  useEffect(() => {
      register('editor', currentPath, () => setIsOpen(true));
      return () => unregister('editor', currentPath);
  }, [currentPath, register, unregister]);

  useEffect(() => setIsOpen(defaultOpen), [defaultOpen]);
  useEffect(() => setLocalValue(data), [data]);
  useEffect(() => { if(fieldKey !== undefined) setLocalKey(fieldKey); }, [fieldKey]);

  // --- Handlers ---

  const handleKeyBlur = () => {
    if (onKeyChange && localKey !== fieldKey) onKeyChange(localKey);
  };

  const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalValue(val);
    let parsed: any = val;
    if (val === 'true') parsed = true;
    else if (val === 'false') parsed = false;
    else if (val === 'null') parsed = null;
    else if (!isNaN(Number(val)) && val.trim() !== '') parsed = Number(val);
    onChange(parsed);
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
      onChange([...data, newValue]);
    } else if (type === 'object') {
      const newObj = { ...data };
      let i = 1;
      while (newObj[`new_key_${i}`]) i++;
      newObj[`new_key_${i}`] = newValue;
      onChange(newObj);
    }
    setIsAdding(false);
    setIsOpen(true); 
  };

  const handleChangeType = (newType: string) => {
      onChange(getInitialValue(newType));
      setIsChangingType(false);
  };

  const handleCopy = (e: React.MouseEvent) => {
      e.stopPropagation();
      let content = data;
      // If fieldKey exists, it implies this is an object property, so wrap it
      // Array items have index passed but fieldKey is undefined
      if (fieldKey !== undefined) {
         content = { [fieldKey]: data };
      }
      navigator.clipboard.writeText(JSON.stringify(content, null, 2));
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
  };

  // --- Global Move Logic (Root Only) ---
  
  const performGlobalMove = useCallback((fromPath: string, toPath: string, position: 'before' | 'after' | 'inside') => {
      // Deep clone whole tree
      const newData = JSON.parse(JSON.stringify(data));
      
      // 1. Get Source Info
      const { parent: fromParent, key: fromKey } = getParentAndKey(newData, fromPath);
      if (!fromParent) return;

      // 2. Extract Value
      const isArray = Array.isArray(fromParent);
      const val = isArray ? fromParent[Number(fromKey)] : fromParent[fromKey];
      
      // 3. Remove Source
      if (isArray) {
          fromParent.splice(Number(fromKey), 1);
      } else {
          delete fromParent[fromKey];
      }

      // 4. Calculate Insert Target
      if (toPath.startsWith(fromPath + '/')) return;

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

      // 5. Insert
      if (Array.isArray(targetParent)) {
          if (position === 'inside') {
              targetParent.push(val);
          } else {
              let idx = Number(targetKey);
              if (position === 'after') idx += 1;
              targetParent.splice(idx, 0, val);
          }
      } else {
          // Object
          if (position === 'inside') {
              let i = 1;
              let k = `moved_key_${i}`;
              const originalKey = getPathParts(fromPath).pop() || 'key';
              if (!targetParent[originalKey]) k = originalKey;
              else {
                   while (targetParent[k]) { i++; k = `moved_key_${i}`; }
              }
              targetParent[k] = val;
          } else {
              // Reorder keys
              const entries = Object.entries(targetParent);
              const newEntries: [string, any][] = [];
              const insertKey = getPathParts(fromPath).pop() || 'moved_key';
              let safeKey = insertKey;
              let c = 1;
              while (Object.prototype.hasOwnProperty.call(targetParent, safeKey) && safeKey !== targetKey) { 
                  if (fromParent === targetParent && safeKey === fromKey) break; 
                  safeKey = `${insertKey}_${c++}`;
              }

              entries.forEach(([k, v]) => {
                  if (k === targetKey && position === 'before') newEntries.push([safeKey, val]);
                  newEntries.push([k, v]);
                  if (k === targetKey && position === 'after') newEntries.push([safeKey, val]);
              });
              
              for (const k in targetParent) delete targetParent[k];
              newEntries.forEach(([k, v]) => targetParent[k] = v);
          }
      }

      onChange(newData);
  }, [data, onChange]);


  // --- DnD Event Handlers ---

  const handleDragStart = (e: React.DragEvent) => {
      e.stopPropagation();
      setIsDragging(true);
      e.dataTransfer.setData('lineart/path', currentPath);
      e.dataTransfer.effectAllowed = 'move';
      
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

  const handleDragEnd = () => {
      setIsDragging(false);
      setDropState('none');
  };

  const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      if (isDragging) return; 

      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return;

      const y = e.clientY - rect.top;
      const height = rect.height;
      const isContainer = type === 'object' || type === 'array';
      
      if (isContainer && isOpen) {
          if (y < height * 0.25 && !isRoot) setDropState('before');
          else if (y > height * 0.75 && !isRoot) setDropState('after');
          else setDropState('inside');
      } else {
          if (y < height * 0.5 && !isRoot) setDropState('before');
          else if (!isRoot) setDropState('after');
          else setDropState('inside');
      }
  };

  const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDropState('none');
  };

  const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      const fromPath = e.dataTransfer.getData('lineart/path');
      if (!fromPath) return;
      if (fromPath === currentPath) return; 
      
      if (isRoot) performGlobalMove(fromPath, currentPath, dropState === 'none' ? 'inside' : dropState);
      else if (mutationContext) mutationContext.handleGlobalMove(fromPath, currentPath, dropState === 'none' ? 'inside' : dropState);
      
      setDropState('none');
  };

  const isContainer = type === 'object' || type === 'array';
  const childCount = isContainer ? Object.keys(data).length : 0;
  const isRef = typeof localValue === 'string' && localValue.startsWith('#/');

  const handleSyncJump = (e: React.MouseEvent) => {
      e.stopPropagation();
      syncTo('diff', currentPath);
  };

  // --- Render ---

  const content = (
    <div 
        ref={ref}
        className={`font-mono text-sm leading-7 ${!isRoot ? 'ml-4' : ''} relative transition-all duration-200 
            ${isDragging ? 'opacity-40' : 'opacity-100'}
        `} 
        data-sync-id={`editor:${currentPath}`}
        draggable={!isRoot}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onDoubleClick={handleSyncJump}
    >
      {/* Drop Zone Indicators */}
      {dropState === 'before' && <div className="absolute -top-[2px] left-0 right-0 h-[4px] bg-accent rounded-full z-10 pointer-events-none" />}
      {dropState === 'after' && <div className="absolute -bottom-[2px] left-0 right-0 h-[4px] bg-accent rounded-full z-10 pointer-events-none" />}
      {dropState === 'inside' && <div className="absolute inset-0 bg-accent/10 border-2 border-accent rounded z-10 pointer-events-none" />}

      <div className="flex items-center gap-2 group hover:bg-zinc-100 rounded px-1 -ml-1 transition-colors relative">
        
        {!isRoot && (
            <div className="absolute -left-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-40 hover:!opacity-100 cursor-grab active:cursor-grabbing transition-opacity p-0.5 text-zinc-400">
                <GripVertical size={12} />
            </div>
        )}

        {isContainer ? (
          <button 
            onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }} 
            className="w-4 h-4 flex items-center justify-center text-zinc-500 hover:text-black focus:outline-none transition-colors"
          >
            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className="w-4" /> 
        )}

        {!isRoot && fieldKey !== undefined && onKeyChange && (
          <div className="flex items-center gap-1">
             <input 
               className="bg-transparent border-b border-transparent focus:border-zinc-400 focus:bg-white focus:outline-none font-bold text-zinc-800 w-auto min-w-[30px] transition-all"
               style={{ width: `${Math.max(localKey.length, 4)}ch` }}
               value={localKey}
               onChange={(e) => setLocalKey(e.target.value)}
               onBlur={handleKeyBlur}
               spellCheck={false}
               onDoubleClick={(e) => e.stopPropagation()} 
             />
             <span className="text-zinc-400">:</span>
          </div>
        )}

        {!isRoot && fieldKey === undefined && <span className="text-zinc-300 mr-1 select-none">•</span>}

        {isContainer ? (
          <div className="flex items-center gap-2">
            <span className="text-zinc-500 font-bold select-none">{type === 'array' ? '[' : '{'}</span>
            {!isOpen && (
              <button 
                 className="text-zinc-400 text-xs px-1.5 py-0.5 bg-zinc-100 hover:bg-zinc-200 rounded cursor-pointer select-none transition-colors" 
                 onClick={(e) => { e.stopPropagation(); setIsOpen(true); }}
              >
                 {childCount} items
              </button>
            )}
            {!isOpen && <span className="text-zinc-500 font-bold select-none">{type === 'array' ? ']' : '}'}</span>}
          </div>
        ) : (
          <div className="flex-1 flex items-center relative">
              <input 
                className={`bg-transparent border-b border-zinc-200 focus:border-accent focus:bg-white focus:outline-none w-full min-w-[100px] font-medium
                  ${type === 'string' ? 'text-emerald-700' : 
                    type === 'number' ? 'text-orange-600' : 
                    type === 'boolean' ? 'text-blue-600' : 'text-purple-600'}`}
                value={localValue === null ? 'null' : localValue.toString()}
                onChange={handleValueChange}
                spellCheck={false}
                onDoubleClick={(e) => e.stopPropagation()}
              />
              {isRef && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); /* jumpTo logic if needed locally */ }}
                    className="ml-2 text-zinc-400 hover:text-accent p-0.5 hover:bg-blue-50 rounded transition-colors"
                  >
                      <ExternalLink size={12} />
                  </button>
              )}
          </div>
        )}

        {/* Actions Menu */}
        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity ml-2 bg-white/80 backdrop-blur-sm rounded-sm z-20">
           
           <button 
               onClick={handleCopy} 
               className={`p-1 hover:bg-zinc-200 text-zinc-600 rounded ${isCopied ? 'text-emerald-600 bg-emerald-50' : ''}`}
               title="Copy JSON"
           >
               {isCopied ? <Check size={14} /> : <Copy size={14} />}
           </button>

           {isContainer && (
             <div className="relative">
                <button onClick={(e) => { e.stopPropagation(); setIsAdding(!isAdding); }} className={`p-1 hover:bg-emerald-100 text-emerald-600 rounded ${isAdding ? 'bg-emerald-100' : ''}`}>
                    <Plus size={14} />
                </button>
                {isAdding && <TypeSelector onSelect={handleAddChild} onCancel={() => setIsAdding(false)} />}
             </div>
           )}

           <div className="relative">
                <button onClick={(e) => { e.stopPropagation(); setIsChangingType(!isChangingType); }} className={`p-1 hover:bg-blue-100 text-blue-600 rounded ${isChangingType ? 'bg-blue-100' : ''}`}>
                   <FileType size={14} />
                </button>
                {isChangingType && <TypeSelector onSelect={handleChangeType} onCancel={() => setIsChangingType(false)} />}
           </div>

           {!isRoot && onDelete && (
             <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="p-1 hover:bg-rose-100 text-rose-600 rounded">
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
