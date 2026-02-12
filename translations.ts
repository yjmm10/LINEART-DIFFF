
import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'en' | 'zh';

const translations = {
  en: {
    appName: "LineArt JSON",
    hero: {
      title: "Master Your JSON",
      subtitle: "A precise, line-art styled JSON diff viewer and formatter. Local-first, privacy-focused, and designed for developers.",
      start: "Start Editor",
      features: "Features",
      about: "User Guide"
    },
    features: {
      diff: { title: "Smart Diff", desc: "Compare JSON structures with precision. Detects additions, removals, and modifications." },
      format: { title: "Format & Validate", desc: "Instantly format messy JSON. Switch between Text and Tree views." },
      local: { title: "Local Privacy", desc: "Data never leaves your browser. Workspaces are saved to LocalStorage." },
      snapshot: { title: "Snapshots", desc: "Save versions of your work and restore them anytime." }
    },
    guide: {
      tips: {
        title: "Pro Tips",
        dnd: "Drag & Drop",
        dndDesc: "Drag the grip handle (::) on the left of any node to reorder. Hold 'Alt' key while dragging to Copy instead of Move.",
        jump: "Sync Jumping",
        jumpDesc: "Double-click any node in the Editor to reveal it in Diff View, and vice versa. Use this to quickly locate changes.",
        actions: "Quick Actions",
        actionsDesc: "Hover over any node to access the context menu: Copy JSON, Add Child, Change Type, or Delete."
      },
      shortcuts: {
        title: "Keyboard Shortcuts",
        format: "Format JSON",
        formatDesc: "Blur Input",
        expand: "Toggle Node",
        expandDesc: "Click"
      }
    },
    sidebar: {
      projects: "Projects",
      tools: "Tools",
      compare: "Compare Files",
      importExport: "Import / Export",
      newProject: "New Project",
      rename: "Rename",
      delete: "Delete"
    },
    header: {
      expandAll: "Expand All",
      collapseAll: "Collapse All",
      smartExpand: "Smart Expand",
      snapshots: "Snapshots",
      setOriginal: "Set as Original",
      reset: "Reset to Original",
      clear: "Clear Original",
      diffActive: "Diff Mode Active",
      viewMode: "View Mode",
      modeDiff: "Diff View",
      modeSplit: "Split Editor"
    },
    editor: {
      title: "Editor",
      titleBase: "Original (Base)",
      titleCurrent: "Modified (New)",
      modified: "MODIFIED",
      copy: "Copy",
      copied: "Copied",
      format: "Format",
      textMode: "TEXT",
      treeMode: "TREE",
      placeholder: "Paste JSON here...",
      invalid: "Valid JSON required for Tree View"
    },
    diff: {
      title: "Diff",
      view: "DIFF VIEW",
      autoFollow: "Auto Follow",
      noChanges: "No structural changes detected.",
      noBase: "No Original Version Set",
      noBaseDesc: "Load files via 'Compare Files' or click 'Set as Original' to start."
    },
    modals: {
      importExport: {
        title: "Import / Export",
        importTab: "Import",
        exportTab: "Export",
        uploadLabel: "Upload JSON File",
        filename: "Filename",
        type: "Export Type",
        latest: "Latest Result Only",
        diff: "Diff Result Structure",
        project: "Full Project Snapshot",
        download: "Download JSON"
      },
      snapshots: {
        title: "Project Snapshots",
        create: "Create Snapshot",
        placeholder: "Snapshot Name (optional)",
        save: "Save",
        history: "History",
        restore: "Restore",
        delete: "Delete",
        empty: "No snapshots saved yet."
      },
      newProject: {
        title: "New Project",
        desc: "Create a new empty workspace.",
        label: "Project Name",
        placeholder: "e.g. API Response V2",
        create: "Create"
      },
      compare: {
        title: "Compare Files",
        desc: "Upload two files to compare. This will overwrite the current workspace.",
        base: "1. Original (Base)",
        new: "2. Modified (New)",
        upload: "Upload",
        loaded: "File Loaded",
        start: "Start Comparison",
        cancel: "Cancel"
      },
      about: {
        title: "User Guide",
        version: "Version"
      }
    }
  },
  zh: {
    appName: "LineArt JSON",
    hero: {
      title: "掌控你的 JSON",
      subtitle: "一款精准的线条艺术风格 JSON 差异查看器。本地优先，隐私安全，专为开发者设计。",
      start: "开始使用",
      features: "功能特点",
      about: "使用说明"
    },
    features: {
      diff: { title: "智能比对", desc: "精确比对 JSON 结构。自动检测新增、删除和修改的内容。" },
      format: { title: "格式化与校验", desc: "瞬间格式化混乱的 JSON。支持文本和树形视图切换。" },
      local: { title: "本地隐私", desc: "数据仅在浏览器中处理。工作区数据保存于 LocalStorage。" },
      snapshot: { title: "快照管理", desc: "保存当前工作版本，随时一键还原。" }
    },
    guide: {
      tips: {
        title: "进阶技巧",
        dnd: "拖拽排序与复制",
        dndDesc: "拖动节点左侧的手柄 (::) 即可重新排序。按住 Alt 键拖动可执行“复制”操作。",
        jump: "双击定位",
        jumpDesc: "双击编辑器或差异视图中的任意节点，即可在另一侧视图中快速定位对应内容。",
        actions: "快捷菜单",
        actionsDesc: "鼠标悬停在节点上，即可使用复制 JSON、添加子节点、类型转换或删除功能。"
      },
      shortcuts: {
        title: "快捷键",
        format: "格式化 JSON",
        formatDesc: "文本框失去焦点 (Blur)",
        expand: "展开/折叠",
        expandDesc: "点击"
      }
    },
    sidebar: {
      projects: "项目列表",
      tools: "工具箱",
      compare: "文件比对",
      importExport: "导入 / 导出",
      newProject: "新建项目",
      rename: "重命名",
      delete: "删除"
    },
    header: {
      expandAll: "展开全部",
      collapseAll: "折叠全部",
      smartExpand: "智能展开",
      snapshots: "历史快照",
      setOriginal: "设为基准",
      reset: "重置",
      clear: "清除基准",
      diffActive: "比对模式",
      viewMode: "视图模式",
      modeDiff: "差异对比",
      modeSplit: "分屏编辑"
    },
    editor: {
      title: "编辑器",
      titleBase: "原始文档 (Base)",
      titleCurrent: "当前文档 (New)",
      modified: "已修改",
      copy: "复制",
      copied: "已复制",
      format: "格式化",
      textMode: "文本",
      treeMode: "树形",
      placeholder: "在此粘贴 JSON...",
      invalid: "树形视图需要有效的 JSON"
    },
    diff: {
      title: "差异视图",
      view: "比对结果",
      autoFollow: "自动跟随",
      noChanges: "未检测到结构变化。",
      noBase: "未设置基准版本",
      noBaseDesc: "请通过“文件比对”加载，或点击“设为基准”开始比对。"
    },
    modals: {
      importExport: {
        title: "导入 / 导出",
        importTab: "导入",
        exportTab: "导出",
        uploadLabel: "上传 JSON 文件",
        filename: "文件名",
        type: "导出类型",
        latest: "仅最新结果",
        diff: "差异结构树",
        project: "完整项目包",
        download: "下载 JSON"
      },
      snapshots: {
        title: "项目快照",
        create: "创建快照",
        placeholder: "快照名称 (选填)",
        save: "保存",
        history: "历史记录",
        restore: "还原",
        delete: "删除",
        empty: "暂无保存的快照。"
      },
      newProject: {
        title: "新建项目",
        desc: "创建一个新的空白工作区。",
        label: "项目名称",
        placeholder: "例如：API 响应 V2",
        create: "创建"
      },
      compare: {
        title: "文件比对",
        desc: "上传两个文件进行比对。这将覆盖当前工作区。",
        base: "1. 原始文件 (基准)",
        new: "2. 修改后文件 (新)",
        upload: "上传文件",
        loaded: "文件已加载",
        start: "开始比对",
        cancel: "取消"
      },
      about: {
        title: "使用说明",
        version: "版本"
      }
    }
  }
};

interface LanguageContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (path: string) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  lang: 'en',
  setLang: () => {},
  t: (key) => key
});

export const useLanguage = () => useContext(LanguageContext);

export const LanguageProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [lang, setLang] = useState<Language>(() => {
      return (localStorage.getItem('lineart_lang') as Language) || 'zh';
  });

  useEffect(() => {
    localStorage.setItem('lineart_lang', lang);
  }, [lang]);

  const t = (path: string): string => {
    const keys = path.split('.');
    let current: any = translations[lang];
    for (const key of keys) {
      if (current[key] === undefined) return path;
      current = current[key];
    }
    return typeof current === 'string' ? current : path;
  };

  return React.createElement(LanguageContext.Provider, { value: { lang, setLang, t } }, children);
};
