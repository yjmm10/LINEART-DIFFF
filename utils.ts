
import { DiffNode, DiffType, ProjectFile } from './types';

/**
 * Safely parses JSON string and attempts to extract error line number.
 */
export const safeParse = (json: string): { parsed: any; error: string | null; errorLine?: number } => {
  try {
    if (!json.trim()) return { parsed: null, error: null };
    const parsed = JSON.parse(json);
    return { parsed, error: null };
  } catch (e: any) {
    let errorLine = undefined;
    const msg = e.message || "Unknown error";
    
    // Standard V8/Chrome error message: "Unexpected token } in JSON at position 123"
    const posMatch = msg.match(/at position (\d+)/);
    
    if (posMatch) {
      const position = parseInt(posMatch[1], 10);
      // Count newlines up to that position to find the line number
      const textUpToError = json.substring(0, position);
      errorLine = textUpToError.split('\n').length;
    }

    return { parsed: null, error: msg, errorLine };
  }
};

/**
 * Downloads data as a JSON file.
 */
export const downloadJson = (data: any, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename.endsWith('.json') ? filename : `${filename}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

export const isProjectFile = (data: any): data is ProjectFile => {
    return data && data.meta === 'lineart-diff-project' && 'base' in data && 'current' in data;
};

/**
 * Recursively compares two variables to generate a Diff structure.
 */
export const generateDiff = (oldData: any, newData: any, keyName: string = 'root'): DiffNode => {
  // Scenario 1: One side is undefined/null where the other isn't 
  if (oldData === undefined && newData !== undefined) {
    return createNode(keyName, newData, undefined, DiffType.ADDED);
  }
  if (oldData !== undefined && newData === undefined) {
    return createNode(keyName, undefined, oldData, DiffType.REMOVED);
  }

  // Scenario 2: Type mismatch 
  const oldType = getType(oldData);
  const newType = getType(newData);

  if (oldType !== newType) {
    return createNode(keyName, newData, oldData, DiffType.MODIFIED);
  }

  // Scenario 3: Primitives 
  if (oldType === 'primitive') {
    if (oldData !== newData) {
      return createNode(keyName, newData, oldData, DiffType.MODIFIED);
    }
    return createNode(keyName, newData, undefined, DiffType.UNCHANGED);
  }

  // Scenario 4: Arrays
  if (oldType === 'array') {
    const oldArr = oldData as any[];
    const newArr = newData as any[];
    const children: DiffNode[] = [];
    
    const maxLen = Math.max(oldArr.length, newArr.length);

    for (let i = 0; i < maxLen; i++) {
      const oldVal = i < oldArr.length ? oldArr[i] : undefined;
      const newVal = i < newArr.length ? newArr[i] : undefined;
      children.push(generateDiff(oldVal, newVal, i.toString()));
    }

    return {
      key: keyName,
      type: children.every(c => c.type === DiffType.UNCHANGED) ? DiffType.UNCHANGED : DiffType.MODIFIED,
      isObject: false,
      isArray: true,
      children,
      value: newData
    };
  }

  // Scenario 5: Objects
  if (oldType === 'object') {
    const oldObj = oldData as Record<string, any>;
    const newObj = newData as Record<string, any>;
    const keys = Array.from(new Set([...Object.keys(oldObj), ...Object.keys(newObj)]));
    const children: DiffNode[] = [];

    keys.forEach(key => {
      const inOld = key in oldObj;
      const inNew = key in newObj;

      if (inOld && !inNew) {
        children.push(createNode(key, undefined, oldObj[key], DiffType.REMOVED));
      } else if (!inOld && inNew) {
        children.push(createNode(key, newObj[key], undefined, DiffType.ADDED));
      } else {
        children.push(generateDiff(oldObj[key], newObj[key], key));
      }
    });

    children.sort((a, b) => a.key.localeCompare(b.key));

    const isModified = children.some(c => c.type !== DiffType.UNCHANGED);

    return {
      key: keyName,
      type: isModified ? DiffType.MODIFIED : DiffType.UNCHANGED,
      isObject: true,
      isArray: false,
      children,
      value: newData
    };
  }

  return createNode(keyName, newData, undefined, DiffType.UNCHANGED);
};

// Helper to determine rough type category
const getType = (val: any): 'primitive' | 'array' | 'object' => {
  if (Array.isArray(val)) return 'array';
  if (val === null) return 'primitive';
  if (typeof val === 'object') return 'object';
  return 'primitive';
};

// Helper to create a leaf or simple node
const createNode = (key: string, value: any, oldValue: any, type: DiffType): DiffNode => {
  const isArr = Array.isArray(value || oldValue);
  const isObj = (value || oldValue) !== null && typeof (value || oldValue) === 'object' && !isArr;

  let children: DiffNode[] | undefined = undefined;

  const targetForChildren = value !== undefined ? value : oldValue;
  
  if (isArr || isObj) {
     if (type === DiffType.ADDED || type === DiffType.REMOVED) {
       children = convertRawToNodeTree(targetForChildren, type);
     }
  }

  return {
    key,
    value,
    oldValue,
    type,
    isObject: isObj,
    isArray: isArr,
    children
  };
};

const convertRawToNodeTree = (data: any, parentType: DiffType): DiffNode[] => {
    if (!data || typeof data !== 'object') return [];
    
    if (Array.isArray(data)) {
        return data.map((item, idx) => ({
            key: idx.toString(),
            value: parentType === DiffType.ADDED ? item : undefined,
            oldValue: parentType === DiffType.REMOVED ? item : undefined,
            type: parentType,
            isObject: typeof item === 'object' && item !== null && !Array.isArray(item),
            isArray: Array.isArray(item),
            children: typeof item === 'object' ? convertRawToNodeTree(item, parentType) : undefined
        }));
    }

    return Object.keys(data).map(key => ({
        key,
        value: parentType === DiffType.ADDED ? data[key] : undefined,
        oldValue: parentType === DiffType.REMOVED ? data[key] : undefined,
        type: parentType,
        isObject: typeof data[key] === 'object' && data[key] !== null && !Array.isArray(data[key]),
        isArray: Array.isArray(data[key]),
        children: typeof data[key] === 'object' ? convertRawToNodeTree(data[key], parentType) : undefined
    })).sort((a, b) => a.key.localeCompare(b.key));
}
