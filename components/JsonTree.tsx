import React, { useState, useEffect } from 'react';
import { DiffNode, DiffType } from '../types';
import { ChevronRight, ChevronDown, Plus, X } from 'lucide-react';

interface JsonTreeProps {
  data: DiffNode;
  isRoot?: boolean;
  defaultOpen?: boolean;
}

const JsonTree: React.FC<JsonTreeProps> = ({ data, isRoot = false, defaultOpen = true }) => {
  const [isOpen, setIsOpen] = useState<boolean>(defaultOpen);

  // If defaultOpen changes (e.g. "Expand All" triggered from parent by changing key), reset state
  useEffect(() => {
    setIsOpen(defaultOpen);
  }, [defaultOpen]);

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  // Determine styles based on diff type
  let bgClass = '';
  let textClass = 'text-zinc-800';
  let icon = null;

  if (data.type === DiffType.ADDED) {
    bgClass = 'bg-emerald-50/80';
    textClass = 'text-emerald-900';
    icon = <Plus size={12} className="text-emerald-600 shrink-0" />;
  } else if (data.type === DiffType.REMOVED) {
    bgClass = 'bg-rose-50/80';
    textClass = 'text-rose-900 opacity-70';
    icon = <X size={12} className="text-rose-600 shrink-0" />;
  } else if (data.type === DiffType.MODIFIED) {
    bgClass = 'bg-amber-50/50';
  }

  const isExpandable = data.isObject || data.isArray;
  const isEmpty = isExpandable && (!data.children || data.children.length === 0);
  
  // Render Primitive Value
  const renderValue = (val: any, type: DiffType) => {
    if (val === null) return <span className="text-purple-600 font-bold">null</span>;
    if (typeof val === 'boolean') return <span className="text-blue-600 font-bold">{val.toString()}</span>;
    if (typeof val === 'string') return <span className="text-emerald-700">"{val}"</span>;
    if (typeof val === 'number') return <span className="text-orange-600 font-bold">{val}</span>;
    return <span>{String(val)}</span>;
  };

  return (
    <div className={`font-mono text-sm leading-6 ${bgClass} ${isRoot ? '' : 'ml-4'} border-l border-transparent hover:border-gray-300 transition-colors`}>
      <div 
        className={`flex items-start group ${isExpandable ? 'cursor-pointer' : ''}`} 
        onClick={isExpandable ? toggle : undefined}
      >
        {/* Gutter / Icon */}
        <div className="w-6 flex justify-center items-center mt-1 select-none opacity-50 group-hover:opacity-100">
           {icon}
           {!icon && isExpandable && !isEmpty && (
               isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />
           )}
        </div>

        {/* Content */}
        <div className={`flex-1 break-all pr-2 ${textClass}`}>
          {/* Key */}
          <span className="font-semibold opacity-80 select-none hover:text-black">
            {data.key}
          </span>
          <span className="mr-1 opacity-60">:</span>

          {/* Value Logic */}
          {data.type === DiffType.MODIFIED ? (
             <span className="inline-flex flex-col sm:flex-row sm:gap-2">
                <span className="bg-rose-100 px-1 rounded line-through text-rose-800 decoration-rose-500/50 decoration-2 opacity-70">
                    {JSON.stringify(data.oldValue)}
                </span>
                <span className="bg-emerald-100 px-1 rounded text-emerald-800">
                     {JSON.stringify(data.value)}
                </span>
             </span>
          ) : (
             <>
                {isExpandable ? (
                  <span>
                    {data.isArray ? '[' : '{'}
                    {!isOpen && <span className="text-gray-400 mx-1 bg-gray-100 px-1 rounded text-xs">{data.children?.length} items</span>}
                    {!isOpen && (data.isArray ? ']' : '}')}
                    {isEmpty && (data.isArray ? ']' : '}')}
                  </span>
                ) : (
                  renderValue(data.value !== undefined ? data.value : data.oldValue, data.type)
                )}
             </>
          )}

          {/* Trailing comma visual */}
          {!isRoot && <span className="text-gray-400 select-none">,</span>}
        </div>
      </div>

      {/* Children */}
      {isExpandable && isOpen && !isEmpty && data.children && (
        <div className="border-l border-dashed border-gray-300 ml-[11px]">
          {data.children.map((child, idx) => (
            <JsonTree key={`${child.key}-${idx}`} data={child} defaultOpen={defaultOpen} />
          ))}
          <div className={`ml-4 pl-2 ${textClass}`}>
            {data.isArray ? ']' : '}'}
          </div>
        </div>
      )}
    </div>
  );
};

export default JsonTree;
