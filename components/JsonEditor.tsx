
import React, { useState, useRef, useEffect, useContext, createContext } from 'react';
import { ChevronRight, ChevronDown, Plus, Trash2, X, MoreHorizontal, FileType, ExternalLink, Link as LinkIcon } from 'lucide-react';

// --- Navigation Context ---
interface JsonNavContextType {
    register: (path: string, expand: () => void) => void;
    unregister: (path: string) => void;
    jumpTo: (path: string) => void;
}

const JsonNavContext = createContext<JsonNavContextType>({ 
    register: () => {}, unregister: () => {}, jumpTo: () => {} 
});

export const JsonNavProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
    const nodes = useRef<Map<string, () => void>>(new Map());
    
    const register = (path: string, expand: () => void) => {
        nodes.current.set(path, expand);
    };
    
    const unregister = (path: string) => {
        nodes.current.delete(path);
    };
    
    const jumpTo = (path: string) => {
        // Parse path: #/definitions/region -> ["definitions", "region"]
        const parts = path.split('/').filter(p => p !== '#' && p !== '');
        
        let currentPath = '#';
        
        // Always try to expand root
        const expandRoot = nodes.current.get('#');
        if(expandRoot) expandRoot();

        // Sequentially expand path segments
        parts.forEach(part => {
            currentPath += `/${part}`;
            const expand = nodes.current.get(currentPath);
            if(expand) expand();
        });

        // Scroll to element after render
        setTimeout(() => {
            const el = document.querySelector(`[data-path="${path}"]`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Add highlight effect
                el.classList.add('bg-yellow-100/50', 'ring-2', 'ring-yellow-400', 'rounded');
                setTimeout(() => {
                    el.classList.remove('bg-yellow-100/50', 'ring-2', 'ring-yellow-400', 'rounded');
                }, 1500);
            } else {
                console.warn(`Target path ${path} not found in DOM`);
            }
        }, 150);
    };

    return (
        <JsonNavContext.Provider value={{ register, unregister, jumpTo }}>
            {children}
        </JsonNavContext.Provider>
    );
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
  path?: string; // Current JSON Pointer path
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
  path
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const type = getDataType(data);
  const [localKey, setLocalKey] = useState(fieldKey || '');
  const [localValue, setLocalValue] = useState(data);
  
  // Interaction States
  const [isAdding, setIsAdding] = useState(false);
  const [isChangingType, setIsChangingType] = useState(false);

  // Navigation Context
  const { register, unregister, jumpTo } = useContext(JsonNavContext);
  
  // Calculate current path
  const currentPath = isRoot ? '#' : (path || '');

  // Register node for navigation
  useEffect(() => {
      register(currentPath, () => setIsOpen(true));
      return () => unregister(currentPath);
  }, [currentPath, register, unregister]);

  // Force open if defaultOpen changes (global expand/collapse)
  useEffect(() => {
    setIsOpen(defaultOpen);
  }, [defaultOpen]);

  // Sync props to local state
  useEffect(() => {
    setLocalValue(data);
  }, [data]);
  
  useEffect(() => {
      if(fieldKey !== undefined) setLocalKey(fieldKey);
  }, [fieldKey]);

  const handleKeyBlur = () => {
    if (onKeyChange && localKey !== fieldKey) {
      onKeyChange(localKey);
    }
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
        if (k === oldKey) {
          newObj[newKey] = data[k];
        } else {
          newObj[k] = data[k];
        }
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
      const newValue = getInitialValue(newType);
      onChange(newValue);
      setIsChangingType(false);
  };

  const isContainer = type === 'object' || type === 'array';
  const childCount = isContainer ? Object.keys(data).length : 0;
  
  // Check if value is a reference (starts with #/)
  const isRef = typeof localValue === 'string' && localValue.startsWith('#/');

  return (
    <div 
        className={`font-mono text-sm leading-7 ${!isRoot ? 'ml-4' : ''} relative transition-colors duration-300`} 
        data-path={currentPath}
    >
      <div className="flex items-center gap-2 group hover:bg-zinc-100 rounded px-1 -ml-1 transition-colors relative">
        
        {/* Expand/Collapse Toggle */}
        {isContainer ? (
          <button 
            onClick={() => setIsOpen(!isOpen)} 
            className="w-4 h-4 flex items-center justify-center text-zinc-500 hover:text-black focus:outline-none transition-colors"
            title={isOpen ? "Collapse block" : "Expand block"}
          >
            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className="w-4" /> 
        )}

        {/* Key Input (if part of object) */}
        {!isRoot && fieldKey !== undefined && onKeyChange && (
          <div className="flex items-center gap-1">
             <input 
               className="bg-transparent border-b border-transparent focus:border-zinc-400 focus:bg-white focus:outline-none font-bold text-zinc-800 w-auto min-w-[30px] transition-all"
               style={{ width: `${Math.max(localKey.length, 4)}ch` }}
               value={localKey}
               onChange={(e) => setLocalKey(e.target.value)}
               onBlur={handleKeyBlur}
               spellCheck={false}
             />
             <span className="text-zinc-400">:</span>
          </div>
        )}

        {/* Array Index (if part of array) */}
        {!isRoot && fieldKey === undefined && (
           <span className="text-zinc-300 mr-1 select-none">•</span>
        )}

        {/* Value Display / Input */}
        {isContainer ? (
          <div className="flex items-center gap-2">
            <span className="text-zinc-500 font-bold select-none">
               {type === 'array' ? '[' : '{'}
            </span>
            {!isOpen && (
              <button 
                 className="text-zinc-400 text-xs px-1.5 py-0.5 bg-zinc-100 hover:bg-zinc-200 rounded cursor-pointer select-none transition-colors" 
                 onClick={() => setIsOpen(true)}
              >
                 {childCount} items
              </button>
            )}
            {!isOpen && (
               <span className="text-zinc-500 font-bold select-none">
                 {type === 'array' ? ']' : '}'}
               </span>
            )}
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
              />
              {/* Reference Jump Button */}
              {isRef && (
                  <button 
                    onClick={() => jumpTo(localValue)}
                    className="ml-2 text-zinc-400 hover:text-accent p-0.5 hover:bg-blue-50 rounded transition-colors"
                    title={`Jump to ${localValue}`}
                  >
                      <ExternalLink size={12} />
                  </button>
              )}
          </div>
        )}

        {/* Actions Hover Menu */}
        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity ml-2">
           
           {/* Add Child (if container) */}
           {isContainer && (
             <div className="relative">
                <button 
                    onClick={() => setIsAdding(!isAdding)} 
                    className={`p-1 hover:bg-emerald-100 text-emerald-600 rounded ${isAdding ? 'bg-emerald-100' : ''}`} 
                    title="Add Item"
                >
                    <Plus size={14} />
                </button>
                {isAdding && (
                    <TypeSelector onSelect={handleAddChild} onCancel={() => setIsAdding(false)} />
                )}
             </div>
           )}

           {/* Change Type (Generic) */}
           <div className="relative">
                <button 
                   onClick={() => setIsChangingType(!isChangingType)}
                   className={`p-1 hover:bg-blue-100 text-blue-600 rounded ${isChangingType ? 'bg-blue-100' : ''}`}
                   title="Change Type"
                >
                   <FileType size={14} />
                </button>
                {isChangingType && (
                    <TypeSelector onSelect={handleChangeType} onCancel={() => setIsChangingType(false)} />
                )}
           </div>

           {/* Delete (if not root) */}
           {!isRoot && onDelete && (
             <button onClick={onDelete} className="p-1 hover:bg-rose-100 text-rose-600 rounded" title="Delete Item">
                <Trash2 size={14} />
             </button>
           )}
        </div>
      </div>

      {/* Recursive Children */}
      {isContainer && isOpen && (
        <div className="border-l border-zinc-200 ml-[7px] pl-2 my-1">
          {type === 'array' ? (
             (data as any[]).map((item, idx) => (
                <JsonEditor 
                  key={idx}
                  data={item}
                  onChange={(val) => handleChildChange(idx, val)}
                  onDelete={() => handleDeleteChild(idx)}
                  defaultOpen={defaultOpen}
                  path={`${currentPath}/${idx}`}
                />
             ))
          ) : (
            Object.keys(data).map((key) => (
               <JsonEditor 
                 key={key}
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
          <div className="ml-4 text-zinc-500 font-bold select-none">
            {type === 'array' ? ']' : '}'}
          </div>
        </div>
      )}
    </div>
  );
};
