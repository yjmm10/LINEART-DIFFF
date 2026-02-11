export enum DiffType {
  UNCHANGED = 'UNCHANGED',
  ADDED = 'ADDED',
  REMOVED = 'REMOVED',
  MODIFIED = 'MODIFIED',
}

export interface DiffNode {
  key: string;
  value?: any; // The new value (or current value if unchanged)
  oldValue?: any; // The old value (only for MODIFIED or REMOVED)
  type: DiffType;
  children?: DiffNode[]; // For nested objects/arrays
  isObject: boolean;
  isArray: boolean;
}

export interface JsonInputState {
  text: string;
  error: string | null;
  parsed: any | null;
}

export type ViewMode = 'split' | 'diff';
