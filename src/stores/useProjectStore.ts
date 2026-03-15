import { create } from 'zustand';
import { useEditorStore } from './useEditorStore';
import LZString from 'lz-string';

// ──────────────────────────────────────────
// Project Management State
// useEditorStore から分離（スナップショット・保存・共有）
// ──────────────────────────────────────────

const SHARE_URL_MAX_LENGTH = 8000;
const PROJECTS_KEY = 'porano-perse-projects';

export interface SavedProject {
  id: string;
  name: string;
  updatedAt: string;
  thumbnail?: string;
  data: string;
}

export interface ProjectState {
  // スナップショット（バージョン履歴）
  snapshots: Array<{ id: string; name: string; timestamp: number; data: string }>;
  saveSnapshot: (name?: string) => void;
  loadSnapshot: (id: string) => void;
  deleteSnapshot: (id: string) => void;
  renameSnapshot: (id: string, name: string) => void;

  // 自動保存
  lastAutoSaved: number | null;
  markAutoSaved: () => void;

  // ウォーターマーク
  enableWatermark: boolean;
  setEnableWatermark: (v: boolean) => void;
  watermarkPosition: 'bottom-left' | 'bottom-right' | 'none';
  setWatermarkPosition: (v: 'bottom-left' | 'bottom-right' | 'none') => void;
  watermarkOpacity: number; // 0.0 ~ 1.0
  setWatermarkOpacity: (v: number) => void;
  watermarkFontScale: number; // 0.5 ~ 2.0
  setWatermarkFontScale: (v: number) => void;

  // プロジェクト操作
  exportProject: () => string;
  importProject: (json: string) => void;
  restoreFromLocalStorage: () => boolean;

  // 複数プロジェクト管理
  listSavedProjects: () => SavedProject[];
  saveProjectToList: () => void;
  loadProjectFromList: (id: string) => void;
  deleteProjectFromList: (id: string) => void;
  getShareUrl: () => { url: string; tooLong: boolean };
  loadFromShareUrl: (encoded: string) => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  // ── 初期値 ──
  snapshots: (() => {
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem('porano-perse-snapshots') : null;
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  })(),
  lastAutoSaved: null,
  enableWatermark: false,
  watermarkPosition: 'bottom-right' as const,
  watermarkOpacity: 0.12,
  watermarkFontScale: 1.0,

  // ── アクション ──
  markAutoSaved: () => set({ lastAutoSaved: Date.now() }),
  setEnableWatermark: (enableWatermark) => set({ enableWatermark }),
  setWatermarkPosition: (watermarkPosition) => set({ watermarkPosition }),
  setWatermarkOpacity: (watermarkOpacity) => set({ watermarkOpacity: Math.max(0, Math.min(1, watermarkOpacity)) }),
  setWatermarkFontScale: (watermarkFontScale) => set({ watermarkFontScale: Math.max(0.5, Math.min(2, watermarkFontScale)) }),

  // プロジェクト操作（useEditorStoreに委任）
  exportProject: () => {
    return useEditorStore.getState().exportProject();
  },

  importProject: (json) => {
    useEditorStore.getState().importProject(json);
  },

  restoreFromLocalStorage: () => {
    return useEditorStore.getState().restoreFromLocalStorage();
  },

  // スナップショット（バージョン履歴）
  saveSnapshot: (name) => {
    const editor = useEditorStore.getState();
    const now = Date.now();
    const autoName = name || `スナップショット ${new Date(now).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`;
    const snapshotData = JSON.stringify({
      walls: editor.walls,
      furniture: editor.furniture,
      openings: editor.openings,
      style: editor.style,
      roomHeight: editor.roomHeight,
    });
    const newSnapshot = {
      id: `snap_${now}_${Math.random().toString(36).slice(2, 8)}`,
      name: autoName,
      timestamp: now,
      data: snapshotData,
    };
    const snapshots = [...get().snapshots, newSnapshot];
    while (snapshots.length > 10) snapshots.shift();
    set({ snapshots });
    try { localStorage.setItem('porano-perse-snapshots', JSON.stringify(snapshots)); } catch { /* ignore */ }
  },

  loadSnapshot: (id) => {
    const snapshot = get().snapshots.find((snap) => snap.id === id);
    if (!snapshot) return;
    try {
      const parsed = JSON.parse(snapshot.data);
      // useEditorStoreのimportProjectは完全なJSON文字列を期待するので、
      // 直接EditorStoreの低レベルAPIを使う
      const editor = useEditorStore.getState();
      editor.importProject(JSON.stringify({
        projectName: editor.projectName,
        walls: parsed.walls ?? editor.walls,
        furniture: parsed.furniture ?? editor.furniture,
        openings: parsed.openings ?? editor.openings,
        style: parsed.style ?? editor.style,
        roomHeight: parsed.roomHeight ?? editor.roomHeight,
      }));
    } catch { /* invalid data */ }
  },

  deleteSnapshot: (id) => {
    set((s) => {
      const snapshots = s.snapshots.filter((snap) => snap.id !== id);
      try { localStorage.setItem('porano-perse-snapshots', JSON.stringify(snapshots)); } catch { /* ignore */ }
      return { snapshots };
    });
  },

  renameSnapshot: (id, name) => {
    set((s) => {
      const snapshots = s.snapshots.map((snap) =>
        snap.id === id ? { ...snap, name } : snap
      );
      try { localStorage.setItem('porano-perse-snapshots', JSON.stringify(snapshots)); } catch { /* ignore */ }
      return { snapshots };
    });
  },

  // 複数プロジェクト管理
  listSavedProjects: () => {
    try {
      const raw = localStorage.getItem(PROJECTS_KEY);
      return raw ? (JSON.parse(raw) as SavedProject[]) : [];
    } catch {
      return [];
    }
  },

  saveProjectToList: () => {
    const editor = useEditorStore.getState();
    const projectData = editor.exportProject();
    try {
      const projects: SavedProject[] = JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]');
      const existing = projects.findIndex((p) => p.name === editor.projectName);
      const entry: SavedProject = {
        id: existing >= 0 ? projects[existing].id : `proj_${Date.now()}`,
        name: editor.projectName,
        updatedAt: new Date().toISOString(),
        data: projectData,
      };
      if (existing >= 0) {
        projects[existing] = entry;
      } else {
        projects.unshift(entry);
      }
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
    } catch {
      // localStorage unavailable or quota exceeded
    }
  },

  loadProjectFromList: (id) => {
    try {
      const projects: SavedProject[] = JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]');
      const project = projects.find((p) => p.id === id);
      if (project) {
        useEditorStore.getState().importProject(project.data);
      }
    } catch {
      // invalid data
    }
  },

  deleteProjectFromList: (id) => {
    try {
      const projects: SavedProject[] = JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]');
      const filtered = projects.filter((p) => p.id !== id);
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(filtered));
    } catch {
      // localStorage unavailable
    }
  },

  getShareUrl: () => {
    const data = useEditorStore.getState().exportProject();
    const compressed = LZString.compressToEncodedURIComponent(data);
    const url = `${window.location.origin}${window.location.pathname}#project=${compressed}`;
    return { url, tooLong: url.length > SHARE_URL_MAX_LENGTH };
  },

  loadFromShareUrl: (encoded) => {
    try {
      const json = LZString.decompressFromEncodedURIComponent(encoded);
      if (json) {
        useEditorStore.getState().importProject(json);
        return;
      }
      const legacy = decodeURIComponent(escape(atob(encoded)));
      useEditorStore.getState().importProject(legacy);
    } catch (e) {
      console.error('Failed to load shared project:', e);
    }
  },
}));
