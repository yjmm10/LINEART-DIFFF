
import React from 'react';
import CodeMirror, { EditorView } from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';

interface CodeEditorProps {
    value: string;
    onChange: (val: string) => void;
    onEditorCreate?: (view: EditorView) => void;
    onBlur?: () => void;
    onCursorActivity?: (view: EditorView) => void;
    readOnly?: boolean;
}

// Custom "LineArt" Theme for CodeMirror
// Mimics the app's black/white/zinc aesthetic
const lineArtTheme = EditorView.theme({
    "&": {
        height: "100%",
        fontSize: "14px",
        fontFamily: "'JetBrains Mono', monospace",
    },
    ".cm-scroller": {
        overflow: "auto",
        fontFamily: "'JetBrains Mono', monospace",
    },
    ".cm-gutters": {
        backgroundColor: "#f9fafb", // zinc-50
        color: "#a1a1aa", // zinc-400
        borderRight: "1px solid #e4e4e7", // zinc-200
        paddingRight: "8px"
    },
    ".cm-activeLineGutter": {
        backgroundColor: "transparent",
        color: "#18181b", // zinc-900 (black)
        fontWeight: "bold"
    },
    ".cm-content": {
        padding: "16px 0",
        caretColor: "#18181b"
    },
    ".cm-line": {
        paddingLeft: "16px",
        paddingRight: "16px"
    },
    ".cm-activeLine": {
        backgroundColor: "#f4f4f580" // zinc-100 with opacity
    },
    ".cm-selectionMatch": {
        backgroundColor: "#e4e4e7" // zinc-200
    },
    "&.cm-focused .cm-cursor": {
        borderLeftColor: "#18181b"
    },
    "&.cm-focused .cm-selectionBackground, ::selection": {
        backgroundColor: "#d4d4d8" // zinc-300
    },
    // Syntax Highlighting Colors (Minimalist)
    ".cm-json-property": { color: "#18181b", fontWeight: "600" }, // Black for keys
    ".cm-json-string": { color: "#047857" }, // Emerald-700 for strings
    ".cm-json-number": { color: "#ea580c", fontWeight: "bold" }, // Orange-600
    ".cm-json-boolean": { color: "#2563eb", fontWeight: "bold" }, // Blue-600
    ".cm-json-null": { color: "#7e22ce", fontWeight: "bold" }, // Purple-700
    // Fold Gutter
    ".cm-foldPlaceholder": {
        backgroundColor: "#f4f4f5",
        border: "1px solid #e4e4e7",
        color: "#71717a",
        padding: "0 4px",
        margin: "0 2px",
        borderRadius: "2px",
        fontSize: "10px",
        fontWeight: "bold"
    }
}, { dark: false });

const CodeEditor: React.FC<CodeEditorProps> = ({ value, onChange, onEditorCreate, onBlur, onCursorActivity, readOnly }) => {
    return (
        <CodeMirror
            value={value}
            height="100%"
            theme={lineArtTheme}
            extensions={[json()]}
            onChange={onChange}
            onCreateEditor={onEditorCreate}
            onUpdate={(update) => {
                if (update.selectionSet && onCursorActivity) {
                    onCursorActivity(update.view);
                }
                if (update.focusChanged && !update.view.hasFocus && onBlur) {
                    onBlur();
                }
            }}
            readOnly={readOnly}
            basicSetup={{
                lineNumbers: true,
                highlightActiveLineGutter: true,
                highlightSpecialChars: true,
                history: true,
                foldGutter: true, // Enables the folding arrow in gutter
                drawSelection: true,
                dropCursor: true,
                allowMultipleSelections: false,
                indentOnInput: true,
                syntaxHighlighting: true,
                bracketMatching: true,
                closeBrackets: true,
                autocompletion: true,
                rectangularSelection: true,
                crosshairCursor: false,
                highlightActiveLine: true,
                highlightSelectionMatches: true,
                closeBracketsKeymap: true,
                defaultKeymap: true,
                searchKeymap: true,
                historyKeymap: true,
                foldKeymap: true, // Enables Ctrl+Shift+[ / ]
                completionKeymap: true,
                lintKeymap: true,
            }}
            className="h-full text-sm"
        />
    );
};

export default CodeEditor;
