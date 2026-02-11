
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { 
  GitBranch, 
  ArrowLeftRight, 
  RotateCcw, 
  Upload,
  Code,
  LayoutList,
  Wand2,
  Maximize2,
  Minimize2,
  FileText,
  AlertTriangle,
  Download,
  FolderOpen,
  Plus,
  Trash2,
  Check,
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
  PinOff,
  FileDiff,
  Copy,
  ListFilter,
  Edit2,
  X
} from 'lucide-react';
import { Button, Card, Modal, Input, Label, Select } from './components/ui';
import JsonTree from './components/JsonTree';
import { JsonEditor, JsonNavProvider } from './components/JsonEditor';
import { safeParse, generateDiff, downloadJson, isProjectFile } from './utils';
import { DiffNode, DiffType, Workspace, ExportMode } from './types';

const INITIAL_JSON_DATA = {
  project: "LineArt JSON",
  version: "2.0.0",
  features: ["Workspaces", "Local Storage", "Import/Export"],
  settings: {
    theme: "light",
    autoSave: true
  }
};

const DEFAULT_WORKSPACE: Workspace = {
    id: 'default',
    name: 'Main Project',
    baseJson: null,
    currentJson: INITIAL_JSON_DATA,
    lastModified: Date.now()
};

// --- Minimap Component ---
const DiffMinimap: React.FC<{ scrollContainerRef: React.RefObject<HTMLDivElement | null>; triggerUpdate: any }> = ({ scrollContainerRef, triggerUpdate }) => {
    const [marks, setMarks] = useState<{ top: number; height: number; type: string }[]>([]);

    useEffect(() => {
        const updateMarks = () => {
            const container = scrollContainerRef.current;
            if (!container) return;

            // Use getBoundingClientRect for accuracy relative to the viewport/container
            const containerRect = container.getBoundingClientRect();
            const scrollHeight = container.scrollHeight;
            const scrollTop = container.scrollTop;
            
            if (scrollHeight === 0) return;

            const elements = container.querySelectorAll('[data-diff-status]');
            const newMarks: typeof marks = [];

            elements.forEach((el) => {
                const htmlEl = el as HTMLElement;
                const rect = htmlEl.getBoundingClientRect();
                
                // Calculate position relative to the top of the SCROLLABLE content
                // absoluteTop = (currentVisualTop - containerVisualTop) + containerScrollTop
                const relativeTop = (rect.top - containerRect.top) + scrollTop;
                
                const topPercent = (relativeTop / scrollHeight) * 100;
                const heightPercent = (rect.height / scrollHeight) * 100;
                
                newMarks.push({
                    top: topPercent,
                    height: heightPercent,
                    type: htmlEl.dataset.diffStatus || 'modified'
                });
            });

            setMarks(newMarks);
        };

        // Update initially and when trigger changes (tree expands/collapses)
        const timeout = setTimeout(updateMarks, 300); // Small delay for rendering/layout

        // Also observe DOM mutations for robust updates (e.g. expanding nodes)
        const observer = new MutationObserver(updateMarks);
        if (scrollContainerRef.current) {
            observer.observe(scrollContainerRef.current, { childList: true, subtree: true, attributes: true });
        }
        
        // Listen to window resize
        window.addEventListener('resize', updateMarks);

        return () => {
            clearTimeout(timeout);
            observer.disconnect();
            window.removeEventListener('resize', updateMarks);
        };
    }, [scrollContainerRef, triggerUpdate]);

    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const rect = e.currentTarget.getBoundingClientRect();
        const clickY = e.clientY - rect.top;
        const percentage = clickY / rect.height;

        // Map percentage to scroll range (0 to scrollHeight - clientHeight)
        const targetTop = percentage * (container.scrollHeight - container.clientHeight);

        container.scrollTo({
            top: targetTop,
            behavior: 'smooth'
        });
    };

    return (
        <div 
            onClick={handleClick}
            className="absolute top-0 right-0 bottom-0 w-3.5 z-20 cursor-pointer bg-transparent border-l border-zinc-100/50 hover:bg-zinc-100/30 transition-colors"
        >
            {marks.map((mark, i) => (
                <div 
                    key={i}
                    className={`absolute right-0 w-full opacity-80 pointer-events-none ${
                        mark.type === 'added' ? 'bg-emerald-500' : 
                        mark.type === 'removed' ? 'bg-rose-500' : 'bg-blue-500'
                    }`}
                    style={{
                        top: `${mark.top}%`,
                        height: `${Math.max(mark.height, 0.5)}%`, // Ensure minimal visibility even for small items
                        minHeight: '2px'
                    }}
                />
            ))}
        </div>
    );
};


const App: React.FC = () => {
  // --- Workspace State & Persistence ---
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => {
      const saved = localStorage.getItem('lineart_workspaces');
      return saved ? JSON.parse(saved) : [DEFAULT_WORKSPACE];
  });
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>(() => {
      return localStorage.getItem('lineart_active_id') || 'default';
  });

  // Derived Active Workspace
  const activeWorkspace = useMemo(() => 
      workspaces.find(w => w.id === activeWorkspaceId) || workspaces[0]
  , [workspaces, activeWorkspaceId]);

  // Persist Effects
  useEffect(() => {
      localStorage.setItem('lineart_workspaces', JSON.stringify(workspaces));
  }, [workspaces]);

  useEffect(() => {
      localStorage.setItem('lineart_active_id', activeWorkspaceId);
  }, [activeWorkspaceId]);

  // --- Sidebar State ---
  const [sidebarPinned, setSidebarPinned] = useState(true);
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const isSidebarVisible = sidebarPinned || sidebarHovered;
  
  // Workspace Renaming State
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  // --- Local Editor State (Synced with Active Workspace) ---
  const [currentText, setCurrentText] = useState<string>(JSON.stringify(activeWorkspace.currentJson, null, 2));
  
  // Sync text when workspace changes
  useEffect(() => {
      setCurrentText(JSON.stringify(activeWorkspace.currentJson, null, 2));
      setError(null);
      setErrorLine(undefined);
  }, [activeWorkspaceId]);

  // UI Controls
  const [editorView, setEditorView] = useState<'text' | 'tree'>('text');
  const [error, setError] = useState<string | null>(null);
  const [errorLine, setErrorLine] = useState<number | undefined>(undefined);
  const [copyFeedback, setCopyFeedback] = useState(false);
  
  // Modals
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isWorkspaceModalOpen, setIsWorkspaceModalOpen] = useState(false);
  const [isCompareModalOpen, setIsCompareModalOpen] = useState(false);
  
  // Export State
  const [exportFilename, setExportFilename] = useState("data");
  const [exportMode, setExportMode] = useState<ExportMode>('latest');
  
  // Workspace Management State
  const [newWorkspaceName, setNewWorkspaceName] = useState("");

  // Compare Modal State
  const [compareBaseFile, setCompareBaseFile] = useState<any>(null);
  const [compareCurrentFile, setCompareCurrentFile] = useState<any>(null);

  // Layout State
  const [expandAllKey, setExpandAllKey] = useState(0);
  // Default to 'smart' to satisfy user preference for optimization
  const [diffExpandMode, setDiffExpandMode] = useState<'all' | 'none' | 'smart'>('smart');
  const [editorExpandAll, setEditorExpandAll] = useState(true);

  const [leftPanelWidth, setLeftPanelWidth] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  
  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const diffScrollRef = useRef<HTMLDivElement>(null);
  const [cursorPos, setCursorPos] = useState<number | null>(null);

  // --- PERFORMANCE: Debounce Text Changes ---
  useEffect(() => {
      const handler = setTimeout(() => {
          const result = safeParse(currentText);
          if (result.parsed) {
              // Only update if actually changed to avoid cycles
              if (JSON.stringify(result.parsed) !== JSON.stringify(activeWorkspace.currentJson)) {
                  updateActiveWorkspace({ currentJson: result.parsed });
              }
              setError(null);
              setErrorLine(undefined);
          } else {
              setError(result.error);
              setErrorLine(result.errorLine);
          }
      }, 600); // 600ms delay for large files

      return () => clearTimeout(handler);
  }, [currentText]);

  // --- Workspace Actions ---

  const updateActiveWorkspace = (updates: Partial<Workspace>) => {
      setWorkspaces(prev => prev.map(w => 
          w.id === activeWorkspaceId ? { ...w, ...updates, lastModified: Date.now() } : w
      ));
  };

  const handleCreateWorkspace = () => {
      if(!newWorkspaceName.trim()) return;
      const newSpace: Workspace = {
          id: Date.now().toString(),
          name: newWorkspaceName,
          baseJson: null,
          currentJson: {}, // Initialize as empty
          lastModified: Date.now()
      };
      setWorkspaces([...workspaces, newSpace]);
      setActiveWorkspaceId(newSpace.id);
      setNewWorkspaceName("");
      setIsWorkspaceModalOpen(false);
  };

  const handleDeleteWorkspace = (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if(workspaces.length <= 1) {
          alert("Cannot delete the only project.");
          return;
      }
      
      if(window.confirm("Are you sure you want to delete this project? This action cannot be undone.")) {
          const newWorkspaces = workspaces.filter(w => w.id !== id);
          setWorkspaces(newWorkspaces);
          
          if(activeWorkspaceId === id) {
              setActiveWorkspaceId(newWorkspaces[0].id);
          }
      }
  };

  const startRenaming = (ws: Workspace, e: React.MouseEvent) => {
      e.stopPropagation();
      setEditingWorkspaceId(ws.id);
      setEditName(ws.name);
  };

  const cancelRename = (e?: React.MouseEvent) => {
      e?.stopPropagation();
      setEditingWorkspaceId(null);
      setEditName("");
  };

  const saveRename = (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (editingWorkspaceId && editName.trim()) {
          setWorkspaces(prev => prev.map(w => 
              w.id === editingWorkspaceId ? { ...w, name: editName.trim() } : w
          ));
      }
      setEditingWorkspaceId(null);
      setEditName("");
  };

  // --- Logic Handlers ---

  const handleTextChange = (text: string) => {
    setCurrentText(text);
    // Parsing happens in Debounce effect
  };

  const handleObjectChange = (newObj: any) => {
    updateActiveWorkspace({ currentJson: newObj });
    setCurrentText(JSON.stringify(newObj, null, 2));
    setError(null);
    setErrorLine(undefined);
  };

  const handleSetOriginal = () => {
    updateActiveWorkspace({ baseJson: JSON.parse(JSON.stringify(activeWorkspace.currentJson)) });
  };

  const handleReset = () => {
    if (activeWorkspace.baseJson) {
      const text = JSON.stringify(activeWorkspace.baseJson, null, 2);
      setCurrentText(text);
      updateActiveWorkspace({ currentJson: JSON.parse(text) });
    }
  };

  const handleCopyJson = () => {
      navigator.clipboard.writeText(currentText);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
  };

  const handleExpandAll = () => {
      setEditorExpandAll(true);
      setDiffExpandMode('all');
      setExpandAllKey(k => k + 1);
  };

  const handleCollapseAll = () => {
      setEditorExpandAll(false);
      setDiffExpandMode('none');
      setExpandAllKey(k => k + 1);
  };

  const handleSmartExpand = () => {
      setDiffExpandMode('smart');
      setExpandAllKey(k => k + 1);
  };

  // --- Import / Export ---

  const handleExport = () => {
      if(exportMode === 'latest') {
          downloadJson(activeWorkspace.currentJson, exportFilename);
      } else if (exportMode === 'diff') {
          const diff = generateDiff(activeWorkspace.baseJson, activeWorkspace.currentJson);
          downloadJson(diff, `${exportFilename}-diff`);
      } else if (exportMode === 'project') {
          const projectData = {
              meta: 'lineart-diff-project',
              version: '1.0',
              timestamp: Date.now(),
              base: activeWorkspace.baseJson,
              current: activeWorkspace.currentJson
          };
          downloadJson(projectData, `${exportFilename}-project`);
      }
      setIsExportModalOpen(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        const text = ev.target?.result as string;
        const result = safeParse(text);
        
        if (result.parsed) {
            const data = result.parsed;
            if (isProjectFile(data)) {
                updateActiveWorkspace({
                    baseJson: data.base,
                    currentJson: data.current
                });
                setCurrentText(JSON.stringify(data.current, null, 2));
            } else {
                updateActiveWorkspace({ 
                    currentJson: data,
                    baseJson: activeWorkspace.baseJson || data 
                });
                setCurrentText(JSON.stringify(data, null, 2));
            }
            setError(null);
            setErrorLine(undefined);
        } else {
            setError("Invalid JSON File");
        }
        e.target.value = '';
    };
    reader.readAsText(file);
  };

  // --- Compare Modal Handlers ---

  const handleCompareFileLoad = (e: React.ChangeEvent<HTMLInputElement>, type: 'base' | 'current') => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
          const text = ev.target?.result as string;
          const result = safeParse(text);
          if (result.parsed) {
              if (type === 'base') setCompareBaseFile(result.parsed);
              else setCompareCurrentFile(result.parsed);
          }
          e.target.value = '';
      }
      reader.readAsText(file);
  };

  const applyCompare = () => {
      if (compareCurrentFile) {
          updateActiveWorkspace({
              baseJson: compareBaseFile, // Can be null if they only want to load current
              currentJson: compareCurrentFile
          });
          setCurrentText(JSON.stringify(compareCurrentFile, null, 2));
          setIsCompareModalOpen(false);
          // Reset
          setCompareBaseFile(null);
          setCompareCurrentFile(null);
      }
  };

  // --- Editor Inputs ---

  const formatJson = () => {
    const result = safeParse(currentText);
    if (result.parsed) {
      const formatted = JSON.stringify(result.parsed, null, 2);
      setCurrentText(formatted);
      // Immediate update for format
      updateActiveWorkspace({ currentJson: result.parsed });
      setError(null);
      setErrorLine(undefined);
    }
  };

  // Cursor & Formatting Logic (Tab, Enter)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const { selectionStart, selectionEnd, value } = e.currentTarget;
    if (e.key === 'Tab') {
      e.preventDefault();
      const newText = value.substring(0, selectionStart) + '  ' + value.substring(selectionEnd);
      setCurrentText(newText);
      setCursorPos(selectionStart + 2);
    } else if (e.key === 'Enter') {
      // Basic indent logic
      e.preventDefault();
      const before = value.substring(0, selectionStart);
      const after = value.substring(selectionEnd);
      const lastLine = before.split('\n').pop() || '';
      const indentMatch = lastLine.match(/^\s*/);
      let indent = indentMatch ? indentMatch[0] : '';
      const lastChar = before.trim().slice(-1);
      const nextChar = after.trim().slice(0, 1);
      if (lastChar === '{' || lastChar === '[') indent += '  ';
      const isClosingBlock = (lastChar === '{' && nextChar === '}') || (lastChar === '[' && nextChar === ']');
      let insert = '\n' + indent;
      let finalCursorPos = selectionStart + insert.length;
      if (isClosingBlock) {
        insert += '\n' + indent.slice(0, -2);
      }
      const newText = before + insert + after;
      setCurrentText(newText);
      setCursorPos(finalCursorPos);
    }
  };

  // Restore cursor
  useEffect(() => {
    if (cursorPos !== null && textareaRef.current) {
      textareaRef.current.setSelectionRange(cursorPos, cursorPos);
      setCursorPos(null);
    }
  }, [cursorPos]); // removed currentText dependency to avoid jumping during typing

  // Dragging Logic
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;
      setLeftPanelWidth(Math.max(20, Math.min(80, newWidth)));
    };
    const handleMouseUp = () => {
      setIsDragging(false);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
      document.querySelectorAll('.pointer-events-overlay').forEach(el => el.remove());
    };
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      const overlay = document.createElement('div');
      overlay.className = 'pointer-events-overlay fixed inset-0 z-[9999] cursor-col-resize';
      document.body.appendChild(overlay);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // --- Computations ---

  const diffTree: DiffNode | null = useMemo(() => {
    if (!activeWorkspace.baseJson) return null;
    return generateDiff(activeWorkspace.baseJson, activeWorkspace.currentJson, 'root');
  }, [activeWorkspace.baseJson, activeWorkspace.currentJson]);

  const stats = useMemo(() => {
      if(!diffTree) return { added: 0, removed: 0, modified: 0 };
      let added = 0, removed = 0, modified = 0;
      const traverse = (node: DiffNode) => {
          if (node.type === DiffType.ADDED) added++;
          if (node.type === DiffType.REMOVED) removed++;
          if (node.type === DiffType.MODIFIED) modified++;
          if (node.children) node.children.forEach(traverse);
      }
      traverse(diffTree);
      return { added, removed, modified };
  }, [diffTree]);

  const isInitialized = !!activeWorkspace.baseJson;

  return (
    <div className="h-screen flex font-sans text-zinc-900 bg-zinc-50 overflow-hidden">
      
      {/* --- SIDEBAR --- */}
      <aside 
         className={`h-full bg-paper border-r-2 border-border shadow-hard z-50 flex flex-col transition-all duration-300 ease-in-out relative ${isSidebarVisible ? 'w-64' : 'w-16'}`}
         onMouseEnter={() => setSidebarHovered(true)}
         onMouseLeave={() => setSidebarHovered(false)}
      >
          {/* Sidebar Header */}
          <div className="p-4 flex items-center justify-between border-b-2 border-zinc-100 h-16 shrink-0 overflow-hidden whitespace-nowrap">
               <div className="flex items-center gap-3">
                   <div className="bg-black text-white p-2 shrink-0">
                      <GitBranch size={20} />
                   </div>
                   <h1 className={`text-lg font-black tracking-tight uppercase transition-opacity duration-200 ${isSidebarVisible ? 'opacity-100' : 'opacity-0 w-0'}`}>
                       LineArt
                   </h1>
               </div>
               
               {isSidebarVisible && (
                   <button onClick={() => setSidebarPinned(!sidebarPinned)} className="text-zinc-400 hover:text-black transition-colors">
                       {sidebarPinned ? <Pin size={16} className="fill-current" /> : <PinOff size={16} />}
                   </button>
               )}
          </div>

          {/* Sidebar Content */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 space-y-4">
               
               {/* Workspaces Section */}
               <div className="space-y-2">
                   {isSidebarVisible && (
                       <div className="px-2 text-xs font-bold text-zinc-400 uppercase tracking-wider flex justify-between items-center">
                           <span>Projects</span>
                           <button onClick={() => setIsWorkspaceModalOpen(true)} className="p-1 hover:bg-zinc-100 rounded text-zinc-600">
                               <Plus size={14} />
                           </button>
                       </div>
                   )}
                   
                   <div className="space-y-1">
                       {workspaces.map(ws => (
                           <div 
                               key={ws.id}
                               onClick={() => !editingWorkspaceId && setActiveWorkspaceId(ws.id)}
                               className={`w-full flex items-center gap-3 p-2 rounded-md transition-all group cursor-pointer ${activeWorkspaceId === ws.id ? 'bg-zinc-100 shadow-hard-sm border-2 border-black' : 'hover:bg-zinc-50 border-2 border-transparent'}`}
                               title={ws.name}
                           >
                               <div className="shrink-0 text-zinc-500 group-hover:text-black">
                                   <FolderOpen size={18} />
                               </div>
                               
                               <div className={`flex-1 min-w-0 flex items-center justify-between ${isSidebarVisible ? 'opacity-100' : 'opacity-0 w-0'} transition-opacity overflow-hidden`}>
                                   {editingWorkspaceId === ws.id ? (
                                       <div className="flex items-center gap-1 w-full" onClick={e => e.stopPropagation()}>
                                            <input 
                                                className="w-full min-w-0 bg-white border-b border-black text-sm px-1 focus:outline-none"
                                                value={editName}
                                                onChange={e => setEditName(e.target.value)}
                                                onKeyDown={e => {
                                                    if(e.key === 'Enter') saveRename(e as any);
                                                    if(e.key === 'Escape') cancelRename(e as any);
                                                }}
                                                onClick={e => e.stopPropagation()}
                                                autoFocus
                                            />
                                            <button onClick={(e) => saveRename(e)} className="text-emerald-600 hover:bg-emerald-100 p-0.5 rounded"><Check size={14}/></button>
                                            <button onClick={(e) => cancelRename(e)} className="text-rose-600 hover:bg-rose-100 p-0.5 rounded"><X size={14}/></button>
                                       </div>
                                   ) : (
                                       <>
                                           <span className="text-sm font-bold truncate pr-2 select-none">
                                               {ws.name}
                                           </span>
                                           
                                           {/* Actions: Visible on group hover */}
                                           <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                               <button 
                                                   onClick={(e) => startRenaming(ws, e)}
                                                   className="p-1 text-zinc-400 hover:text-black hover:bg-zinc-200 rounded"
                                                   title="Rename"
                                               >
                                                   <Edit2 size={12} />
                                               </button>
                                               <button 
                                                   onClick={(e) => handleDeleteWorkspace(ws.id, e)}
                                                   className="p-1 text-zinc-400 hover:text-rose-600 hover:bg-rose-100 rounded"
                                                   title="Delete"
                                               >
                                                   <Trash2 size={12} />
                                               </button>
                                           </div>
                                       </>
                                   )}
                               </div>
                           </div>
                       ))}
                   </div>
               </div>

               <div className="border-t border-zinc-200 my-2"></div>

               {/* Actions Section */}
               <div className="space-y-1">
                   {isSidebarVisible && <div className="px-2 text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Tools</div>}
                   
                   <button onClick={() => setIsCompareModalOpen(true)} className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-zinc-50 border-2 border-transparent hover:border-zinc-200 text-zinc-600 transition-all" title="Compare Files">
                       <FileDiff size={18} />
                       <span className={`text-sm font-medium whitespace-nowrap ${isSidebarVisible ? 'opacity-100' : 'opacity-0 w-0'}`}>Compare Files</span>
                   </button>

                   <button onClick={() => setIsExportModalOpen(true)} className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-zinc-50 border-2 border-transparent hover:border-zinc-200 text-zinc-600 transition-all" title="Import / Export">
                       <Upload size={18} />
                       <span className={`text-sm font-medium whitespace-nowrap ${isSidebarVisible ? 'opacity-100' : 'opacity-0 w-0'}`}>Import / Export</span>
                   </button>
               </div>
          </div>

          {/* Sidebar Footer */}
          <div className="p-2 border-t border-zinc-200 shrink-0">
               <button onClick={() => setIsWorkspaceModalOpen(true)} className="w-full flex items-center justify-center gap-2 p-2 bg-black text-white font-bold hover:bg-zinc-800 transition-colors shadow-hard-sm">
                   <Plus size={16} />
                   <span className={`${isSidebarVisible ? 'inline' : 'hidden'}`}>New Project</span>
               </button>
          </div>
      </aside>

      {/* --- MAIN LAYOUT --- */}
      <div className="flex-1 flex flex-col h-full min-w-0">
          
          {/* HEADER (View Controls Only) */}
          <header className="bg-paper border-b-2 border-border p-4 shrink-0 z-40 shadow-sm flex items-center justify-between gap-4">
             <div className="flex items-center gap-2">
                 {!isSidebarVisible && (
                     <button onClick={() => setSidebarPinned(true)} className="lg:hidden p-2 hover:bg-zinc-100 rounded">
                         <PanelLeftOpen size={20}/>
                     </button>
                 )}
                 <h2 className="text-xl font-bold truncate">{activeWorkspace.name}</h2>
                 {activeWorkspace.baseJson && (
                     <span className="text-xs bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded-full font-bold">
                         Diff Mode Active
                     </span>
                 )}
             </div>

             <div className="flex items-center gap-2">
                 <Button onClick={handleExpandAll} variant="secondary" className="px-3" title="Expand All">
                    <Maximize2 size={16} />
                </Button>
                <Button onClick={handleCollapseAll} variant="secondary" className="px-3" title="Collapse All">
                    <Minimize2 size={16} />
                </Button>
                {isInitialized && (
                     <Button onClick={handleSmartExpand} variant={diffExpandMode === 'smart' ? 'primary' : 'secondary'} className="px-3" title="Smart Expand (Show Changes Only)">
                        <ListFilter size={16} />
                    </Button>
                )}

                <div className="w-[1px] h-6 bg-zinc-300 mx-2"></div>

                {!isInitialized ? (
                    <Button onClick={handleSetOriginal} icon={<ArrowLeftRight size={16}/>} className="whitespace-nowrap">
                       Set as Original
                    </Button>
                ) : (
                    <>
                        <Button variant="secondary" onClick={handleReset} icon={<RotateCcw size={16} />} title="Reset to Original">
                        </Button>
                        <Button onClick={() => updateActiveWorkspace({ baseJson: null })} variant="danger" icon={<FileText size={16} />} title="Clear Original">
                        </Button>
                    </>
                )}
             </div>
          </header>

          {/* MAIN CONTENT AREA */}
          <main 
             ref={containerRef}
             className="flex-1 w-full p-4 md:p-6 flex flex-col lg:flex-row gap-6 lg:gap-0 overflow-hidden min-h-0"
          >
             
             {/* LEFT PANE: EDITOR */}
             <div 
                className="flex flex-col h-full w-full lg:w-[var(--left-width)] shrink-0 transition-[width] duration-0 ease-linear min-h-0"
                style={{ '--left-width': `${leftPanelWidth}%` } as React.CSSProperties}
             >
                <div className="flex justify-between items-end mb-2 shrink-0">
                   <div className="flex items-center gap-2">
                      <h2 className="font-bold text-lg">Editor</h2>
                      {isInitialized && <span className="text-xs font-mono text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded">MODIFIED</span>}
                   </div>
                   
                   <div className="flex items-center gap-2">
                       {/* Editor Controls */}
                       <div className="flex items-center gap-2 mr-2 border-r pr-2 border-zinc-200">
                           <button 
                              onClick={handleCopyJson} 
                              className={`p-1.5 rounded-md border shadow-sm transition-all flex items-center gap-1 ${copyFeedback ? 'bg-emerald-100 border-emerald-500 text-emerald-700' : 'bg-white hover:bg-zinc-100 border-zinc-300 text-zinc-700'}`}
                              title="Copy JSON content"
                           >
                              {copyFeedback ? <Check size={14} /> : <Copy size={14} />}
                              <span className="text-xs font-bold hidden xl:inline">Copy</span>
                           </button>

                           {editorView === 'text' && (
                               <button 
                                  onClick={formatJson} 
                                  className="bg-white hover:bg-zinc-100 text-zinc-700 p-1.5 rounded-md border border-zinc-300 shadow-sm transition-all flex items-center gap-1"
                                  title="Format JSON"
                               >
                                  <Wand2 size={14} />
                                  <span className="text-xs font-bold hidden xl:inline">Format</span>
                               </button>
                           )}
                       </div>

                       <div className="flex bg-white border-2 border-black shadow-sm rounded-sm overflow-hidden">
                           <button 
                              onClick={() => setEditorView('text')}
                              className={`px-3 py-1 text-xs font-bold flex items-center gap-1 transition-colors ${editorView === 'text' ? 'bg-black text-white' : 'hover:bg-zinc-100 text-zinc-600'}`}
                           >
                              <Code size={14} /> TEXT
                           </button>
                           <button 
                              onClick={() => setEditorView('tree')}
                              className={`px-3 py-1 text-xs font-bold flex items-center gap-1 transition-colors ${editorView === 'tree' ? 'bg-black text-white' : 'hover:bg-zinc-100 text-zinc-600'}`}
                           >
                              <LayoutList size={14} /> TREE
                           </button>
                       </div>
                   </div>
                </div>

                <Card className="flex-1 bg-white relative min-h-0">
                   {/* Removed Floating controls, now in header */}

                   {error && (
                      <div className="absolute bottom-0 left-0 right-0 bg-rose-50 border-t-2 border-rose-400 text-rose-900 px-4 py-3 text-xs font-bold z-20 flex items-center gap-2 shadow-lg">
                         <AlertTriangle size={16} className="shrink-0" /> 
                         <span className="flex-1">
                            {errorLine ? `Line ${errorLine}: ` : ''}{error}
                         </span>
                      </div>
                   )}
                   
                   <div className="absolute inset-0 overflow-hidden">
                       {editorView === 'text' ? (
                           <textarea 
                              ref={textareaRef}
                              className="w-full h-full p-6 font-mono text-sm resize-none focus:outline-none leading-relaxed bg-white text-black block"
                              value={currentText}
                              onChange={(e) => handleTextChange(e.target.value)}
                              onKeyDown={handleKeyDown}
                              onBlur={formatJson}
                              placeholder="Paste JSON here..."
                              spellCheck={false}
                           />
                       ) : (
                           <div className="absolute inset-0 overflow-auto p-4 bg-white">
                              <JsonNavProvider>
                                {activeWorkspace.currentJson ? (
                                   <JsonEditor 
                                      key={`editor-${expandAllKey}`} 
                                      data={activeWorkspace.currentJson} 
                                      onChange={handleObjectChange}
                                      isRoot={true}
                                      defaultOpen={editorExpandAll}
                                      path="#"
                                   />
                                ) : (
                                   <div className="text-zinc-400 text-center mt-10 font-mono text-sm">Valid JSON required for Tree View</div>
                                )}
                              </JsonNavProvider>
                           </div>
                       )}
                   </div>
                </Card>
             </div>

             {/* SPLITTER */}
             <div 
                 className="hidden lg:flex w-4 items-center justify-center cursor-col-resize hover:bg-zinc-200 transition-colors mx-2 rounded shrink-0" 
                 onMouseDown={() => setIsDragging(true)}
                 title="Drag to resize"
             >
                 <div className="w-1 h-8 bg-zinc-300 rounded-full flex items-center justify-center"></div>
             </div>

             {/* RIGHT PANE: DIFF VIEWER */}
             <div className="flex-1 flex flex-col h-full w-full min-w-0 min-h-0">
                 <div className="flex justify-between items-end mb-2 shrink-0">
                    <div className="flex items-center gap-2">
                       <h2 className="font-bold text-lg flex items-center gap-2">
                          <ArrowLeftRight className="text-emerald-600" /> Diff
                       </h2>
                       {isInitialized && <span className="text-xs font-mono text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded">DIFF VIEW</span>}
                    </div>
                    
                    {isInitialized && (
                        <div className="flex gap-2">
                            <span title="Total Added Lines" className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded border border-emerald-100">+{stats.added}</span>
                            <span title="Total Removed Lines" className="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded border border-rose-100">-{stats.removed}</span>
                            <span title="Total Modified Fields" className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-100">~{stats.modified}</span>
                        </div>
                    )}
                 </div>

                 <Card className="flex-1 bg-white min-h-0 relative">
                     <div ref={diffScrollRef} className="absolute inset-0 overflow-auto p-4 pr-6 scroll-smooth">
                        {isInitialized && activeWorkspace.baseJson ? (
                            diffTree ? (
                               <JsonTree 
                                  key={`diff-${expandAllKey}`} 
                                  data={diffTree} 
                                  isRoot={true} 
                                  expandMode={diffExpandMode}
                               />
                            ) : (
                               <div className="flex flex-col items-center justify-center h-full text-zinc-400">
                                  <p>No structural changes detected.</p>
                               </div>
                            )
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-zinc-400 opacity-60 text-center px-8">
                                 <div className="border-2 border-dashed border-zinc-300 p-6 rounded-lg mb-4">
                                    <FileText size={48} className="text-zinc-300" />
                                 </div>
                                 <p className="font-bold text-zinc-600">No Original Version Set</p>
                                 <p className="text-sm mt-2 max-w-xs">
                                   Load files via the sidebar "Compare Files" or click "Set as Original" to start.
                                 </p>
                            </div>
                        )}
                     </div>
                     {/* OVERVIEW RULER (MINIMAP) */}
                     {isInitialized && (
                         <DiffMinimap scrollContainerRef={diffScrollRef} triggerUpdate={diffTree} />
                     )}
                 </Card>
             </div>
          </main>
      </div>

      {/* --- MODALS --- */}

      {/* 1. Export Modal */}
      <Modal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} title="Import / Export">
          <div className="space-y-6">
              
              <div className="bg-zinc-50 p-4 border border-zinc-200 rounded">
                  <Label>Import File</Label>
                  <label className="cursor-pointer flex items-center justify-center gap-2 bg-white border-2 border-dashed border-zinc-300 hover:border-black p-4 mt-2 transition-colors rounded">
                      <Upload size={20} className="text-zinc-400" />
                      <span className="font-bold text-sm text-zinc-600">Click to Upload JSON</span>
                      <input type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
                  </label>
                  <p className="text-[10px] text-zinc-400 mt-2">Supports raw JSON or LineArt Project files.</p>
              </div>

              <div className="border-t border-zinc-200"></div>

              <div>
                  <Label>Export Data</Label>
                  <div className="mt-2 mb-4">
                    <Input 
                        value={exportFilename} 
                        onChange={(e) => setExportFilename(e.target.value)}
                        placeholder="Filename..."
                    />
                  </div>

                  <div className="space-y-2">
                      <label className="flex items-start gap-3 p-3 border border-zinc-200 rounded cursor-pointer hover:bg-zinc-50">
                          <input type="radio" name="mode" className="mt-1" checked={exportMode === 'latest'} onChange={() => setExportMode('latest')} />
                          <div>
                              <div className="font-bold text-sm">Latest Result Only</div>
                              <div className="text-xs text-zinc-500">Exports current JSON state.</div>
                          </div>
                      </label>
                      
                      <label className="flex items-start gap-3 p-3 border border-zinc-200 rounded cursor-pointer hover:bg-zinc-50">
                          <input type="radio" name="mode" className="mt-1" checked={exportMode === 'diff'} onChange={() => setExportMode('diff')} />
                          <div>
                              <div className="font-bold text-sm">Diff Result Structure</div>
                              <div className="text-xs text-zinc-500">Exports computed difference tree.</div>
                          </div>
                      </label>

                      <label className="flex items-start gap-3 p-3 border border-zinc-200 rounded cursor-pointer hover:bg-zinc-50">
                          <input type="radio" name="mode" className="mt-1" checked={exportMode === 'project'} onChange={() => setExportMode('project')} />
                          <div>
                              <div className="font-bold text-sm">Full Project Snapshot</div>
                              <div className="text-xs text-zinc-500">Exports Original + Modified versions.</div>
                          </div>
                      </label>
                  </div>
              </div>

              <div className="flex justify-end pt-2">
                  <Button onClick={handleExport} icon={<Download size={16}/>}>Download</Button>
              </div>
          </div>
      </Modal>

      {/* 2. Workspace Manager Modal */}
      <Modal isOpen={isWorkspaceModalOpen} onClose={() => setIsWorkspaceModalOpen(false)} title="New Project">
           <div className="space-y-4">
               <p className="text-sm text-zinc-500">Create a new empty workspace.</p>
               <div>
                  <Label>Project Name</Label>
                  <Input 
                    placeholder="e.g. API Response V2" 
                    value={newWorkspaceName}
                    onChange={(e) => setNewWorkspaceName(e.target.value)}
                    autoFocus
                  />
               </div>
               <div className="flex justify-end">
                  <Button onClick={handleCreateWorkspace} disabled={!newWorkspaceName.trim()} icon={<Plus size={16}/>}>
                      Create
                  </Button>
               </div>
           </div>
      </Modal>

      {/* 3. Compare Modal */}
      <Modal isOpen={isCompareModalOpen} onClose={() => setIsCompareModalOpen(false)} title="Compare Files">
          <div className="space-y-6">
              <p className="text-sm text-zinc-500">Upload two files to compare. This will overwrite the current workspace.</p>
              
              <div className="grid grid-cols-2 gap-4">
                  <div>
                      <Label className="text-amber-600">1. Original (Base)</Label>
                      <label className={`block mt-2 border-2 border-dashed p-4 rounded cursor-pointer transition-colors ${compareBaseFile ? 'bg-amber-50 border-amber-500' : 'border-zinc-300 hover:border-amber-400'}`}>
                          <div className="flex flex-col items-center gap-2 text-center">
                              {compareBaseFile ? <FileText className="text-amber-600" /> : <Upload className="text-zinc-400"/>}
                              <span className="text-xs font-bold truncate max-w-full">
                                  {compareBaseFile ? 'File Loaded' : 'Upload Original'}
                              </span>
                          </div>
                          <input type="file" accept=".json" onChange={(e) => handleCompareFileLoad(e, 'base')} className="hidden" />
                      </label>
                  </div>

                  <div>
                      <Label className="text-emerald-600">2. Modified (New)</Label>
                      <label className={`block mt-2 border-2 border-dashed p-4 rounded cursor-pointer transition-colors ${compareCurrentFile ? 'bg-emerald-50 border-emerald-500' : 'border-zinc-300 hover:border-emerald-400'}`}>
                          <div className="flex flex-col items-center gap-2 text-center">
                              {compareCurrentFile ? <FileText className="text-emerald-600" /> : <Upload className="text-zinc-400"/>}
                              <span className="text-xs font-bold truncate max-w-full">
                                  {compareCurrentFile ? 'File Loaded' : 'Upload New'}
                              </span>
                          </div>
                          <input type="file" accept=".json" onChange={(e) => handleCompareFileLoad(e, 'current')} className="hidden" />
                      </label>
                  </div>
              </div>

              <div className="flex justify-end pt-4 gap-2">
                   <Button variant="ghost" onClick={() => setIsCompareModalOpen(false)}>Cancel</Button>
                   <Button onClick={applyCompare} disabled={!compareCurrentFile} icon={<ArrowLeftRight size={16}/>}>
                       Start Comparison
                   </Button>
              </div>
          </div>
      </Modal>

    </div>
  );
};

export default App;
