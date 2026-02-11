import React, { useState, useEffect } from 'react';
import { DiffNode, DiffType } from '../types';
import { ChevronRight, ChevronDown, Plus, X, CircleDot } from 'lucide-react';

interface JsonTreeProps {
  data: DiffNode;
  isRoot?: boolean;
  defaultOpen?: boolean;
}

const JsonTree: React.FC<JsonTreeProps> = React.memo(({ data, isRoot = false, defaultOpen = true }) => {
  const [isOpen, setIsOpen] = useState<boolean>(defaultOpen);

  useEffect(() => {
    setIsOpen(defaultOpen);
  }, [defaultOpen]);

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  // --- Style Logic ---
  const isDiff = data.type !== DiffType.UNCHANGED;
  let lineClass = 'hover:bg-zinc-100/50'; // Default hover
  let textClass = 'text-zinc-700';
  let icon = null;

  if (data.type === DiffType.ADDED) {
    lineClass = 'bg-emerald-100/40 hover:bg-emerald-100/60';
    textClass = 'text-emerald-800';
    icon = <Plus size={12} className="text-emerald-600 shrink-0" />;
  } else if (data.type === DiffType.REMOVED) {
    lineClass = 'bg-rose-100/40 hover:bg-rose-100/60';
    textClass = 'text-rose-800 line-through opacity-70';
    icon = <X size={12} className="text-rose-600 shrink-0" />;
  } else if (data.type === DiffType.MODIFIED) {
    lineClass = 'bg-amber-100/40 hover:bg-amber-100/60';
    textClass = 'text-amber-800';
    icon = <CircleDot size={10} className="text-amber-500 shrink-0" />;
  }

  const isExpandable = data.isObject || data.isArray;
  const isEmpty = isExpandable && (!data.children || data.children.length === 0);
  
  // Custom Render for Values
  const renderValue = (val: any) => {
    // If it's a diff node, we use the status color (textClass) instead of syntax highlighting
    if (isDiff) {
        if (val === null) return <span className="font-bold opacity-70">null</span>;
        if (typeof val === 'string') return <span>"{val}"</span>;
        return <span>{String(val)}</span>;
    }

    // Standard Syntax Highlighting for Unchanged
    if (val === null) return <span className="text-purple-600 font-bold">null</span>;
    if (typeof val === 'boolean') return <span className="text-blue-600 font-bold">{val.toString()}</span>;
    if (typeof val === 'string') return <span className="text-emerald-700">"{val}"</span>;
    if (typeof val === 'number') return <span className="text-orange-600 font-bold">{val}</span>;
    return <span>{String(val)}</span>;
  };

  return (
    <div className={`font-mono text-sm leading-6 ${isRoot ? '' : 'ml-4'} border-l border-transparent hover:border-zinc-300 transition-colors rounded-sm`}>
      
      {/* The Line */}
      <div 
        className={`flex items-start group ${isExpandable ? 'cursor-pointer' : ''} py-0.5 rounded-sm px-1 -ml-1 ${lineClass} transition-colors`} 
        onClick={isExpandable ? toggle : undefined}
      >
        {/* Gutter / Icon */}
        <div className="w-5 flex justify-center items-center mt-1.5 select-none mr-1">
           {icon}
           {!icon && isExpandable && !isEmpty && (
               <span className="text-zinc-400 group-hover:text-zinc-800 transition-colors">
                 {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
               </span>
           )}
        </div>

        {/* Content */}
        <div className={`flex-1 break-all ${textClass}`}>
          {/* Key */}
          <span className={`font-semibold opacity-90 select-none ${!isDiff ? 'text-zinc-700' : 'text-inherit'}`}>
            {data.key}
          </span>
          <span className="mr-2 opacity-60">:</span>

          {/* Value Area */}
          {isExpandable ? (
            <span>
              {data.isArray ? '[' : '{'}
              {!isOpen && <span className="text-zinc-400 mx-2 bg-zinc-50 border border-zinc-200 px-1.5 rounded text-[10px]">{data.children?.length} items</span>}
              {!isOpen && (data.isArray ? ']' : '}')}
              {isEmpty && (data.isArray ? ']' : '}')}
            </span>
          ) : (
             /* 
                For MODIFIED: Only show data.value (New Value). Hides oldValue.
                For ADDED: data.value.
                For REMOVED: data.oldValue.
             */
             renderValue(data.value !== undefined ? data.value : data.oldValue)
          )}

          {/* Trailing comma */}
          {!isRoot && <span className="opacity-40 select-none ml-0.5">,</span>}
        </div>
      </div>

      {/* Children (Recursive) */}
      {isExpandable && isOpen && !isEmpty && data.children && (
        <div className={`border-l border-dashed border-zinc-300 ml-[10px] ${data.type === DiffType.REMOVED ? 'opacity-70' : ''}`}>
          {data.children.map((child, idx) => (
            <JsonTree key={`${child.key}-${idx}`} data={child} defaultOpen={defaultOpen} />
          ))}
          <div className={`ml-4 pl-1 ${textClass} ${lineClass} rounded-sm w-fit px-1 -ml-1`}>
            {data.isArray ? ']' : '}'}
          </div>
        </div>
      )}
    </div>
  );
});

export default JsonTree;