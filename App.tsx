import React, { useState, useMemo, useRef, useEffect } from 'react';
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
  MoreVertical,
  Settings
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
  },
  definitions: {
      region: {
          type: "object",
          properties: {
              x: { type: "number" },
              y: { type: "number" }
          }
      }
  },
  exampleRef: {
      "$ref": "#/definitions/region"
  }
};

const DEFAULT_WORKSPACE: Workspace = {
    id: 'default',
    name: 'Main Project',
    baseJson: null,
    currentJson: INITIAL_JSON_DATA,
    lastModified: Date.now()
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

  // --- Local Editor State (Synced with Active Workspace) ---
  // We keep a local text state for the textarea so users can type invalid JSON freely
  const [currentText, setCurrentText] = useState<string>(JSON.stringify(activeWorkspace.currentJson, null, 2));
  
  // Sync text when workspace changes
  useEffect(() => {
      setCurrentText(JSON.stringify(activeWorkspace.currentJson, null, 2));
      // Reset errors when switching
      setError(null);
      setErrorLine(undefined);
  }, [activeWorkspaceId]); // Only when ID changes, not when JSON changes to avoid cursor jumps

  // UI Controls
  const [editorView, setEditorView] = useState<'text' | 'tree'>('text');
  const [error, setError] = useState<string | null>(null);
  const [errorLine, setErrorLine] = useState<number | undefined>(undefined);
  
  // Modals
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isWorkspaceModalOpen, setIsWorkspaceModalOpen] = useState(false);
  
  // Export State
  const [exportFilename, setExportFilename] = useState("data");
  const [exportMode, setExportMode] = useState<ExportMode>('latest');
  
  // Workspace Management State
  const [newWorkspaceName, setNewWorkspaceName] = useState("");

  // Layout State
  const [expandAllKey, setExpandAllKey] = useState(0);
  const [defaultOpen, setDefaultOpen] = useState(true);
  const [leftPanelWidth, setLeftPanelWidth] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  
  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [cursorPos, setCursorPos] = useState<number | null>(null);

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
          currentJson: { ...INITIAL_JSON_DATA, project: newWorkspaceName },
          lastModified: Date.now()
      };
      setWorkspaces([...workspaces, newSpace]);
      setActiveWorkspaceId(newSpace.id);
      setNewWorkspaceName("");
      setIsWorkspaceModalOpen(false);
  };

  const handleDeleteWorkspace = (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if(workspaces.length <= 1) return; // Prevent deleting last one
      
      const newWorkspaces = workspaces.filter(w => w.id !== id);
      setWorkspaces(newWorkspaces);
      
      if(activeWorkspaceId === id) {
          setActiveWorkspaceId(newWorkspaces[0].id);
      }
  };

  // --- Logic Handlers ---

  const handleTextChange = (text: string) => {
    setCurrentText(text);
    const result = safeParse(text);
    if (result.parsed) {
      updateActiveWorkspace({ currentJson: result.parsed });
      setError(null);
      setErrorLine(undefined);
    } else {
      setError(result.error);
      setErrorLine(result.errorLine);
    }
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

  // --- Import / Export ---

  const handleExport = () => {
      if(exportMode === 'latest') {
          downloadJson(activeWorkspace.currentJson, exportFilename);
      } else if (exportMode === 'diff') {
          // Export the computed diff structure
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
                // Import Full Project State
                updateActiveWorkspace({
                    baseJson: data.base,
                    currentJson: data.current
                });
                setCurrentText(JSON.stringify(data.current, null, 2));
            } else {
                // Regular JSON Import
                updateActiveWorkspace({ 
                    currentJson: data,
                    // If no base is set yet, we might want to set base too? 
                    // Let's stick to current behavior: sets current.
                    baseJson: activeWorkspace.baseJson || data // Auto-set base if empty for convenience
                });
                setCurrentText(JSON.stringify(data, null, 2));
            }
            setError(null);
            setErrorLine(undefined);
        } else {
            setError("Invalid JSON File");
        }
        // Reset input
        e.target.value = '';
    };
    reader.readAsText(file);
  };

  // --- Editor Inputs ---

  const formatJson = () => {
    const result = safeParse(currentText);
    if (result.parsed) {
      const formatted = JSON.stringify(result.parsed, null, 2);
      setCurrentText(formatted);
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
    } else if (['"', '[', '{'].includes(e.key) && selectionStart === selectionEnd) {
         const pairs: any = { '"': '"', '[': ']', '{': '}' };
         e.preventDefault();
         const newText = value.substring(0, selectionStart) + e.key + pairs[e.key] + value.substring(selectionEnd);
         setCurrentText(newText);
         setCursorPos(selectionStart + 1);
    }
  };

  // Restore cursor
  useEffect(() => {
    if (cursorPos !== null && textareaRef.current) {
      textareaRef.current.setSelectionRange(cursorPos, cursorPos);
      setCursorPos(null);
    }
  }, [cursorPos, currentText]);

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
    <div className="h-screen font-sans text-zinc-900 bg-[url('https://www.transparenttextures.com/patterns/graphy.png')] flex flex-col overflow-hidden">
      
      {/* --- HEADER --- */}
      <header className="bg-paper border-b-2 border-border p-4 shrink-0 z-50 shadow-hard-sm">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row gap-4 items-center justify-between">
            
            {/* Logo & Workspaces */}
            <div className="flex items-center gap-4">
               <div className="flex items-center gap-3">
                   <div className="bg-black text-white p-2">
                      <GitBranch size={20} />
                   </div>
                   <div className="hidden sm:block">
                      <h1 className="text-xl font-black tracking-tight uppercase">LineArt Diff</h1>
                   </div>
               </div>

               <div className="h-8 w-[2px] bg-zinc-200"></div>

               {/* Workspace Selector */}
               <div className="relative group">
                    <button 
                        onClick={() => setIsWorkspaceModalOpen(true)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 border border-zinc-300 rounded text-sm font-bold min-w-[140px] justify-between transition-colors"
                    >
                        <span className="truncate max-w-[120px]">{activeWorkspace.name}</span>
                        <FolderOpen size={14} className="text-zinc-500" />
                    </button>
                    {/* Tooltip */}
                    <div className="absolute top-full left-0 mt-2 w-48 bg-black text-white text-xs p-2 rounded shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                        Current Working Directory
                    </div>
               </div>
            </div>

            {/* Global Actions */}
            <div className="flex items-center gap-2 overflow-x-auto">
                <Button onClick={() => setExpandAllKey(k => k + 1)} variant="secondary" className="px-3" title="Expand All">
                    <Maximize2 size={16} />
                </Button>
                <Button onClick={() => { setDefaultOpen(false); setExpandAllKey(k => k + 1); }} variant="secondary" className="px-3" title="Collapse All">
                    <Minimize2 size={16} />
                </Button>
                
                <div className="w-[1px] h-6 bg-zinc-300 mx-2"></div>
                
                {/* Import/Export */}
                <div className="flex gap-2">
                     <label className="cursor-pointer bg-white border-2 border-black px-3 py-2 font-bold shadow-hard hover:-translate-y-1 transition-transform flex items-center gap-2 text-sm select-none">
                        <Upload size={16} /> 
                        <span className="hidden sm:inline">Import</span>
                        <input type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
                    </label>

                    <Button variant="primary" onClick={() => setIsExportModalOpen(true)} icon={<Download size={16}/>}>
                        <span className="hidden sm:inline">Export</span>
                    </Button>
                </div>

                <div className="w-[1px] h-6 bg-zinc-300 mx-2"></div>

                {!isInitialized ? (
                    <Button onClick={handleSetOriginal} icon={<ArrowLeftRight size={16}/>} className="whitespace-nowrap">
                       Start Diffing
                    </Button>
                ) : (
                    <>
                        <Button variant="secondary" onClick={handleReset} icon={<RotateCcw size={16} />} title="Reset to Original">
                        </Button>
                        <Button onClick={() => updateActiveWorkspace({ baseJson: null })} variant="danger" icon={<FileText size={16} />} title="New Diff Session">
                        </Button>
                    </>
                )}
            </div>
        </div>
      </header>

      {/* --- MAIN CONTENT --- */}
      <main 
         ref={containerRef}
         className="flex-1 w-full max-w-7xl mx-auto p-4 md:p-6 flex flex-col lg:flex-row gap-6 lg:gap-0 overflow-hidden min-h-0"
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
               
               <div className="flex bg-white border-2 border-black shadow-sm">
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

            <Card className="flex-1 bg-white relative min-h-0">
               {editorView === 'text' && (
                  <div className="absolute top-4 right-6 z-10">
                     <button 
                        onClick={formatJson} 
                        className="bg-zinc-100 hover:bg-zinc-200 text-zinc-600 p-2 rounded-full border border-zinc-300 shadow-sm transition-transform hover:scale-105"
                        title="Format JSON"
                     >
                        <Wand2 size={16} />
                     </button>
                  </div>
               )}

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
                                  defaultOpen={defaultOpen}
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
                        <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded border border-emerald-100">+{stats.added}</span>
                        <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded border border-rose-100">-{stats.removed}</span>
                        <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-100">~{stats.modified}</span>
                    </div>
                )}
             </div>

             <Card className="flex-1 bg-zinc-50/50 min-h-0">
                 <div className="absolute inset-0 overflow-auto p-4">
                    {isInitialized && activeWorkspace.baseJson ? (
                        diffTree ? (
                           <JsonTree 
                              key={`diff-${expandAllKey}`} 
                              data={diffTree} 
                              isRoot={true} 
                              defaultOpen={defaultOpen} 
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
                               Load a file or click "Start Diffing" to lock the current version.
                             </p>
                        </div>
                    )}
                 </div>
             </Card>
         </div>

      </main>

      {/* --- MODALS --- */}

      {/* 1. Export Modal */}
      <Modal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} title="Export Configuration">
          <div className="space-y-4">
              <div>
                  <Label>Filename</Label>
                  <Input 
                     value={exportFilename} 
                     onChange={(e) => setExportFilename(e.target.value)}
                     placeholder="project-data"
                  />
                  <p className="text-[10px] text-zinc-400 mt-1 text-right">.json will be appended automatically</p>
              </div>

              <div>
                  <Label>Export Mode</Label>
                  <div className="space-y-2 mt-2">
                      <label className="flex items-start gap-3 p-3 border border-zinc-200 rounded cursor-pointer hover:bg-zinc-50">
                          <input type="radio" name="mode" className="mt-1" checked={exportMode === 'latest'} onChange={() => setExportMode('latest')} />
                          <div>
                              <div className="font-bold text-sm">Latest Result Only</div>
                              <div className="text-xs text-zinc-500">Exports the current JSON state. Standard JSON format.</div>
                          </div>
                      </label>
                      
                      <label className="flex items-start gap-3 p-3 border border-zinc-200 rounded cursor-pointer hover:bg-zinc-50">
                          <input type="radio" name="mode" className="mt-1" checked={exportMode === 'diff'} onChange={() => setExportMode('diff')} />
                          <div>
                              <div className="font-bold text-sm">Diff Result Structure</div>
                              <div className="text-xs text-zinc-500">Exports the computed comparison tree showing what changed.</div>
                          </div>
                      </label>

                      <label className="flex items-start gap-3 p-3 border border-zinc-200 rounded cursor-pointer hover:bg-zinc-50">
                          <input type="radio" name="mode" className="mt-1" checked={exportMode === 'project'} onChange={() => setExportMode('project')} />
                          <div>
                              <div className="font-bold text-sm">Full Project Snapshot</div>
                              <div className="text-xs text-zinc-500">Exports both Original and Modified versions to resume work later.</div>
                          </div>
                      </label>
                  </div>
              </div>

              <div className="flex justify-end pt-4">
                  <Button onClick={handleExport} icon={<Download size={16}/>}>Download File</Button>
              </div>
          </div>
      </Modal>

      {/* 2. Workspace Manager Modal */}
      <Modal isOpen={isWorkspaceModalOpen} onClose={() => setIsWorkspaceModalOpen(false)} title="Workspaces">
          <div className="space-y-6">
              
              {/* List */}
              <div className="space-y-2">
                  <Label>Switch Workspace</Label>
                  <div className="max-h-[200px] overflow-y-auto border border-zinc-200 rounded">
                      {workspaces.map(ws => (
                          <div 
                            key={ws.id} 
                            onClick={() => { setActiveWorkspaceId(ws.id); setIsWorkspaceModalOpen(false); }}
                            className={`flex items-center justify-between p-3 cursor-pointer hover:bg-zinc-50 border-b border-zinc-100 last:border-0 ${activeWorkspaceId === ws.id ? 'bg-blue-50/50' : ''}`}
                          >
                             <div className="flex items-center gap-2">
                                {activeWorkspaceId === ws.id && <Check size={14} className="text-blue-600"/>}
                                <span className={`text-sm ${activeWorkspaceId === ws.id ? 'font-bold text-blue-900' : 'text-zinc-700'}`}>
                                    {ws.name}
                                </span>
                             </div>
                             <div className="flex items-center gap-2">
                                <span className="text-[10px] text-zinc-400">
                                    {new Date(ws.lastModified).toLocaleDateString()}
                                </span>
                                {workspaces.length > 1 && (
                                    <button 
                                        onClick={(e) => handleDeleteWorkspace(ws.id, e)} 
                                        className="p-1 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                )}
                             </div>
                          </div>
                      ))}
                  </div>
              </div>

              {/* Create */}
              <div className="bg-zinc-50 p-4 border border-zinc-200 rounded">
                  <Label>Create New Workspace</Label>
                  <div className="flex gap-2 mt-2">
                      <Input 
                        placeholder="Project Name..." 
                        value={newWorkspaceName}
                        onChange={(e) => setNewWorkspaceName(e.target.value)}
                      />
                      <Button onClick={handleCreateWorkspace} disabled={!newWorkspaceName.trim()} icon={<Plus size={16}/>}>
                          Add
                      </Button>
                  </div>
              </div>
          </div>
      </Modal>

    </div>
  );
};

export default App;