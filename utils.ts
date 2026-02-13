

import { DiffNode, DiffType, ProjectFile } from './types';

/**
 * Safely parses JSON string and attempts to extract error line number.
 */
export const safeParse = (json: string): { parsed: any; error: string | null; errorLine?: number } => {
  try {
    if (!json || !json.trim()) return { parsed: null, error: null };
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
 * Recursively resolves references starting with #/ in the JSON structure.
 */
export const resolveReferences = (data: any): any => {
    const root = data; 
    
    const getValue = (obj: any, path: string) => {
        const parts = path.split('/').filter(p => p !== '#' && p !== '');
        let current = obj;
        for (const part of parts) {
            if (current && typeof current === 'object') {
                current = Array.isArray(current) ? current[parseInt(part)] : current[part];
            } else {
                return undefined;
            }
        }
        return current;
    };

    const resolve = (node: any, stack: string[] = []): any => {
        if (Array.isArray(node)) {
            return node.map(item => resolve(item, stack));
        }
        
        if (node && typeof node === 'object' && node !== null) {
            if ('$ref' in node && typeof node['$ref'] === 'string' && node['$ref'].startsWith('#/')) {
                const refPath = node['$ref'];
                if (stack.includes(refPath)) return node; 
                const resolved = getValue(root, refPath);
                if (resolved !== undefined) return resolve(resolved, [...stack, refPath]);
                return node;
            }
            const newObj: any = {};
            for (const key in node) {
                newObj[key] = resolve(node[key], stack);
            }
            return newObj;
        }
        return node;
    };

    return resolve(data);
};

/**
 * Recursively compares two variables to generate a Diff structure.
 */
export const generateDiff = (oldData: any, newData: any, keyName: string = 'root'): DiffNode => {
  if (oldData === undefined && newData !== undefined) {
    return createNode(keyName, newData, undefined, DiffType.ADDED);
  }
  if (oldData !== undefined && newData === undefined) {
    return createNode(keyName, undefined, oldData, DiffType.REMOVED);
  }

  const oldType = getType(oldData);
  const newType = getType(newData);

  if (oldType !== newType) {
    return createNode(keyName, newData, oldData, DiffType.MODIFIED);
  }

  if (oldType === 'primitive') {
    if (oldData !== newData) {
      return createNode(keyName, newData, oldData, DiffType.MODIFIED);
    }
    return createNode(keyName, newData, undefined, DiffType.UNCHANGED);
  }

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

    const type = children.every(c => c.type === DiffType.UNCHANGED) ? DiffType.UNCHANGED : DiffType.MODIFIED;

    return {
      key: keyName,
      type,
      isObject: false,
      isArray: true,
      children,
      value: newData,
      oldValue: oldData
    };
  }

  if (oldType === 'object') {
    const oldObj = oldData as Record<string, any>;
    const newObj = newData as Record<string, any>;
    const keys = Array.from(new Set([...Object.keys(oldObj), ...Object.keys(newObj)]));
    const children: DiffNode[] = [];

    keys.forEach(key => {
      const inOld = Object.prototype.hasOwnProperty.call(oldObj, key);
      const inNew = Object.prototype.hasOwnProperty.call(newObj, key);

      if (inOld && !inNew) {
        children.push(createNode(key, undefined, oldObj[key], DiffType.REMOVED));
      } else if (!inOld && inNew) {
        children.push(createNode(key, newObj[key], undefined, DiffType.ADDED));
      } else {
        children.push(generateDiff(oldObj[key], newObj[key], key));
      }
    });

    const isModified = children.some(c => c.type !== DiffType.UNCHANGED);

    return {
      key: keyName,
      type: isModified ? DiffType.MODIFIED : DiffType.UNCHANGED,
      isObject: true,
      isArray: false,
      children,
      value: newData,
      oldValue: oldData
    };
  }

  return createNode(keyName, newData, undefined, DiffType.UNCHANGED);
};

const getType = (val: any): 'primitive' | 'array' | 'object' => {
  if (Array.isArray(val)) return 'array';
  if (val === null) return 'primitive';
  if (typeof val === 'object') return 'object';
  return 'primitive';
};

const createNode = (key: string, value: any, oldValue: any, type: DiffType): DiffNode => {
  const isArr = Array.isArray(value || oldValue);
  const isObj = (value || oldValue) !== null && typeof (value || oldValue) === 'object' && !isArr;
  let children: DiffNode[] | undefined = undefined;
  const targetForChildren = value !== undefined ? value : oldValue;
  
  if (isArr || isObj) {
     if (type === DiffType.ADDED || type === DiffType.REMOVED) {
       children = convertRawToNodeTree(targetForChildren, type);
     } else if (type === DiffType.MODIFIED && value !== undefined && typeof value === 'object') {
       children = convertRawToNodeTree(value, DiffType.ADDED);
     }
  }

  return { key, value, oldValue, type, isObject: isObj, isArray: isArr, children };
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
    }));
}

// ----------------------------------------------------------------------
// Robust JSON AST Navigation Helpers
// ----------------------------------------------------------------------

/**
 * Returns the end index of a string (after the closing quote).
 * Handles escaped quotes correctly.
 */
const skipString = (json: string, startIndex: number): number => {
    let i = startIndex + 1;
    while (i < json.length) {
        if (json[i] === '"') {
            // Count preceding backslashes
            let backslashCount = 0;
            let j = i - 1;
            while (j >= startIndex && json[j] === '\\') {
                backslashCount++;
                j--;
            }
            // Even number of backslashes means the quote is NOT escaped
            if (backslashCount % 2 === 0) return i + 1;
        }
        i++;
    }
    return i;
};

/**
 * AST Helper: Finds the JSON path corresponding to a character index.
 * Uses a state machine to track if we are in an Object/Array, Key, or Value.
 */
export const getPathFromIndex = (json: string, targetIndex: number): string => {
    if (targetIndex < 0 || targetIndex >= json.length) return '#';
    
    // State: [ContainerType, CurrentIndex/Key]
    let stack: { type: 'object' | 'array', key: string | number | null }[] = [];
    
    let i = 0;
    let isKey = false; // Are we currently parsing a key string?

    while (i < json.length) {
        // If we reached the target, construct the path from stack
        if (i >= targetIndex) {
            if (stack.length === 0) return '#';
            let path = '#';
            for (const frame of stack) {
                if (frame.key !== null) {
                   path += `/${frame.key}`;
                }
            }
            return path;
        }

        const char = json[i];

        if (/\s/.test(char)) {
            i++;
            continue;
        }

        if (char === '"') {
            const start = i;
            const end = skipString(json, i);
            
            // Check if cursor is INSIDE this string
            if (targetIndex > start && targetIndex < end) {
                 // If we are waiting for a key, this string IS the key
                 if (stack.length > 0) {
                     const top = stack[stack.length - 1];
                     if (top.type === 'object' && isKey) {
                         const keyName = json.substring(start + 1, end - 1);
                         // We are inside the key definition, so technically the path is the key itself
                         // but for sync purposes, usually we want the parent path + this key
                         top.key = keyName; 
                     }
                 }
                 // We are inside a value or key, build path now
                 let path = '#';
                 for (const frame of stack) {
                     if (frame.key !== null) path += `/${frame.key}`;
                 }
                 return path;
            }

            // String finished, update state
            if (stack.length > 0) {
                const top = stack[stack.length - 1];
                if (top.type === 'object') {
                    if (isKey) {
                        // Found the key
                        top.key = json.substring(start + 1, end - 1);
                        isKey = false; // Next is colon
                    }
                }
            }

            i = end;
            continue;
        }

        if (char === '{') {
            stack.push({ type: 'object', key: null });
            isKey = true; // Expecting key first
        } else if (char === '[') {
            stack.push({ type: 'array', key: 0 });
            isKey = false;
        } else if (char === '}' || char === ']') {
            stack.pop();
        } else if (char === ':') {
            isKey = false; // Just passed a key
        } else if (char === ',') {
            if (stack.length > 0) {
                const top = stack[stack.length - 1];
                if (top.type === 'array') {
                    if (typeof top.key === 'number') top.key++;
                } else {
                    top.key = null; // Reset for next key
                    isKey = true;
                }
            }
        }

        i++;
    }

    return '#';
}

/**
 * AST Helper: Finds the character index for a specific JSON path.
 */
export const getIndexFromPath = (json: string, targetPath: string): number => {
    if (!targetPath || targetPath === '#') return 0;
    
    const parts = targetPath.split('/').filter(p => p !== '#' && p !== '');
    if (parts.length === 0) return 0;

    let i = 0;
    let currentDepth = 0;
    let stack: { type: 'object' | 'array' }[] = [];
    let isKey = false; // expecting key
    
    // We try to match parts[currentDepth]
    
    while (i < json.length) {
        const char = json[i];
        
        if (/\s/.test(char)) { i++; continue; }

        // Start of Container
        if (char === '{' || char === '[') {
            const type = char === '{' ? 'object' : 'array';
            
            // If we are looking for this container (matched previous key), good.
            // But we need to distinguish "value that is container" vs "root"
            stack.push({ type });
            if (char === '{') isKey = true;
            
            // If we are at the end of the path chain (and the target IS this container)
            // Logic handled by the Key matching below mostly.
        } 
        else if (char === '}' || char === ']') {
            stack.pop();
            currentDepth--; // Back up
        }
        else if (char === ',') {
            const top = stack[stack.length - 1];
            if (top && top.type === 'object') isKey = true;
            
            // If we are in an array, comma means increment index
            if (top && top.type === 'array') {
                 // Handled in the loop logic logic below implicitly by counting? 
                 // Actually complex to track index. Simpler: 
                 // If we are looking for array index 'N', we skip N values.
            }
        }
        else if (char === ':') {
            isKey = false;
        }
        else if (char === '"') {
            const start = i;
            const end = skipString(json, i);
            const strVal = json.substring(start + 1, end - 1);
            i = end;

            const top = stack[stack.length - 1];
            
            // CASE 1: Object Key
            if (top && top.type === 'object' && isKey) {
                // Is this the key we are looking for at current depth?
                if (parts[currentDepth] === strVal) {
                    // Match!
                    if (currentDepth === parts.length - 1) {
                        // This is the target node!
                        return start;
                    }
                    currentDepth++;
                    isKey = false; // Now expecting value
                    continue; 
                } else {
                    // Not the key. We need to SKIP the value of this key.
                    isKey = false; 
                    // Skip value logic is tricky in one pass. 
                    // To keep it simple: we just continue. 
                    // If we are not at depth match, we ignore content.
                }
            }
            // CASE 2: Array Value (String)
            else if (top && top.type === 'array') {
                 // Arrays are harder in this simple loop because we need to count indices.
                 // A proper tokenizer is better, but let's try a hybrid approach.
            }
        }

        i++;
    }
    
    // Fallback: Use a more structural recursive search which is safer than the loop above
    // reusing the parsing logic but just for finding.
    return findIndexRecursive(json, parts);
}

// A more reliable recursive index finder
const findIndexRecursive = (json: string, parts: string[]): number => {
    let i = 0;
    let depth = 0;
    
    // Helper to move i past whitespace
    const skipWs = () => { while(i < json.length && /\s/.test(json[i])) i++; }

    // Helper to skip a value (recursively)
    const skipValue = () => {
        skipWs();
        if (i >= json.length) return;
        const char = json[i];
        if (char === '{') {
            i++; // skip {
            while(i < json.length) {
                skipWs();
                if (json[i] === '}') { i++; return; }
                // Key
                skipValue(); // Skip Key String
                skipWs();
                if (json[i] === ':') i++;
                skipValue(); // Skip Value
                skipWs();
                if (json[i] === ',') i++;
            }
        } else if (char === '[') {
            i++; 
            while(i < json.length) {
                skipWs();
                if (json[i] === ']') { i++; return; }
                skipValue();
                skipWs();
                if (json[i] === ',') i++;
            }
        } else if (char === '"') {
            i = skipString(json, i);
        } else {
            // Number, boolean, null
            while(i < json.length && /[^,}\]\s]/.test(json[i])) i++;
        }
    }

    // Main Recursive Search
    const search = (currentDepth: number): number | null => {
        skipWs();
        if (i >= json.length) return null;
        
        // If we found the target (we consumed all path parts)
        if (currentDepth >= parts.length) return i;

        const targetPart = parts[currentDepth];
        const char = json[i];

        if (char === '{') {
            const startObj = i;
            if (currentDepth === parts.length) return startObj; // Matches object itself
            
            i++; // Enter object
            while (i < json.length) {
                skipWs();
                if (json[i] === '}') { i++; return null; } // End of object, not found
                
                // Expect Key
                if (json[i] !== '"') { skipValue(); continue; } // Should be quote
                
                const keyStart = i;
                i = skipString(json, i);
                const keyName = json.substring(keyStart + 1, i - 1);
                
                skipWs();
                if (json[i] === ':') i++;
                
                if (keyName === targetPart) {
                    // Key Matched!
                    if (currentDepth === parts.length - 1) {
                         // We found the Key/Value pair. 
                         // To jump to the definition, we usually want the Key position
                         return keyStart; 
                    }
                    // Dive deeper
                    return search(currentDepth + 1);
                } else {
                    // Skip this property's value
                    skipValue();
                }
                
                skipWs();
                if (json[i] === ',') i++;
            }
        } 
        else if (char === '[') {
            const startArr = i;
            if (currentDepth === parts.length) return startArr;

            i++; // Enter array
            let idx = 0;
            const targetIdx = parseInt(targetPart, 10);
            
            while (i < json.length) {
                skipWs();
                if (json[i] === ']') { i++; return null; }

                if (idx === targetIdx) {
                    // Index Matched!
                    return search(currentDepth + 1);
                }
                
                // Skip item
                skipValue();
                idx++;
                
                skipWs();
                if (json[i] === ',') i++;
            }
        } 
        else {
             // Primitive value found, but we expected to go deeper?
             // Or we matched the leaf.
             if (currentDepth === parts.length) return i;
             i = skipString(json, i); // Consume it
        }
        return null;
    }

    const res = search(0);
    return res !== null ? res : 0;
}
