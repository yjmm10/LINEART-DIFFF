

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
  X,
  Footprints,
  History,
  Save,
  Clock,
  Home,
  HelpCircle,
  Keyboard,
  MousePointer2,
  GripVertical,
  Zap,
  Columns,
  SquareSplitHorizontal,
  FoldVertical,
  Unlink,
  Undo2,
  Redo2,
  Link2,
  Link2Off
} from 'lucide-react';
import { Button, Card, Modal, Input, Label, Select } from './components/ui';
import JsonTree from './components/JsonTree';
import { JsonEditor } from './components/JsonEditor';
import CodeEditor from './components/CodeEditor';
import { SyncProvider, useSync } from './components/SyncContext';
import { safeParse, generateDiff, downloadJson, isProjectFile, getPathFromIndex, getIndexFromPath, resolveReferences } from './utils';
import { DiffNode, DiffType, Workspace, ExportMode, Snapshot, HistoryState } from './types';
import { LanguageProvider, useLanguage } from './translations';
import { LandingPage } from './components/LandingPage';
import { EditorView } from '@uiw/react-codemirror';

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
    lastModified: Date.now(),
    snapshots: [],
    history: [],
    future: []
};

// --- Minimap Component ---
const DiffMinimap: React.FC<{ scrollContainerRef: React.RefObject<HTMLDivElement | null>; triggerUpdate: any }> = ({ scrollContainerRef, triggerUpdate }) => {
    const [marks, setMarks] = useState<{ top: number; height: number; type: string }[]>([]);

    useEffect(() => {
        const updateMarks = () => {
            const container = scrollContainerRef.current;
            if (!container) return;
            const containerRect = container.getBoundingClientRect();
            const scrollHeight = container.scrollHeight;
            const scrollTop = container.scrollTop;
            if (scrollHeight === 0) return;

            const elements = container.querySelectorAll('[data-diff-status]');
            const newMarks: typeof marks = [];

            elements.forEach((el) => {
                const htmlEl = el as HTMLElement;
                const rect = htmlEl.getBoundingClientRect();
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
        const timeout = setTimeout(updateMarks, 300); 
        const observer = new MutationObserver(updateMarks);
        if (scrollContainerRef.current) observer.observe(scrollContainerRef.current, { childList: true, subtree: true, attributes: true });
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
        const targetTop = percentage * (container.scrollHeight - container.clientHeight);
        container.scrollTo({ top: targetTop, behavior: 'smooth' });
    };

    return (
        <div onClick={handleClick} className="absolute top-0 right-0 bottom-0 w-3.5 z-20 cursor-pointer bg-transparent border-l border-zinc-100/50 hover:bg-zinc-100/30 transition-colors">
            {marks.map((mark, i) => (
                <div key={i} className={`absolute right-0 w-full opacity-80 pointer-events-none ${mark.type === 'added' ? 'bg-emerald-500' : mark.type === 'removed' ? 'bg-rose-500' : 'bg-blue-500'}`} style={{ top: `${mark.top}%`, height: `${Math.max(mark.height, 0.5)}%`, minHeight: '2px' }} />
            ))}
        </div>
    );
};

// --- View Controller (Reusable Editor Panel) ---

interface ViewControllerProps {
    title: string;
    jsonData: any;
    onJsonChange: (newJson: any) => void;
    
    // State managed by useEditorState
    text: string;
    setText: (text: string) => void;
    viewMode: 'text' | 'tree';
    setViewMode: (mode: 'text' | 'tree') => void;
    cursorPos: number | null;
    setCursorPos: (pos: number | null) => void;
    activePath: string;
    setActivePath: (path: string) => void;
    
    syncZone: string;
    syncTarget?: string;
    autoFollow?: boolean;
    isModified?: boolean;
    readOnly?: boolean;
}

const ViewController: React.FC<ViewControllerProps> = ({ 
    title, jsonData, onJsonChange,
    text, setText, viewMode, setViewMode, cursorPos, setCursorPos, activePath, setActivePath,
    syncZone, syncTarget = 'diff', autoFollow, isModified
}) => {
    const { syncTo, registerZone, unregisterZone } = useSync();
    const { t } = useLanguage();
    const [copyFeedback, setCopyFeedback] = useState(false);
    
    // Reference to the CodeMirror EditorView
    const editorViewRef = useRef<EditorView | null>(null);
    
    // Local Expand State
    const [recursiveCmd, setRecursiveCmd] = useState<{ type: 'expand' | 'collapse'; id: number } | undefined>(undefined);

    const handleExpandAll = () => setRecursiveCmd({ type: 'expand', id: Date.now() });
    const handleCollapseAll = () => setRecursiveCmd({ type: 'collapse', id: Date.now() });

    // Handle Text Changes and Parsing
    const handleTextChange = (newText: string) => setText(newText);
    
    useEffect(() => {
        const handler = setTimeout(() => {
            const result = safeParse(text);
            if (result.parsed && JSON.stringify(result.parsed) !== JSON.stringify(jsonData)) {
                onJsonChange(result.parsed);
            }
        }, 800);
        return () => clearTimeout(handler);
    }, [text]);

    const formatJson = () => {
        const result = safeParse(text);
        if (result.parsed) {
          const formatted = JSON.stringify(result.parsed, null, 2);
          setText(formatted);
          onJsonChange(result.parsed);
        }
    };

    const handleSwitchToTree = () => {
        // Force update JSON data from text to ensure sync validity
        const result = safeParse(text);
        if (result.parsed && JSON.stringify(result.parsed) !== JSON.stringify(jsonData)) {
            onJsonChange(result.parsed);
        }

        let effectivePath = activePath;
        if (editorViewRef.current) {
            // Get cursor position from CodeMirror
            const index = editorViewRef.current.state.selection.main.head;
            effectivePath = getPathFromIndex(text, index);
            setActivePath(effectivePath);
        }
        
        setViewMode('tree');
        
        // Pass the locally calculated path to avoid stale state closure issues
        setTimeout(() => {
            if (effectivePath) syncTo(syncZone, effectivePath);
        }, 100);
    };

    const handleSwitchToText = () => {
        // Critical: When switching to text, we must generate the string from the latest Object data
        // to ensure that any edits made in Tree mode are reflected and the path index calc is accurate.
        const currentString = JSON.stringify(jsonData, null, 2);
        setText(currentString);

        if (activePath) {
            const index = getIndexFromPath(currentString, activePath);
            setCursorPos(index);
        }
        setViewMode('text');
    };

    const handleFocusPath = (path: string) => {
        if (path === activePath) return; // Prevent unnecessary updates
        setActivePath(path);
        if (autoFollow) syncTo(syncTarget, path);
    };

    const handleCursorActivity = (view: EditorView) => {
        if (viewMode === 'text') {
            const index = view.state.selection.main.head;
            // Use the text from view state to ensure it's the latest
            const currentText = view.state.doc.toString();
            const path = getPathFromIndex(currentText, index);
            
            if (path === activePath) return; // Prevent loops and duplicate syncs

            setActivePath(path);
            if (autoFollow) syncTo(syncTarget, path);
        }
    };

    // Keep a ref to text so the zone handler always has access to the latest text without re-registering
    const textRef = useRef(text);
    useEffect(() => { textRef.current = text; }, [text]);

    // Register Zone Handler for Text Mode Sync
    useEffect(() => {
        if (viewMode === 'text') {
            registerZone(syncZone, (path) => {
                const index = getIndexFromPath(textRef.current, path);
                setCursorPos(index);
            });
            return () => unregisterZone(syncZone);
        } else {
             unregisterZone(syncZone);
        }
    }, [viewMode, syncZone, registerZone, unregisterZone]);


    // Sync Text Cursor when switching back to Text Mode or syncing from other views
    useEffect(() => {
        if (cursorPos !== null && editorViewRef.current && viewMode === 'text') {
            const view = editorViewRef.current;
            // Ensure the position is valid
            const pos = Math.min(cursorPos, view.state.doc.length);
            
            view.dispatch({
                selection: { anchor: pos, head: pos },
                scrollIntoView: true
            });
            view.focus();
            setCursorPos(null);
        }
    }, [cursorPos, viewMode]);

    const handleCopyJson = () => {
        navigator.clipboard.writeText(text);
        setCopyFeedback(true);
        setTimeout(() => setCopyFeedback(false), 2000);
    };
    
    const handleResolveRefs = () => {
        if (jsonData) {
            const resolved = resolveReferences(jsonData);
            onJsonChange(resolved);
            setText(JSON.stringify(resolved, null, 2));
        }
    };

    const handleObjectChange = (newObj: any) => {
        onJsonChange(newObj);
        // We do NOT update Text immediately here to avoid re-render performance hits
        // Text is updated when switching modes or via the Text Editor's own change handler
    };

    return (
        <>
            <div className="flex justify-between items-end mb-2 shrink-0">
               <div className="flex items-center gap-2">
                  <h2 className="font-bold text-lg">{title}</h2>
                  {isModified && <span className="text-xs font-mono text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded">{t('editor.modified')}</span>}
               </div>
               
               <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 mr-2 border-r pr-2 border-zinc-200">
                           <button onClick={handleCopyJson} className={`p-1.5 rounded-md border shadow-sm transition-all flex items-center gap-1 ${copyFeedback ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-white hover:bg-zinc-100 text-zinc-700 border-zinc-300'}`} title={t('editor.copy')}>
                               {copyFeedback ? <Check size={14} /> : <Copy size={14} />}
                               <span className="text-xs font-bold hidden xl:inline">{copyFeedback ? t('editor.copied') : t('editor.copy')}</span>
                           </button>
                           
                           <button onClick={handleResolveRefs} className="bg-white hover:bg-zinc-100 text-zinc-700 p-1.5 rounded-md border border-zinc-300 shadow-sm transition-all flex items-center gap-1" title={t('editor.resolveRefs')}>
                              <Unlink size={14} />
                              <span className="text-xs font-bold hidden xl:inline">{t('editor.resolveRefs')}</span>
                           </button>

                           {viewMode === 'tree' && (
                               <>
                                   <button onClick={handleExpandAll} className="bg-white hover:bg-zinc-100 text-zinc-700 p-1.5 rounded-md border border-zinc-300 shadow-sm transition-all flex items-center gap-1" title={t('header.expandAll')}>
                                      <Maximize2 size={14} />
                                   </button>
                                   <button onClick={handleCollapseAll} className="bg-white hover:bg-zinc-100 text-zinc-700 p-1.5 rounded-md border border-zinc-300 shadow-sm transition-all flex items-center gap-1" title={t('header.collapseAll')}>
                                      <Minimize2 size={14} />
                                   </button>
                               </>
                           )}

                           {viewMode === 'text' && (
                               <button onClick={formatJson} className="bg-white hover:bg-zinc-100 text-zinc-700 p-1.5 rounded-md border border-zinc-300 shadow-sm transition-all flex items-center gap-1" title={t('editor.format')}>
                                  <Wand2 size={14} />
                                  <span className="text-xs font-bold hidden xl:inline">{t('editor.format')}</span>
                               </button>
                           )}
                       </div>

                       <div className="flex bg-white border-2 border-black shadow-sm rounded-sm overflow-hidden">
                           <button onClick={handleSwitchToText} className={`px-3 py-1 text-xs font-bold flex items-center gap-1 transition-colors ${viewMode === 'text' ? 'bg-black text-white' : 'hover:bg-zinc-100 text-zinc-600'}`}>
                              <Code size={14} /> {t('editor.textMode')}
                           </button>
                           <button onClick={handleSwitchToTree} className={`px-3 py-1 text-xs font-bold flex items-center gap-1 transition-colors ${viewMode === 'tree' ? 'bg-black text-white' : 'hover:bg-zinc-100 text-zinc-600'}`}>
                              <LayoutList size={14} /> {t('editor.treeMode')}
                           </button>
                       </div>
               </div>
            </div>

            <Card className="flex-1 bg-white relative min-h-0">
                <div className="absolute inset-0 overflow-hidden">
                   {viewMode === 'text' ? (
                       <div className="w-full h-full border-none">
                           <CodeEditor 
                                value={text} 
                                onChange={handleTextChange} 
                                onBlur={formatJson}
                                onEditorCreate={(view) => { editorViewRef.current = view; }}
                                onCursorActivity={handleCursorActivity}
                           />
                       </div>
                   ) : (
                       <div className="absolute inset-0 overflow-auto p-4 bg-white">
                            {jsonData ? (
                               <JsonEditor 
                                    data={jsonData} 
                                    onChange={handleObjectChange} 
                                    isRoot={true} 
                                    defaultOpen={true} 
                                    path="#" 
                                    onFocusPath={handleFocusPath} 
                                    syncZone={syncZone} 
                                    syncTarget={syncTarget}
                                    recursiveCommand={recursiveCmd}
                               />
                            ) : (
                               <div className="text-zinc-400 text-center mt-10 font-mono text-sm">{t('editor.invalid')}</div>
                            )}
                       </div>
                   )}
               </div>
            </Card>
        </>
    );
};

// --- Hook: Editor State Management ---
// Manages the internal state of an editor instance (text, cursor, view mode) to decouple from Main Workspace
const useEditorState = (initialJson: any) => {
    const [text, setText] = useState<string>(JSON.stringify(initialJson, null, 2) || "");
    const [viewMode, setViewMode] = useState<'text' | 'tree'>('tree');
    const [cursorPos, setCursorPos] = useState<number | null>(null);
    const [activePath, setActivePath] = useState<string>("#");

    // When external JSON changes (e.g. workspace switch or reset), update text
    // We need a ref to track if the update came from internal typing or external switch
    const lastJsonRef = useRef(initialJson);
    
    useEffect(() => {
        if (JSON.stringify(initialJson) !== JSON.stringify(lastJsonRef.current)) {
            setText(JSON.stringify(initialJson, null, 2) || "");
            lastJsonRef.current = initialJson;
        }
    }, [initialJson]);

    // Update ref when text changes successfully parsed (to avoid loop)
    const handleJsonUpdate = (newJson: any) => {
        lastJsonRef.current = newJson;
    };

    return {
        text, setText,
        viewMode, setViewMode,
        cursorPos, setCursorPos,
        activePath, setActivePath,
        handleJsonUpdate
    };
};

// --- Main Editor Workspace ---
const EditorWorkspace: React.FC<{ 
    onGoHome: () => void; 
    onOpenAbout: () => void;
}> = ({ onGoHome, onOpenAbout }) => {
  const { t, lang, setLang } = useLanguage();

  // --- Workspace State ---
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => {
      const saved = localStorage.getItem('lineart_workspaces');
      let parsed = saved ? JSON.parse(saved) : [DEFAULT_WORKSPACE];
      // Migration for old data structure
      if (Array.isArray(parsed)) parsed = parsed.map((w: any) => ({ 
          ...w, 
          snapshots: w.snapshots || [],
          history: w.history || [],
          future: w.future || []
      }));
      return parsed;
  });
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>(() => localStorage.getItem('lineart_active_id') || 'default');
  const activeWorkspace = useMemo(() => workspaces.find(w => w.id === activeWorkspaceId) || workspaces[0], [workspaces, activeWorkspaceId]);

  useEffect(() => localStorage.setItem('lineart_workspaces', JSON.stringify(workspaces)), [workspaces]);
  useEffect(() => localStorage.setItem('lineart_active_id', activeWorkspaceId), [activeWorkspaceId]);

  // --- Editor States (Base & Current) ---
  const currentEditor = useEditorState(activeWorkspace.currentJson);
  const baseEditor = useEditorState(activeWorkspace.baseJson);

  // --- Sidebar & UI State ---
  const [sidebarPinned, setSidebarPinned] = useState(true);
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const isSidebarVisible = sidebarPinned || sidebarHovered;
  
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  
  const [appViewMode, setAppViewMode] = useState<'diff' | 'split'>('diff');
  const [autoFollow, setAutoFollow] = useState(false);
  
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isWorkspaceModalOpen, setIsWorkspaceModalOpen] = useState(false);
  const [isCompareModalOpen, setIsCompareModalOpen] = useState(false);
  const [isSnapshotModalOpen, setIsSnapshotModalOpen] = useState(false);
  
  const [exportFilename, setExportFilename] = useState("data");
  const [exportMode, setExportMode] = useState<ExportMode>('latest');
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [snapshotName, setSnapshotName] = useState("");
  const [ioTab, setIoTab] = useState<'import' | 'export'>('import');
  
  const [editingSnapshotId, setEditingSnapshotId] = useState<string | null>(null);
  const [editSnapshotName, setEditSnapshotName] = useState("");

  useEffect(() => {
    if (isExportModalOpen) {
        const now = new Date();
        const timestamp = now.toISOString().slice(0,10).replace(/-/g,'') + '_' + now.toTimeString().slice(0,5).replace(':','');
        const safeName = activeWorkspace.name.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9-_]/g, '');
        setExportFilename(`${safeName}_${timestamp}`);
    }
  }, [isExportModalOpen, activeWorkspace.name]);

  const [compareBaseFile, setCompareBaseFile] = useState<any>(null);
  const [compareCurrentFile, setCompareCurrentFile] = useState<any>(null);

  // Local Diff Tree State Controls
  const [expandAllKey, setExpandAllKey] = useState(0);
  const [diffExpandMode, setDiffExpandMode] = useState<'all' | 'none' | 'smart'>('smart');

  const [leftPanelWidth, setLeftPanelWidth] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const diffScrollRef = useRef<HTMLDivElement>(null);

  const updateActiveWorkspace = (updates: Partial<Workspace>) => {
      setWorkspaces(prev => prev.map(w => w.id === activeWorkspaceId ? { ...w, ...updates, lastModified: Date.now() } : w));
  };

  const pushToHistory = () => {
      const currentState: HistoryState = {
          base: JSON.parse(JSON.stringify(activeWorkspace.baseJson)),
          current: JSON.parse(JSON.stringify(activeWorkspace.currentJson)),
          timestamp: Date.now()
      };
      
      const newHistory = [...(activeWorkspace.history || []), currentState];
      if (newHistory.length > 50) newHistory.shift(); // Limit history

      updateActiveWorkspace({
          history: newHistory,
          future: [] // Clear future on new change
      });
  };

  const handleJsonChange = (type: 'base' | 'current', newJson: any) => {
      // Push current state to history before updating
      pushToHistory();

      if (type === 'current') {
          updateActiveWorkspace({ currentJson: newJson });
          currentEditor.handleJsonUpdate(newJson);
      } else {
          updateActiveWorkspace({ baseJson: newJson });
          baseEditor.handleJsonUpdate(newJson);
      }
  };

  const handleUndo = useCallback(() => {
      const history = activeWorkspace.history || [];
      if (history.length === 0) return;

      const previousState = history[history.length - 1];
      const newHistory = history.slice(0, -1);

      const currentState: HistoryState = {
          base: activeWorkspace.baseJson,
          current: activeWorkspace.currentJson,
          timestamp: Date.now()
      };
      
      const newFuture = [currentState, ...(activeWorkspace.future || [])];

      updateActiveWorkspace({
          baseJson: previousState.base,
          currentJson: previousState.current,
          history: newHistory,
          future: newFuture
      });
      
      // Update editors
      currentEditor.handleJsonUpdate(previousState.current);
      baseEditor.handleJsonUpdate(previousState.base);

  }, [activeWorkspace, updateActiveWorkspace, currentEditor, baseEditor]);

  const handleRedo = useCallback(() => {
      const future = activeWorkspace.future || [];
      if (future.length === 0) return;

      const nextState = future[0];
      const newFuture = future.slice(1);

      const currentState: HistoryState = {
          base: activeWorkspace.baseJson,
          current: activeWorkspace.currentJson,
          timestamp: Date.now()
      };

      const newHistory = [...(activeWorkspace.history || []), currentState];

      updateActiveWorkspace({
          baseJson: nextState.base,
          currentJson: nextState.current,
          history: newHistory,
          future: newFuture
      });

      // Update editors
      currentEditor.handleJsonUpdate(nextState.current);
      baseEditor.handleJsonUpdate(nextState.base);

  }, [activeWorkspace, updateActiveWorkspace, currentEditor, baseEditor]);

  // Keyboard Shortcuts for Undo/Redo
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          const target = e.target as HTMLElement;
          // Ignore if focus is in an Input or Textarea (CodeMirror or Native Inputs), let them handle text undo
          const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
          
          if (isInput) return;

          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
              e.preventDefault();
              if (e.shiftKey) handleRedo();
              else handleUndo();
          }
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
              e.preventDefault();
              handleRedo();
          }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);


  const handleCreateWorkspace = () => {
      if(!newWorkspaceName.trim()) return;
      const newSpace: Workspace = {
          id: Date.now().toString(),
          name: newWorkspaceName,
          baseJson: null,
          currentJson: {},
          lastModified: Date.now(),
          snapshots: [],
          history: [],
          future: []
      };
      setWorkspaces([...workspaces, newSpace]);
      setActiveWorkspaceId(newSpace.id);
      setNewWorkspaceName("");
      setIsWorkspaceModalOpen(false);
  };

  const handleDeleteWorkspace = (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if(workspaces.length <= 1) return alert("Cannot delete the only project.");
      if(window.confirm("Are you sure?")) {
          const newWorkspaces = workspaces.filter(w => w.id !== id);
          setWorkspaces(newWorkspaces);
          if(activeWorkspaceId === id) setActiveWorkspaceId(newWorkspaces[0].id);
      }
  };

  const saveRename = (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (editingWorkspaceId && editName.trim()) {
          setWorkspaces(prev => prev.map(w => w.id === editingWorkspaceId ? { ...w, name: editName.trim() } : w));
      }
      setEditingWorkspaceId(null);
  };

  const handleCreateSnapshot = () => {
      const newSnapshot: Snapshot = {
          id: Date.now().toString(),
          name: snapshotName.trim() || `Snapshot #${(activeWorkspace.snapshots?.length || 0) + 1}`,
          timestamp: Date.now(),
          data: JSON.parse(JSON.stringify(activeWorkspace.currentJson))
      };
      updateActiveWorkspace({ snapshots: [newSnapshot, ...(activeWorkspace.snapshots || [])] });
      setSnapshotName("");
      setIsSnapshotModalOpen(false);
  };

  const handleRestoreSnapshot = (snapshot: Snapshot) => {
      if (window.confirm(`${t('modals.snapshots.restore')} "${snapshot.name}"?`)) {
          // Push current state to history before restore
          pushToHistory();
          updateActiveWorkspace({ currentJson: JSON.parse(JSON.stringify(snapshot.data)) });
          // Note: useEffect in useEditorState handles text update
          setIsSnapshotModalOpen(false);
      }
  };

  const handleDeleteSnapshot = (id: string) => {
      if(window.confirm("Are you sure you want to delete this snapshot?")) {
          const newSnapshots = (activeWorkspace.snapshots || []).filter(s => s.id !== id);
          updateActiveWorkspace({ snapshots: newSnapshots });
      }
  };

  const saveSnapshotRename = () => {
      if (editingSnapshotId && editSnapshotName.trim()) {
          updateActiveWorkspace({ snapshots: activeWorkspace.snapshots.map(s => s.id === editingSnapshotId ? { ...s, name: editSnapshotName.trim() } : s) });
      }
      setEditingSnapshotId(null);
  };

  // Logic Handlers
  const handleSetOriginal = () => {
      pushToHistory();
      updateActiveWorkspace({ baseJson: JSON.parse(JSON.stringify(activeWorkspace.currentJson)) });
  };
  
  const handleReset = () => {
    if (activeWorkspace.baseJson) {
      pushToHistory();
      updateActiveWorkspace({ currentJson: JSON.parse(JSON.stringify(activeWorkspace.baseJson)) });
    }
  };
  
  const handleDiffExpandAll = () => { 
      setExpandAllKey(k => k + 1); 
      setDiffExpandMode('all'); 
  };
  const handleDiffCollapseAll = () => { 
      setDiffExpandMode('none'); 
      setExpandAllKey(k => k + 1); 
  };
  const handleDiffSmartExpand = () => { setDiffExpandMode('smart'); setExpandAllKey(k => k + 1); };

  const handleExport = () => {
      const baseName = exportFilename;
      if(exportMode === 'latest') downloadJson(activeWorkspace.currentJson, `${baseName}_new`);
      else if (exportMode === 'diff') downloadJson(generateDiff(activeWorkspace.baseJson, activeWorkspace.currentJson), `${baseName}_diff`);
      else if (exportMode === 'project') downloadJson({ meta: 'lineart-diff-project', version: '1.0', timestamp: Date.now(), base: activeWorkspace.baseJson, current: activeWorkspace.currentJson }, `${baseName}_full`);
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
            pushToHistory();
            const data = result.parsed;
            if (isProjectFile(data)) {
                updateActiveWorkspace({ baseJson: data.base, currentJson: data.current });
            } else {
                updateActiveWorkspace({ currentJson: data, baseJson: activeWorkspace.baseJson || data });
            }
            setIsExportModalOpen(false);
        }
        e.target.value = '';
    };
    reader.readAsText(file);
  };

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
          pushToHistory();
          updateActiveWorkspace({ baseJson: compareBaseFile, currentJson: compareCurrentFile });
          setIsCompareModalOpen(false);
          setCompareBaseFile(null);
          setCompareCurrentFile(null);
      }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;
      setLeftPanelWidth(Math.max(20, Math.min(80, newWidth)));
    };
    const handleMouseUp = () => {
      setIsDragging(false);
      document.body.style.cursor = 'default'; document.body.style.userSelect = 'auto';
      document.querySelectorAll('.pointer-events-overlay').forEach(el => el.remove());
    };
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove); document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none';
      const overlay = document.createElement('div'); overlay.className = 'pointer-events-overlay fixed inset-0 z-[9999] cursor-col-resize';
      document.body.appendChild(overlay);
    }
    return () => { document.removeEventListener('mousemove', handleMouseMove); document.removeEventListener('mouseup', handleMouseUp); };
  }, [isDragging]);

  const diffTree: DiffNode | null = useMemo(() => activeWorkspace.baseJson ? generateDiff(activeWorkspace.baseJson, activeWorkspace.currentJson, 'root') : null, [activeWorkspace.baseJson, activeWorkspace.currentJson]);
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
  const canUndo = (activeWorkspace.history || []).length > 0;
  const canRedo = (activeWorkspace.future || []).length > 0;
  
  return (
    <div className="h-screen flex font-sans text-zinc-900 bg-zinc-50 overflow-hidden">
      <aside className={`h-full bg-paper border-r-2 border-border shadow-hard z-50 flex flex-col transition-all duration-300 ease-in-out relative ${isSidebarVisible ? 'w-64' : 'w-16'}`} onMouseEnter={() => setSidebarHovered(true)} onMouseLeave={() => setSidebarHovered(false)}>
          <div className="p-4 flex items-center justify-between border-b-2 border-zinc-100 h-16 shrink-0 overflow-hidden whitespace-nowrap">
               <div className="flex items-center gap-3">
                   <div className="bg-black text-white p-2 shrink-0 cursor-pointer" onClick={onGoHome}>
                      <GitBranch size={20} />
                   </div>
                   <h1 className={`text-lg font-black tracking-tight uppercase transition-opacity duration-200 cursor-pointer ${isSidebarVisible ? 'opacity-100' : 'opacity-0 w-0'}`} onClick={onGoHome}>LineArt</h1>
               </div>
               {isSidebarVisible && (<button onClick={() => setSidebarPinned(!sidebarPinned)} className="text-zinc-400 hover:text-black transition-colors">{sidebarPinned ? <Pin size={16} className="fill-current" /> : <PinOff size={16} />}</button>)}
          </div>

          <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 space-y-4">
               <div className="space-y-2">
                   {isSidebarVisible && (
                       <div className="px-2 text-xs font-bold text-zinc-400 uppercase tracking-wider flex justify-between items-center">
                           <span>{t('sidebar.projects')}</span>
                           <button onClick={() => setIsWorkspaceModalOpen(true)} className="p-1 hover:bg-zinc-100 rounded text-zinc-600"><Plus size={14} /></button>
                       </div>
                   )}
                   <div className="space-y-1">
                       {workspaces.map(ws => (
                           <div key={ws.id} onClick={() => !editingWorkspaceId && setActiveWorkspaceId(ws.id)} className={`w-full flex items-center gap-3 p-2 rounded-md transition-all group cursor-pointer ${activeWorkspaceId === ws.id ? 'bg-zinc-100 shadow-hard-sm border-2 border-black' : 'hover:bg-zinc-50 border-2 border-transparent'}`} title={ws.name}>
                               <div className="shrink-0 text-zinc-500 group-hover:text-black"><FolderOpen size={18} /></div>
                               <div className={`flex-1 min-w-0 flex items-center justify-between ${isSidebarVisible ? 'opacity-100' : 'opacity-0 w-0'} transition-opacity overflow-hidden`}>
                                   {editingWorkspaceId === ws.id ? (
                                       <div className="flex items-center gap-1 w-full" onClick={e => e.stopPropagation()}>
                                            <input className="w-full min-w-0 bg-white border-b border-black text-sm px-1 focus:outline-none" value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={e => { if(e.key === 'Enter') saveRename(e as any); if(e.key === 'Escape') setEditingWorkspaceId(null); }} onClick={e => e.stopPropagation()} autoFocus />
                                            <button onClick={(e) => saveRename(e)} className="text-emerald-600 hover:bg-emerald-100 p-0.5 rounded"><Check size={14}/></button>
                                       </div>
                                   ) : (
                                       <>
                                           <span className="text-sm font-bold truncate pr-2 select-none">{ws.name}</span>
                                           <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                               <button onClick={(e) => { e.stopPropagation(); setEditingWorkspaceId(ws.id); setEditName(ws.name); }} className="p-1 text-zinc-400 hover:text-black hover:bg-zinc-200 rounded" title={t('sidebar.rename')}><Edit2 size={12} /></button>
                                               <button onClick={(e) => handleDeleteWorkspace(ws.id, e)} className="p-1 text-zinc-400 hover:text-rose-600 hover:bg-rose-100 rounded" title={t('sidebar.delete')}><Trash2 size={12} /></button>
                                           </div>
                                       </>
                                   )}
                               </div>
                           </div>
                       ))}
                   </div>
               </div>
               <div className="border-t border-zinc-200 my-2"></div>
               <div className="space-y-1">
                   {isSidebarVisible && <div className="px-2 text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">{t('sidebar.tools')}</div>}
                   <button onClick={() => setIsCompareModalOpen(true)} className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-zinc-50 border-2 border-transparent hover:border-zinc-200 text-zinc-600 transition-all" title={t('sidebar.compare')}><FileDiff size={18} /><span className={`text-sm font-medium whitespace-nowrap ${isSidebarVisible ? 'opacity-100' : 'opacity-0 w-0'}`}>{t('sidebar.compare')}</span></button>
                   <button onClick={() => setIsExportModalOpen(true)} className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-zinc-50 border-2 border-transparent hover:border-zinc-200 text-zinc-600 transition-all" title={t('sidebar.importExport')}><Upload size={18} /><span className={`text-sm font-medium whitespace-nowrap ${isSidebarVisible ? 'opacity-100' : 'opacity-0 w-0'}`}>{t('sidebar.importExport')}</span></button>
                   <button onClick={onOpenAbout} className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-zinc-50 border-2 border-transparent hover:border-zinc-200 text-zinc-600 transition-all" title={t('hero.about')}><HelpCircle size={18} /><span className={`text-sm font-medium whitespace-nowrap ${isSidebarVisible ? 'opacity-100' : 'opacity-0 w-0'}`}>{t('hero.about')}</span></button>
               </div>
          </div>
          <div className="p-2 border-t border-zinc-200 shrink-0 flex flex-col gap-2">
               <button onClick={() => setLang(lang === 'en' ? 'zh' : 'en')} className={`w-full flex items-center justify-center gap-2 p-1.5 rounded transition-colors text-xs font-bold uppercase ${isSidebarVisible ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-600' : 'hidden'}`}>{lang === 'en' ? 'Switch to 中文' : 'Switch to English'}</button>
               <button onClick={() => setIsWorkspaceModalOpen(true)} className="w-full flex items-center justify-center gap-2 p-2 bg-black text-white font-bold hover:bg-zinc-800 transition-colors shadow-hard-sm"><Plus size={16} /><span className={`${isSidebarVisible ? 'inline' : 'hidden'}`}>{t('sidebar.newProject')}</span></button>
          </div>
      </aside>

      <div className="flex-1 flex flex-col h-full min-w-0">
          <header className="bg-paper border-b-2 border-border p-4 shrink-0 z-40 shadow-sm flex items-center justify-between gap-4">
             <div className="flex items-center gap-2">
                 {!isSidebarVisible && (<button onClick={() => setSidebarPinned(true)} className="lg:hidden p-2 hover:bg-zinc-100 rounded"><PanelLeftOpen size={20}/></button>)}
                 <h2 className="text-xl font-bold truncate">{activeWorkspace.name}</h2>
                 {activeWorkspace.baseJson && <span className="text-xs bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded-full font-bold">{t('header.diffActive')}</span>}
             </div>
             
             {/* View Switcher */}
             <div className="hidden md:flex bg-zinc-100 p-0.5 rounded-md border border-zinc-200">
                 <button onClick={() => setAppViewMode('diff')} className={`px-3 py-1.5 text-xs font-bold flex items-center gap-1.5 rounded-sm transition-all ${appViewMode === 'diff' ? 'bg-white shadow-sm text-black' : 'text-zinc-500 hover:text-zinc-700'}`}>
                    <Columns size={14} /> {t('header.modeDiff')}
                 </button>
                 <button onClick={() => setAppViewMode('split')} className={`px-3 py-1.5 text-xs font-bold flex items-center gap-1.5 rounded-sm transition-all ${appViewMode === 'split' ? 'bg-white shadow-sm text-black' : 'text-zinc-500 hover:text-zinc-700'}`}>
                    <SquareSplitHorizontal size={14} /> {t('header.modeSplit')}
                 </button>
             </div>

             <div className="flex items-center gap-2">
                 {isInitialized && <button onClick={() => setAutoFollow(!autoFollow)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs uppercase font-bold border transition-colors ${autoFollow ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-white text-zinc-400 border-zinc-200 hover:border-zinc-300 hover:text-zinc-600'}`} title={t('diff.autoFollow')}>{autoFollow ? <Link2 size={16}/> : <Link2Off size={16}/>}<span className="hidden xl:inline">{t('diff.autoFollow')}</span></button>}
                 <div className="flex bg-zinc-100 rounded-md border border-zinc-200 mr-2">
                     <button disabled={!canUndo} onClick={handleUndo} className="p-2 hover:bg-white rounded-l text-zinc-600 hover:text-black disabled:opacity-30 disabled:hover:bg-transparent" title="Undo (Ctrl+Z)"><Undo2 size={16} /></button>
                     <div className="w-[1px] bg-zinc-200"></div>
                     <button disabled={!canRedo} onClick={handleRedo} className="p-2 hover:bg-white rounded-r text-zinc-600 hover:text-black disabled:opacity-30 disabled:hover:bg-transparent" title="Redo (Ctrl+Y)"><Redo2 size={16} /></button>
                 </div>
                 
                 <Button variant="secondary" onClick={() => setIsSnapshotModalOpen(true)} icon={<History size={16} />} title={t('header.snapshots')} className="relative"><span className="hidden sm:inline">{t('header.snapshots')}</span>{(activeWorkspace.snapshots?.length || 0) > 0 && <span className="absolute -top-2 -right-2 w-5 h-5 bg-black text-white rounded-full text-[10px] flex items-center justify-center border border-white">{activeWorkspace.snapshots.length}</span>}</Button>
                 {!isInitialized ? <Button onClick={handleSetOriginal} icon={<ArrowLeftRight size={16}/>} className="whitespace-nowrap">{t('header.setOriginal')}</Button> : <><Button variant="secondary" onClick={handleReset} icon={<RotateCcw size={16} />} title={t('header.reset')}></Button><Button onClick={() => updateActiveWorkspace({ baseJson: null })} variant="danger" icon={<FileText size={16} />} title={t('header.clear')}></Button></>}
             </div>
          </header>

          <SyncProvider>
            <main ref={containerRef} className="flex-1 w-full p-4 md:p-6 flex flex-col lg:flex-row gap-6 lg:gap-0 overflow-hidden min-h-0">
                {/* Left Panel: Either Current (in Diff Mode) or Base (in Split Mode) */}
                
                <div className="flex flex-col h-full w-full lg:w-[var(--left-width)] shrink-0 transition-[width] duration-0 ease-linear min-h-0" style={{ '--left-width': `${leftPanelWidth}%` } as React.CSSProperties}>
                    {appViewMode === 'split' ? (
                         /* Split Mode: Left Panel = Base Editor */
                        <ViewController 
                            title={t('editor.titleBase')}
                            jsonData={activeWorkspace.baseJson}
                            onJsonChange={(newJson) => handleJsonChange('base', newJson)}
                            syncZone="editor-base"
                            syncTarget="editor-current"
                            {...baseEditor}
                            autoFollow={autoFollow}
                        />
                    ) : (
                         /* Diff Mode: Left Panel = Current Editor */
                        <ViewController 
                            title={t('editor.title')}
                            jsonData={activeWorkspace.currentJson}
                            onJsonChange={(newJson) => handleJsonChange('current', newJson)}
                            syncZone="editor"
                            syncTarget="diff"
                            {...currentEditor}
                            autoFollow={autoFollow}
                            isModified={isInitialized}
                        />
                    )}
                </div>
                
                {/* Draggable Divider */}
                <div className="hidden lg:flex w-4 items-center justify-center cursor-col-resize hover:bg-zinc-200 transition-colors mx-2 rounded shrink-0" onMouseDown={() => setIsDragging(true)} title="Drag to resize"><div className="w-1 h-8 bg-zinc-300 rounded-full flex items-center justify-center"></div></div>
                
                {/* Right Panel */}
                <div className="flex-1 flex flex-col h-full w-full min-w-0 min-h-0">
                    {appViewMode === 'split' ? (
                        /* Split Mode: Right Panel = Current Editor */
                        <ViewController 
                            title={t('editor.titleCurrent')}
                            jsonData={activeWorkspace.currentJson}
                            onJsonChange={(newJson) => handleJsonChange('current', newJson)}
                            syncZone="editor-current"
                            syncTarget="editor-base"
                            {...currentEditor}
                            autoFollow={autoFollow}
                            isModified={true}
                        />
                    ) : (
                        /* Diff Mode: Right Panel = Diff Tree */
                        <>
                            <div className="flex justify-between items-end mb-2 shrink-0">
                                <div className="flex items-center gap-2">
                                    <h2 className="font-bold text-lg flex items-center gap-2"><ArrowLeftRight className="text-emerald-600" /> {t('diff.title')}</h2>
                                    {isInitialized && <span className="text-xs font-mono text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded">{t('diff.view')}</span>}
                                </div>
                                {isInitialized && <div className="flex gap-2">
                                     <button onClick={handleDiffExpandAll} className="bg-white hover:bg-zinc-100 text-zinc-700 p-1.5 rounded-md border border-zinc-300 shadow-sm transition-all flex items-center gap-1" title={t('header.expandAll')}>
                                        <Maximize2 size={14} />
                                     </button>
                                     <button onClick={handleDiffCollapseAll} className="bg-white hover:bg-zinc-100 text-zinc-700 p-1.5 rounded-md border border-zinc-300 shadow-sm transition-all flex items-center gap-1" title={t('header.collapseAll')}>
                                        <Minimize2 size={14} />
                                     </button>
                                     <button onClick={handleDiffSmartExpand} className={`p-1.5 rounded-md border shadow-sm transition-all flex items-center gap-1 ${diffExpandMode === 'smart' ? 'bg-zinc-800 text-white border-black' : 'bg-white hover:bg-zinc-100 text-zinc-700 border-zinc-300'}`} title={t('header.smartExpand')}>
                                        <ListFilter size={14} />
                                     </button>
                                     
                                     <div className="w-[1px] h-6 bg-zinc-200 mx-1"></div>

                                     <span title="Total Added Lines" className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded border border-emerald-100">+{stats.added}</span><span title="Total Removed Lines" className="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded border border-rose-100">-{stats.removed}</span><span title="Total Modified Fields" className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-100">~{stats.modified}</span>
                                </div>}
                            </div>
                            <Card className="flex-1 bg-white min-h-0 relative">
                                <div ref={diffScrollRef} className="absolute inset-0 overflow-auto p-4 pr-6 scroll-smooth">
                                    {isInitialized && activeWorkspace.baseJson ? ( diffTree ? <JsonTree key={`diff-${expandAllKey}`} data={diffTree} isRoot={true} expandMode={diffExpandMode} path="#" onFocusPath={(p) => { if(autoFollow) currentEditor.setActivePath(p); if(autoFollow) useSync().syncTo('editor', p); }} /> : <div className="flex flex-col items-center justify-center h-full text-zinc-400"><p>{t('diff.noChanges')}</p></div> ) : <div className="flex flex-col items-center justify-center h-full text-zinc-400 opacity-60 text-center px-8"><div className="border-2 border-dashed border-zinc-300 p-6 rounded-lg mb-4"><FileText size={48} className="text-zinc-300" /></div><p className="font-bold text-zinc-600">{t('diff.noBase')}</p><p className="text-sm mt-2 max-w-xs">{t('diff.noBaseDesc')}</p></div>}
                                </div>
                                {isInitialized && <DiffMinimap scrollContainerRef={diffScrollRef} triggerUpdate={diffTree} />}
                            </Card>
                        </>
                    )}
                </div>
            </main>
          </SyncProvider>
      </div>

      {/* --- MODALS --- */}
      <Modal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} title={t('modals.importExport.title')}>
          <div className="flex border-b border-zinc-200 mb-6">
              <button onClick={() => setIoTab('import')} className={`flex-1 pb-2 text-sm font-bold uppercase tracking-wide transition-colors ${ioTab === 'import' ? 'border-b-2 border-black text-black' : 'text-zinc-400 hover:text-zinc-600'}`}>{t('modals.importExport.importTab')}</button>
              <button onClick={() => setIoTab('export')} className={`flex-1 pb-2 text-sm font-bold uppercase tracking-wide transition-colors ${ioTab === 'export' ? 'border-b-2 border-black text-black' : 'text-zinc-400 hover:text-zinc-600'}`}>{t('modals.importExport.exportTab')}</button>
          </div>
          <div className="min-h-[200px]">
              {ioTab === 'import' ? (
                  <div className="space-y-4 animate-in fade-in slide-in-from-left-2 duration-200"><div className="bg-zinc-50 p-6 border border-zinc-200 rounded text-center"><div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm border border-zinc-100"><Upload size={24} className="text-zinc-400" /></div><Label className="text-center mb-2">{t('modals.importExport.uploadLabel')}</Label><p className="text-xs text-zinc-400 mb-4 max-w-[200px] mx-auto">Supports standard .json files or LineArt Project snapshots.</p><label className="inline-flex"><span className="cursor-pointer bg-black text-white px-4 py-2 text-sm font-bold rounded shadow-hard-sm hover:translate-y-0.5 hover:translate-x-0.5 hover:shadow-none transition-all flex items-center gap-2"><FolderOpen size={16} /> Choose File</span><input type="file" accept=".json" onChange={handleFileUpload} className="hidden" /></label></div></div>
              ) : (
                  <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-200">
                     <div><Label>{t('modals.importExport.filename')}</Label><div className="flex items-center gap-2 mt-2"><Input value={exportFilename} onChange={(e) => setExportFilename(e.target.value)} placeholder="my-data" className="font-mono" /><div className="px-3 py-2 bg-zinc-100 border-2 border-zinc-200 text-zinc-500 text-sm font-bold rounded">.json</div></div></div>
                    <div className="space-y-2"><Label>{t('modals.importExport.type')}</Label>
                         <label className="flex items-start gap-3 p-3 border border-zinc-200 rounded cursor-pointer hover:bg-zinc-50 transition-colors"><input type="radio" name="mode" className="mt-1" checked={exportMode === 'latest'} onChange={() => setExportMode('latest')} /><div><div className="font-bold text-sm">{t('modals.importExport.latest')}</div></div></label>
                         <label className="flex items-start gap-3 p-3 border border-zinc-200 rounded cursor-pointer hover:bg-zinc-50 transition-colors"><input type="radio" name="mode" className="mt-1" checked={exportMode === 'diff'} onChange={() => setExportMode('diff')} /><div><div className="font-bold text-sm">{t('modals.importExport.diff')}</div></div></label>
                         <label className="flex items-start gap-3 p-3 border border-zinc-200 rounded cursor-pointer hover:bg-zinc-50 transition-colors"><input type="radio" name="mode" className="mt-1" checked={exportMode === 'project'} onChange={() => setExportMode('project')} /><div><div className="font-bold text-sm">{t('modals.importExport.project')}</div></div></label>
                    </div>
                    <Button onClick={handleExport} icon={<Download size={16}/>} className="w-full">{t('modals.importExport.download')}</Button>
                </div>
              )}
          </div>
      </Modal>

       <Modal isOpen={isSnapshotModalOpen} onClose={() => setIsSnapshotModalOpen(false)} title={t('modals.snapshots.title')}>
          <div className="space-y-6">
              <div className="bg-zinc-50 p-4 border border-zinc-200 rounded"><Label>{t('modals.snapshots.create')}</Label><div className="flex gap-2 mt-2"><Input placeholder={t('modals.snapshots.placeholder')} value={snapshotName} onChange={(e) => setSnapshotName(e.target.value)} onKeyDown={(e) => { if(e.key === 'Enter') handleCreateSnapshot(); }} /><Button onClick={handleCreateSnapshot} icon={<Save size={16} />}>{t('modals.snapshots.save')}</Button></div></div>
              <div><div className="flex justify-between items-center mb-2"><Label>{t('modals.snapshots.history')}</Label><span className="text-[10px] text-zinc-400 uppercase font-bold">{activeWorkspace.snapshots?.length || 0} Snapshots</span></div><div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                      {(!activeWorkspace.snapshots || activeWorkspace.snapshots.length === 0) && <div className="text-center py-8 text-zinc-400 text-sm border-2 border-dashed border-zinc-200 rounded">{t('modals.snapshots.empty')}</div>}
                      {activeWorkspace.snapshots?.map(snap => (
                          <div key={snap.id} className="group flex justify-between items-center p-3 border border-zinc-200 rounded hover:bg-zinc-50 transition-colors bg-white">
                              <div className="min-w-0 flex-1 mr-2">{editingSnapshotId === snap.id ? (<div className="flex items-center gap-1 w-full" onClick={e => e.stopPropagation()}><input className="w-full min-w-0 bg-white border-b border-black text-sm px-1 focus:outline-none" value={editSnapshotName} onChange={e => setEditSnapshotName(e.target.value)} onKeyDown={e => { if(e.key === 'Enter') saveSnapshotRename(); if(e.key === 'Escape') setEditingSnapshotId(null); }} autoFocus /><button onClick={saveSnapshotRename} className="text-emerald-600 hover:bg-emerald-100 p-0.5 rounded"><Check size={14}/></button><button onClick={() => setEditingSnapshotId(null)} className="text-rose-600 hover:bg-rose-100 p-0.5 rounded"><X size={14}/></button></div>) : (<><div className="font-bold text-sm truncate pr-2" title={snap.name}>{snap.name}</div><div className="flex items-center gap-1 text-[10px] text-zinc-400"><Clock size={10} />{new Date(snap.timestamp).toLocaleString()}</div></>)}</div>
                              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                  {editingSnapshotId !== snap.id && <button onClick={() => { setEditingSnapshotId(snap.id); setEditSnapshotName(snap.name); }} className="p-1.5 text-zinc-500 bg-zinc-50 hover:bg-zinc-100 rounded border border-zinc-200" title="Rename"><Edit2 size={14} /></button>}
                                  <button onClick={() => handleRestoreSnapshot(snap)} className="p-1.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200" title={t('modals.snapshots.restore')}><RotateCcw size={14} /></button>
                                  <button onClick={() => handleDeleteSnapshot(snap.id)} className="p-1.5 text-rose-600 bg-rose-50 hover:bg-rose-100 rounded border border-rose-200" title={t('modals.snapshots.delete')}><Trash2 size={14} /></button>
                              </div>
                          </div>
                      ))}
                  </div></div>
          </div>
      </Modal>

      <Modal isOpen={isWorkspaceModalOpen} onClose={() => setIsWorkspaceModalOpen(false)} title={t('modals.newProject.title')}>
           <div className="space-y-4"><p className="text-sm text-zinc-500">{t('modals.newProject.desc')}</p><div><Label>{t('modals.newProject.label')}</Label><Input placeholder={t('modals.newProject.placeholder')} value={newWorkspaceName} onChange={(e) => setNewWorkspaceName(e.target.value)} autoFocus /></div><div className="flex justify-end"><Button onClick={handleCreateWorkspace} disabled={!newWorkspaceName.trim()} icon={<Plus size={16}/>}>{t('modals.newProject.create')}</Button></div></div>
      </Modal>

      <Modal isOpen={isCompareModalOpen} onClose={() => setIsCompareModalOpen(false)} title={t('modals.compare.title')}>
          <div className="space-y-6"><p className="text-sm text-zinc-500">{t('modals.compare.desc')}</p><div className="grid grid-cols-2 gap-4"><div><Label className="text-amber-600">{t('modals.compare.base')}</Label><label className={`block mt-2 border-2 border-dashed p-4 rounded cursor-pointer transition-colors ${compareBaseFile ? 'bg-amber-50 border-amber-500' : 'border-zinc-300 hover:border-amber-400'}`}><div className="flex flex-col items-center gap-2 text-center">{compareBaseFile ? <FileText className="text-amber-600" /> : <Upload className="text-zinc-400"/>}<span className="text-xs font-bold truncate max-w-full">{compareBaseFile ? t('modals.compare.loaded') : t('modals.compare.upload')}</span></div><input type="file" accept=".json" onChange={(e) => handleCompareFileLoad(e, 'base')} className="hidden" /></label></div><div><Label className="text-emerald-600">{t('modals.compare.new')}</Label><label className={`block mt-2 border-2 border-dashed p-4 rounded cursor-pointer transition-colors ${compareCurrentFile ? 'bg-emerald-50 border-emerald-500' : 'border-zinc-300 hover:border-emerald-400'}`}><div className="flex flex-col items-center gap-2 text-center">{compareCurrentFile ? <FileText className="text-emerald-600" /> : <Upload className="text-zinc-400"/>}<span className="text-xs font-bold truncate max-w-full">{compareCurrentFile ? t('modals.compare.loaded') : t('modals.compare.upload')}</span></div><input type="file" accept=".json" onChange={(e) => handleCompareFileLoad(e, 'current')} className="hidden" /></label></div></div><div className="flex justify-end pt-4 gap-2"><Button variant="ghost" onClick={() => setIsCompareModalOpen(false)}>{t('modals.compare.cancel')}</Button><Button onClick={applyCompare} disabled={!compareCurrentFile} icon={<ArrowLeftRight size={16}/>}>{t('modals.compare.start')}</Button></div></div>
      </Modal>
    </div>
  );
};

// --- About Modal ---
const AboutModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { t } = useLanguage();
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('modals.about.title')}>
       <div className="space-y-8">
          {/* Features Section */}
          <section>
             <h4 className="font-black text-sm uppercase tracking-wider text-zinc-400 mb-4">{t('hero.features')}</h4>
             <div className="grid grid-cols-1 gap-3">
                <div className="p-3 bg-zinc-50 border border-zinc-200 rounded flex gap-3">
                    <div className="mt-0.5 text-zinc-500"><LayoutList size={16} /></div>
                    <div>
                        <h5 className="font-bold text-sm">{t('features.format.title')}</h5>
                        <p className="text-xs text-zinc-500 mt-1">{t('features.format.desc')}</p>
                    </div>
                </div>
                <div className="p-3 bg-zinc-50 border border-zinc-200 rounded flex gap-3">
                    <div className="mt-0.5 text-zinc-500"><ArrowLeftRight size={16} /></div>
                    <div>
                        <h5 className="font-bold text-sm">{t('features.diff.title')}</h5>
                        <p className="text-xs text-zinc-500 mt-1">{t('features.diff.desc')}</p>
                    </div>
                </div>
             </div>
          </section>

          {/* Pro Tips Section */}
          <section>
             <h4 className="font-black text-sm uppercase tracking-wider text-zinc-400 mb-4">{t('guide.tips.title')}</h4>
             <div className="space-y-4">
                 <div className="flex gap-4 items-start group">
                     <div className="shrink-0 w-10 h-10 bg-white border-2 border-zinc-100 group-hover:border-black rounded flex items-center justify-center text-zinc-400 group-hover:text-black transition-colors shadow-sm">
                         <GripVertical size={20} />
                     </div>
                     <div>
                         <h5 className="font-bold text-sm">{t('guide.tips.dnd')}</h5>
                         <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{t('guide.tips.dndDesc')}</p>
                     </div>
                 </div>
                 
                 <div className="flex gap-4 items-start group">
                     <div className="shrink-0 w-10 h-10 bg-white border-2 border-zinc-100 group-hover:border-accent rounded flex items-center justify-center text-zinc-400 group-hover:text-accent transition-colors shadow-sm">
                         <MousePointer2 size={20} />
                     </div>
                     <div>
                         <h5 className="font-bold text-sm">{t('guide.tips.jump')}</h5>
                         <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{t('guide.tips.jumpDesc')}</p>
                     </div>
                 </div>

                 <div className="flex gap-4 items-start group">
                     <div className="shrink-0 w-10 h-10 bg-white border-2 border-zinc-100 group-hover:border-emerald-500 rounded flex items-center justify-center text-zinc-400 group-hover:text-emerald-500 transition-colors shadow-sm">
                         <Zap size={20} />
                     </div>
                     <div>
                         <h5 className="font-bold text-sm">{t('guide.tips.actions')}</h5>
                         <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{t('guide.tips.actionsDesc')}</p>
                     </div>
                 </div>

                 <div className="flex gap-4 items-start group">
                     <div className="shrink-0 w-10 h-10 bg-white border-2 border-zinc-100 group-hover:border-indigo-500 rounded flex items-center justify-center text-zinc-400 group-hover:text-indigo-500 transition-colors shadow-sm">
                         <FoldVertical size={20} />
                     </div>
                     <div>
                         <h5 className="font-bold text-sm">{t('guide.tips.folding')}</h5>
                         <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{t('guide.tips.foldingDesc')}</p>
                     </div>
                 </div>
             </div>
          </section>
          
          {/* Shortcuts */}
          <section className="bg-zinc-100 rounded p-4">
              <h4 className="font-bold text-xs uppercase tracking-wider text-zinc-500 mb-3">{t('guide.shortcuts.title')}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="flex items-center justify-between bg-white p-2 rounded border border-zinc-200">
                      <span>{t('guide.shortcuts.format')}</span>
                      <kbd className="font-mono bg-zinc-50 border border-zinc-200 px-1.5 py-0.5 rounded text-[10px] text-zinc-500">Blur</kbd>
                  </div>
                  <div className="flex items-center justify-between bg-white p-2 rounded border border-zinc-200">
                      <span>{t('guide.shortcuts.expand')}</span>
                      <kbd className="font-mono bg-zinc-50 border border-zinc-200 px-1.5 py-0.5 rounded text-[10px] text-zinc-500">Click</kbd>
                  </div>
                  <div className="flex items-center justify-between bg-white p-2 rounded border border-zinc-200">
                      <span>Undo</span>
                      <kbd className="font-mono bg-zinc-50 border border-zinc-200 px-1.5 py-0.5 rounded text-[10px] text-zinc-500">Ctrl+Z</kbd>
                  </div>
                  <div className="flex items-center justify-between bg-white p-2 rounded border border-zinc-200">
                      <span>Redo</span>
                      <kbd className="font-mono bg-zinc-50 border border-zinc-200 px-1.5 py-0.5 rounded text-[10px] text-zinc-500">Ctrl+Y</kbd>
                  </div>
              </div>
          </section>
          
          <div className="text-center text-xs text-zinc-300">
             LineArt JSON v2.0.0
          </div>
       </div>
    </Modal>
  );
};

// --- Main App Wrapper ---
const MainApp = () => {
    const [view, setView] = useState<'landing' | 'app'>('landing');
    const [isAboutOpen, setIsAboutOpen] = useState(false);

    // Persist view state slightly (optional, mostly for dev refreshing)
    useEffect(() => {
        const lastView = localStorage.getItem('lineart_view');
        if (lastView === 'app') setView('app');
    }, []);

    const goToApp = () => {
        setView('app');
        localStorage.setItem('lineart_view', 'app');
    };

    const goToLanding = () => {
        setView('landing');
        localStorage.setItem('lineart_view', 'landing');
    };

    return (
        <>
            {view === 'landing' ? (
                <LandingPage onStart={goToApp} onOpenAbout={() => setIsAboutOpen(true)} />
            ) : (
                <EditorWorkspace onGoHome={goToLanding} onOpenAbout={() => setIsAboutOpen(true)} />
            )}
            <AboutModal isOpen={isAboutOpen} onClose={() => setIsAboutOpen(false)} />
        </>
    );
};

const App: React.FC = () => {
  return (
    <LanguageProvider>
       <MainApp />
    </LanguageProvider>
  );
};

export default App;
