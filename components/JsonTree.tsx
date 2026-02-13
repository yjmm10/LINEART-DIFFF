

import React, { useState, useEffect, useRef } from 'react';
import { DiffNode, DiffType } from '../types';
import { ChevronRight, ChevronDown, Copy, Check, FoldVertical, UnfoldVertical } from 'lucide-react';
import { useSync } from './SyncContext';

interface JsonTreeProps {
  data: DiffNode;
  isRoot?: boolean;
  expandMode?: 'all' | 'none' | 'smart';
  path?: string;
  parentIsArray?: boolean;
  onFocusPath?: (path: string) => void;
  recursiveCommand?: RecursiveCommand;
}

// --- Recursive Command Interface (Matches Editor) ---
interface RecursiveCommand {
    type: 'expand' | 'collapse';
    id: number;
}

const JsonTree: React.FC<JsonTreeProps> = React.memo(({ 
    data, 
    isRoot = false, 
    expandMode = 'all', 
    path = '#', 
    parentIsArray = false,
    onFocusPath,
    recursiveCommand
}) => {
  // Determine initial open state based on expandMode or command
  const getInitialOpen = () => {
      if (recursiveCommand) {
          return recursiveCommand.type === 'expand';
      }
      if (expandMode === 'all') return true;
      if (expandMode === 'none') return false;
      if (expandMode === 'smart') {
          return data.type !== DiffType.UNCHANGED;
      }
      return true;
  };

  const [isOpen, setIsOpen] = useState<boolean>(getInitialOpen);
  const [internalCommand, setInternalCommand] = useState<RecursiveCommand | undefined>(recursiveCommand);
  const lastParentCmdId = useRef<number>(recursiveCommand?.id || 0);

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

  // Update open state if expandMode prop changes (only if no active command interaction recently?)
  // We bias towards prop updates for global "Expand All" buttons
  useEffect(() => {
    if (!internalCommand) {
        setIsOpen(getInitialOpen());
    }
  }, [expandMode, data.type]);

  // Navigation
  const { register, unregister, syncTo } = useSync();

  // Register this node for navigation (Sync Scrolling)
  useEffect(() => {
      register('diff', path, () => setIsOpen(true));
      return () => unregister('diff', path);
  }, [path, register, unregister]);

  // States for actions
  const [isCopied, setIsCopied] = useState(false);

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
    handleClick(e); // Also focus
  };

  const handleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (onFocusPath) onFocusPath(path);
  }

  const handleSyncJump = (e: React.MouseEvent) => {
      e.stopPropagation();
      syncTo('editor', path);
      if (onFocusPath) onFocusPath(path);
  };

  const generateCopyText = (val: any) => {
      // If we are a property of an object (not array item) and not root, wrap with key
      // We also want to strip the outer braces to copy as "key": "value"
      if (!isRoot && !parentIsArray) {
          const wrapper = { [data.key]: val };
          const json = JSON.stringify(wrapper, null, 2);
          const lines = json.split('\n');
          if (lines.length >= 3) {
             return lines.slice(1, -1)
                .map(line => line.startsWith('  ') ? line.substring(2) : line)
                .join('\n');
          } else {
             return json.trim().replace(/^{/, '').replace(/}$/, '').trim();
          }
      }
      return JSON.stringify(val, null, 2);
  };

  const handleCopy = (e: React.MouseEvent, val?: any) => {
      e.stopPropagation();
      const valueToCopy = val !== undefined ? val : (data.value !== undefined ? data.value : data.oldValue);
      navigator.clipboard.writeText(generateCopyText(valueToCopy));
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
  };

  const handleToggleRecursive = (e: React.MouseEvent) => {
      e.stopPropagation();
      const nextType = internalCommand?.type === 'collapse' ? 'expand' : 'collapse';
      setInternalCommand({ type: nextType, id: Date.now() + Math.random() });
      setIsOpen(true);
      handleClick(e);
  };

  const isExpandable = data.isObject || data.isArray;
  const isEmpty = isExpandable && (!data.children || data.children.length === 0);
  
  // --- Git-Style Visualization Logic ---
  
  // 1. Modified Leaf Nodes: Split into "Removed" (Old) and "Added" (New) lines
  if (data.type === DiffType.MODIFIED && !isExpandable) {
      return (
          <div 
             className={`${isRoot ? '' : 'ml-4'} border-l border-transparent hover:border-zinc-300 transition-colors rounded-sm my-0.5`}
             onDoubleClick={handleSyncJump}
             onClick={handleClick}
             data-sync-id={`diff:${path}`}
          >
              {/* Old Value (Removed Style) */}
              <div 
                className="flex items-start py-0.5 px-1 -ml-1 bg-rose-100/60 hover:bg-rose-200/50 text-rose-900 opacity-80 group relative pr-8"
                data-diff-status="removed"
              >
                  <div className="w-5 flex justify-center items-center mt-1 select-none mr-1 opacity-50">
                     <span className="text-[10px] font-mono">-</span>
                  </div>
                  <div className="flex-1 break-all font-mono text-sm line-through decoration-rose-900/30">
                      {!isRoot && (
                        <>
                          <span className="font-semibold">{data.key}</span>
                          <span className="mr-2 opacity-60">:</span>
                        </>
                      )}
                      <span>{JSON.stringify(data.oldValue)}</span>
                      {!isRoot && <span className="opacity-40 ml-0.5">,</span>}
                  </div>
                  {/* Copy Action Inline */}
                  <button onClick={(e) => handleCopy(e, data.oldValue)} className={`opacity-0 group-hover:opacity-100 transition-all p-1 rounded ml-auto mr-2 shrink-0 hover:bg-rose-300/50 text-rose-800`} title="Copy Original">
                       <Copy size={12} />
                  </button>
              </div>

              {/* New Value (Added Style) */}
              <div 
                className="flex items-start py-0.5 px-1 -ml-1 bg-emerald-100/60 hover:bg-emerald-200/50 text-emerald-900 group relative pr-8"
                data-diff-status="added"
              >
                  <div className="w-5 flex justify-center items-center mt-1 select-none mr-1 opacity-80">
                      <span className="text-[10px] font-mono">+</span>
                  </div>
                  <div className="flex-1 break-all font-mono text-sm font-medium">
                      {!isRoot && (
                        <>
                          <span className="font-semibold">{data.key}</span>
                          <span className="mr-2 opacity-60">:</span>
                        </>
                      )}
                      <span>{JSON.stringify(data.value)}</span>
                      {!isRoot && <span className="opacity-40 ml-0.5">,</span>}
                  </div>
                   {/* Copy Action Inline */}
                   <button onClick={(e) => handleCopy(e, data.value)} className={`opacity-0 group-hover:opacity-100 transition-all p-1 rounded ml-auto mr-2 shrink-0 hover:bg-emerald-300/50 text-emerald-800`} title="Copy New">
                       <Copy size={12} />
                  </button>
              </div>
          </div>
      );
  }

  // 2. Standard Render (Added, Removed, Unchanged, or Modified Container)
  
  let lineClass = 'hover:bg-zinc-100/50'; 
  let textClass = 'text-zinc-700';
  let diffStatus: string | undefined = undefined;
  let gutterIcon = null;

  if (data.type === DiffType.ADDED) {
    lineClass = 'bg-emerald-100/60 hover:bg-emerald-200/50';
    textClass = 'text-emerald-900';
    diffStatus = 'added';
    gutterIcon = <span className="text-[10px] font-mono text-emerald-600">+</span>;
  } else if (data.type === DiffType.REMOVED) {
    lineClass = 'bg-rose-100/60 hover:bg-rose-200/50';
    textClass = 'text-rose-900 opacity-80 line-through decoration-rose-900/30';
    diffStatus = 'removed';
    gutterIcon = <span className="text-[10px] font-mono text-rose-600">-</span>;
  } else if (data.type === DiffType.MODIFIED && isExpandable) {
    lineClass = 'hover:bg-zinc-100/50';
    textClass = 'text-zinc-700';
  }

  const renderValue = (val: any) => {
    if (val === null) return <span className="text-purple-600 font-bold">null</span>;
    if (typeof val === 'boolean') return <span className="text-blue-600 font-bold">{val.toString()}</span>;
    if (typeof val === 'string') return <span className="text-emerald-700">"{val}"</span>;
    if (typeof val === 'number') return <span className="text-orange-600 font-bold">{val}</span>;
    return <span>{String(val)}</span>;
  };

  return (
    <div 
        className={`font-mono text-sm leading-6 ${isRoot ? '' : 'ml-4'} border-l border-transparent hover:border-zinc-300 transition-colors rounded-sm my-0.5`}
        data-sync-id={`diff:${path}`}
    >
      
      {/* The Line */}
      <div 
        className={`flex items-start group ${isExpandable ? 'cursor-pointer' : ''} py-0.5 rounded-sm px-1 -ml-1 ${lineClass} transition-colors relative pr-8`} 
        onClick={isExpandable ? toggle : handleClick}
        onDoubleClick={handleSyncJump}
        data-diff-status={diffStatus}
      >
        {/* Gutter / Icon */}
        <div className="w-5 flex justify-center items-center mt-1 select-none mr-1 opacity-70">
           {gutterIcon}
           {!gutterIcon && isExpandable && !isEmpty && (
               <span className="text-zinc-400 group-hover:text-zinc-800 transition-colors">
                 {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
               </span>
           )}
        </div>

        {/* Content */}
        <div className={`flex-1 break-all ${textClass}`}>
          {!isRoot && (
            <>
              <span className={`font-semibold opacity-90 select-none ${data.type === DiffType.UNCHANGED ? 'text-zinc-700' : 'text-inherit'}`}>
                {data.key}
              </span>
              <span className="mr-2 opacity-60">:</span>
            </>
          )}

          {isExpandable ? (
            <span>
              {data.isArray ? '[' : '{'}
              {!isOpen && (
                  <>
                    <span className="text-zinc-400 mx-2 bg-zinc-50 border border-zinc-200 px-1.5 rounded text-[10px] not-italic no-underline text-zinc-600 decoration-0">{data.children?.length} items</span>
                    {data.type === DiffType.MODIFIED && (
                        <span className="mr-2 inline-flex w-2 h-2 rounded-full bg-amber-400" title="Contains changes"></span>
                    )}
                  </>
              )}
              {!isOpen && (data.isArray ? ']' : '}')}
              {isEmpty && (data.isArray ? ']' : '}')}
            </span>
          ) : (
             renderValue(data.value !== undefined ? data.value : data.oldValue)
          )}

          {!isRoot && <span className="opacity-40 select-none ml-0.5">,</span>}
        </div>
        
        {/* Unified Hover Action Menu (Similar to Editor) */}
        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity ml-2 bg-white/90 backdrop-blur-sm rounded-sm z-20 shadow-sm border border-zinc-100">
           <button 
                onClick={(e) => handleCopy(e)} 
                className={`p-1 hover:bg-zinc-200 text-zinc-600 rounded focus:outline-none focus:ring-2 focus:ring-black ${isCopied ? 'text-emerald-600 bg-emerald-50' : ''}`} 
                title="Copy JSON"
           >
               {isCopied ? <Check size={12} /> : <Copy size={12} />}
           </button>

           {isExpandable && !isEmpty && (
                <button 
                  onClick={handleToggleRecursive}
                  className={`p-1 hover:bg-zinc-200 text-zinc-600 rounded focus:outline-none focus:ring-2 focus:ring-black ${internalCommand?.type === 'collapse' ? 'bg-amber-100 text-amber-700' : ''}`}
                  title={internalCommand?.type === 'collapse' ? "Expand Inner Recursive" : "Collapse Inner Recursive"}
                >
                    {internalCommand?.type === 'collapse' ? <UnfoldVertical size={12} /> : <FoldVertical size={12} />}
                </button>
           )}
        </div>

      </div>

      {/* Children (Recursive) */}
      {isExpandable && isOpen && !isEmpty && data.children && (
        <div className="border-l border-dashed border-zinc-300 ml-[10px]">
          {data.children.map((child, idx) => (
            <JsonTree 
                key={`${child.key}-${idx}`} 
                data={child} 
                expandMode={expandMode}
                path={`${path}/${child.key}`}
                parentIsArray={data.isArray}
                onFocusPath={onFocusPath}
                recursiveCommand={internalCommand}
            />
          ))}
          <div className={`ml-4 pl-1 ${textClass} rounded-sm w-fit px-1 -ml-1 bg-transparent hover:bg-transparent opacity-60 select-none`}>
            {data.isArray ? ']' : '}'}
          </div>
        </div>
      )}
    </div>
  );
});

export default JsonTree;
