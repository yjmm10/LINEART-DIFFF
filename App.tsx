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
  GripVertical
} from 'lucide-react';
import { Button, Card } from './components/ui';
import JsonTree from './components/JsonTree';
import { JsonEditor, JsonNavProvider } from './components/JsonEditor';
import { safeParse, generateDiff } from './utils';
import { DiffNode, DiffType } from './types';

const INITIAL_DATA = {
  project: "LineArt JSON",
  version: "2.0.0",
  features: ["Text Editing", "Tree Editing", "Git-style Diff"],
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

const App: React.FC = () => {
  // --- State ---
  // The "Original" JSON (Base for diff)
  const [baseJson, setBaseJson] = useState<any | null>(null);
  
  // The "Current" JSON (Edited version)
  const [currentText, setCurrentText] = useState<string>(JSON.stringify(INITIAL_DATA, null, 2));
  const [currentJson, setCurrentJson] = useState<any>(INITIAL_DATA);
  
  // UI Controls
  const [editorView, setEditorView] = useState<'text' | 'tree'>('text');
  const [error, setError] = useState<string | null>(null);
  const [errorLine, setErrorLine] = useState<number | undefined>(undefined);
  const [isInitialized, setIsInitialized] = useState(false);
  
  // Global Fold State (using a key to force re-render)
  const [expandAllKey, setExpandAllKey] = useState(0);
  const [defaultOpen, setDefaultOpen] = useState(true);

  // Layout State
  const [leftPanelWidth, setLeftPanelWidth] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Textarea Logic
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [cursorPos, setCursorPos] = useState<number | null>(null);

  // Restore cursor position after render if tracked
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
      setLeftPanelWidth(Math.max(20, Math.min(80, newWidth))); // Clamp 20-80%
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
      // Remove pointer events override from iframes/panels if needed
      const overlays = document.querySelectorAll('.pointer-events-overlay');
      overlays.forEach(el => el.remove());
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      
      // Add overlay to prevent iframe stealing mouse events (if any)
      const overlay = document.createElement('div');
      overlay.className = 'pointer-events-overlay fixed inset-0 z-[9999] cursor-col-resize';
      document.body.appendChild(overlay);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
      const overlays = document.querySelectorAll('.pointer-events-overlay');
      overlays.forEach(el => el.remove());
    };
  }, [isDragging]);

  // --- Handlers ---

  const handleTextChange = (text: string) => {
    setCurrentText(text);
    const result = safeParse(text);
    if (result.parsed) {
      setCurrentJson(result.parsed);
      setError(null);
      setErrorLine(undefined);
    } else {
      setError(result.error);
      setErrorLine(result.errorLine);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const { selectionStart, selectionEnd, value } = e.currentTarget;

    // 1. Tab Key -> Insert 2 spaces
    if (e.key === 'Tab') {
      e.preventDefault();
      const newText = value.substring(0, selectionStart) + '  ' + value.substring(selectionEnd);
      setCurrentText(newText);
      setCursorPos(selectionStart + 2);
    } 
    
    // 2. Enter Key -> Smart Indentation
    else if (e.key === 'Enter') {
      e.preventDefault();
      const before = value.substring(0, selectionStart);
      const after = value.substring(selectionEnd);
      
      const lastLine = before.split('\n').pop() || '';
      const indentMatch = lastLine.match(/^\s*/);
      let indent = indentMatch ? indentMatch[0] : '';
      
      const lastChar = before.trim().slice(-1);
      const nextChar = after.trim().slice(0, 1);
      
      // If we just opened a block, increase indent
      if (lastChar === '{' || lastChar === '[') {
        indent += '  ';
      }
      
      // Check if we are splitting an empty block e.g. {|}
      // We want:
      // {
      //   |
      // }
      const isClosingBlock = (lastChar === '{' && nextChar === '}') || (lastChar === '[' && nextChar === ']');
      
      let insert = '\n' + indent;
      let finalCursorPos = selectionStart + insert.length;
      
      if (isClosingBlock) {
        // Add the closing bracket on a new line with one less indent
        const closingIndent = indent.slice(0, -2);
        insert += '\n' + closingIndent;
        // Cursor stays on the indented line
      }
      
      const newText = before + insert + after;
      setCurrentText(newText);
      setCursorPos(finalCursorPos);
    } 
    
    // 3. Auto Close Brackets/Quotes
    else if (['"', '[', '{'].includes(e.key)) {
        // Only auto-close if no text is selected (simple mode)
        if (selectionStart === selectionEnd) {
             const pairs: any = { '"': '"', '[': ']', '{': '}' };
             e.preventDefault();
             const newText = value.substring(0, selectionStart) + e.key + pairs[e.key] + value.substring(selectionEnd);
             setCurrentText(newText);
             setCursorPos(selectionStart + 1);
        }
    }
  };

  const handleBlur = () => {
    // Auto-format on blur if valid
    if (!error && currentText.trim()) {
      formatJson();
    }
  };

  const handleObjectChange = (newObj: any) => {
    setCurrentJson(newObj);
    setCurrentText(JSON.stringify(newObj, null, 2));
    setError(null);
    setErrorLine(undefined);
  };

  const formatJson = () => {
    const result = safeParse(currentText);
    if (result.parsed) {
      const formatted = JSON.stringify(result.parsed, null, 2);
      setCurrentText(formatted);
      setCurrentJson(result.parsed);
      setError(null);
      setErrorLine(undefined);
    }
  };

  const handleExpandAll = () => {
    setDefaultOpen(true);
    setExpandAllKey(k => k + 1);
  };

  const handleCollapseAll = () => {
    setDefaultOpen(false);
    setExpandAllKey(k => k + 1);
  };

  const handleSetOriginal = () => {
    setBaseJson(JSON.parse(JSON.stringify(currentJson)));
    setIsInitialized(true);
  };

  const handleReset = () => {
    if (baseJson) {
      const text = JSON.stringify(baseJson, null, 2);
      setCurrentText(text);
      setCurrentJson(JSON.parse(text));
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        const text = ev.target?.result as string;
        const result = safeParse(text);
        if (result.parsed) {
            setCurrentJson(result.parsed);
            setCurrentText(JSON.stringify(result.parsed, null, 2));
            setBaseJson(result.parsed);
            setIsInitialized(true);
            setError(null);
            setErrorLine(undefined);
        } else {
            setError("Invalid JSON File");
            setErrorLine(undefined);
        }
    };
    reader.readAsText(file);
  };

  // --- Computations ---

  const diffTree: DiffNode | null = useMemo(() => {
    if (!baseJson) return null;
    return generateDiff(baseJson, currentJson, 'root');
  }, [baseJson, currentJson]);

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

  return (
    <div className="min-h-screen font-sans text-zinc-900 bg-[url('https://www.transparenttextures.com/patterns/graphy.png')] flex flex-col">
      
      {/* --- HEADER --- */}
      <header className="bg-paper border-b-2 border-border p-4 sticky top-0 z-50 shadow-hard-sm">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="flex items-center gap-3">
               <div className="bg-black text-white p-2">
                  <GitBranch size={20} />
               </div>
               <div>
                  <h1 className="text-xl font-black tracking-tight uppercase">LineArt Diff</h1>
                  <p className="text-xs text-zinc-500 font-mono">
                    {isInitialized ? "COMPARING CHANGES" : "SETUP: LOAD ORIGINAL"}
                  </p>
               </div>
            </div>

            {/* Global Actions */}
            <div className="flex items-center gap-2">
                <Button onClick={handleExpandAll} variant="secondary" className="px-3" title="Expand All">
                    <Maximize2 size={16} />
                </Button>
                <Button onClick={handleCollapseAll} variant="secondary" className="px-3" title="Collapse All">
                    <Minimize2 size={16} />
                </Button>
                <div className="w-[1px] h-6 bg-zinc-300 mx-2"></div>
                
                {!isInitialized ? (
                     <div className="flex gap-2">
                         <label className="cursor-pointer bg-white border-2 border-black px-3 py-2 font-bold shadow-hard hover:-translate-y-1 transition-transform flex items-center gap-2 text-sm">
                            <Upload size={16} /> Load File
                            <input type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
                        </label>
                        <Button onClick={handleSetOriginal} icon={<ArrowLeftRight size={16}/>}>
                           Start Diffing
                        </Button>
                     </div>
                ) : (
                    <>
                        <Button variant="secondary" onClick={handleReset} icon={<RotateCcw size={16} />}>
                            Reset
                        </Button>
                        <Button onClick={() => { setIsInitialized(false); setBaseJson(null); }} variant="danger" icon={<FileText size={16} />}>
                            New
                        </Button>
                    </>
                )}
            </div>
        </div>
      </header>

      {/* --- MAIN CONTENT --- */}
      {/* Used flex-col on mobile, flex-row on large screens. Added ref for resizing calc. */}
      <main 
         ref={containerRef}
         className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-6 flex flex-col lg:flex-row gap-6 lg:gap-0 h-[calc(100vh-80px)] overflow-hidden"
      >
         
         {/* LEFT PANE: EDITOR */}
         {/* On desktop, width is controlled by style. On mobile, w-full. */}
         <div 
            className="flex flex-col h-full min-h-[500px] w-full lg:w-[var(--left-width)] shrink-0 transition-[width] duration-0 ease-linear"
            style={{ '--left-width': `${leftPanelWidth}%` } as React.CSSProperties}
         >
            <div className="flex justify-between items-end mb-2">
               <div className="flex items-center gap-2">
                  <h2 className="font-bold text-lg">Editor</h2>
                  {isInitialized && <span className="text-xs font-mono text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded">MODIFIED VERSION</span>}
               </div>
               
               {/* View Toggle */}
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

            <Card className="flex-1 bg-white relative">
               {/* Formatting Toolbar (Only for Text Mode) */}
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
               
               <div className="h-full overflow-hidden">
                   {editorView === 'text' ? (
                       <textarea 
                          ref={textareaRef}
                          className="w-full h-full p-6 font-mono text-sm resize-none focus:outline-none leading-relaxed bg-white text-black"
                          value={currentText}
                          onChange={(e) => handleTextChange(e.target.value)}
                          onKeyDown={handleKeyDown}
                          onBlur={handleBlur}
                          placeholder="Paste JSON here..."
                          spellCheck={false}
                       />
                   ) : (
                       <div className="h-full overflow-auto p-4 bg-white">
                          <JsonNavProvider>
                            {currentJson ? (
                               <JsonEditor 
                                  key={`editor-${expandAllKey}`} 
                                  data={currentJson} 
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

         {/* SPLITTER HANDLE (Desktop Only) */}
         <div 
             className="hidden lg:flex w-4 items-center justify-center cursor-col-resize hover:bg-zinc-200 transition-colors mx-2 rounded shrink-0" 
             onMouseDown={() => setIsDragging(true)}
             title="Drag to resize"
         >
             <div className="w-1 h-8 bg-zinc-300 rounded-full flex items-center justify-center">
                {/* Visual indicator */}
             </div>
         </div>

         {/* RIGHT PANE: DIFF VIEWER */}
         <div className="flex-1 flex flex-col h-full min-h-[500px] w-full min-w-0">
             <div className="flex justify-between items-end mb-2">
                <div className="flex items-center gap-2">
                   <h2 className="font-bold text-lg flex items-center gap-2">
                      <ArrowLeftRight className="text-emerald-600" /> Diff
                   </h2>
                   {isInitialized && <span className="text-xs font-mono text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded">ORIGINAL vs MODIFIED</span>}
                </div>
                
                {/* Stats */}
                {isInitialized && (
                    <div className="flex gap-2">
                        <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded border border-emerald-100">+{stats.added}</span>
                        <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded border border-rose-100">-{stats.removed}</span>
                        <span className="text-xs font-bold text-