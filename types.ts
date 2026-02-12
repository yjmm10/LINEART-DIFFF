
export enum DiffType {
  UNCHANGED = 'UNCHANGED',
  ADDED = 'ADDED',
  REMOVED = 'REMOVED',
  MODIFIED = 'MODIFIED',
}

export interface DiffNode {
  key: string;
  value?: any; 
  oldValue?: any; 
  type: DiffType;
  children?: DiffNode[]; 
  isObject: boolean;
  isArray: boolean;
}

export interface JsonInputState {
  text: string;
  error: string | null;
  parsed: any | null;
}

export type ViewMode = 'split' | 'diff';

// --- New Types for Workspace & Export ---

export interface Snapshot {
    id: string;
    name: string;
    timestamp: number;
    data: any;
}

export interface Workspace {
    id: string;
    name: string;
    baseJson: any | null; // The "Original"
    currentJson: any;     // The "Modified"
    lastModified: number;
    snapshots: Snapshot[];
}

export type ExportMode = 'latest' | 'diff' | 'project';

export interface ProjectFile {
    meta: 'lineart-diff-project';
    version: string;
    timestamp: number;
    base: any;
    current: any;
}
