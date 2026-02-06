import { create } from 'zustand';
import { set as idbSet, get as idbGet } from 'idb-keyval';


// --- Types ---

export interface Point {
    x: number;
    y: number;
    pressure?: number;
}

export type ToolType = 'pen' | 'pencil' | 'highlighter' | 'eraser' | 'select' | 'laser';
export type EraserMode = 'partial' | 'whole';

export interface Stroke {
    id: string; // Added ID
    points: Point[];
    color: string;
    size: number;
    opacity: number;
    tool: ToolType;
    isComplete: boolean;
}

export interface ToolState {
    activeTool: ToolType;
    color: string;
    size: number;
    opacity: number;
    eraserMode: EraserMode;
    eraserSize: number;
}


export type PaperTemplate = 'plain' | 'lined-s' | 'lined-m' | 'grid-s' | 'grid-m' | 'margin-s' | 'margin-d';
export type PaperSize = 'a3' | 'a4' | 'a5' | 'infinite';

export interface Page {
    id: string;
    strokes: Stroke[];
}

export interface Notebook {
    id: string;
    title: string;
    createdAt: number;
    lastModified: number;
    paperTemplate: PaperTemplate;
    paperSize: PaperSize;
    coverColor: string;
    pages: Page[];
}

interface AppState {
    notebooks: Notebook[];
    activeNotebookId: string | null;
    activePageId: string | null;
    isLoaded: boolean;
    toolState: ToolState;

    // History (Ephemeral, per session/page switch)
    undoStack: Stroke[][];
    redoStack: Stroke[][];

    // Actions
    setToolState: (state: Partial<ToolState>) => void;
    createNotebook: (title: string, template: PaperTemplate, size: PaperSize, coverColor?: string) => void;
    deleteNotebook: (id: string) => void;
    openNotebook: (id: string) => void;
    closeNotebook: () => void;

    // History Actions
    undo: () => void;
    redo: () => void;

    // Editor Actions
    addPage: () => void;
    deletePage: (pageId: string) => void;
    setActivePage: (pageId: string) => void;
    addStroke: (pageId: string, stroke: Stroke) => void;
    deleteStroke: (pageId: string, strokeId: string) => void;
    clearStrokes: (pageId: string) => void;

    loadFromStorage: () => Promise<void>;
}

// --- Persistence Helper ---
let saveTimeout: any = null;
const DEBOUNCE_MS = 2000;

const scheduleSave = (notebooks: Notebook[]) => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        idbSet('freenota-data', notebooks).catch(err => console.error("Save failed", err));
    }, DEBOUNCE_MS);
};


// --- Store ---

export const useNoteStore = create<AppState>((set, get) => ({
    notebooks: [],
    activeNotebookId: null,
    activePageId: null,
    isLoaded: false,
    toolState: {
        activeTool: 'pen',
        color: '#000000',
        size: 4,
        opacity: 1,
        eraserMode: 'whole',
        eraserSize: 10,
    },
    undoStack: [],
    redoStack: [],

    setToolState: (newState) => set(state => ({ toolState: { ...state.toolState, ...newState } })),

    createNotebook: (title, template, size, coverColor) => {
        set(state => {
            const newNotebook: Notebook = {
                id: crypto.randomUUID(),
                title: title || 'Untitled Note',
                createdAt: Date.now(),
                lastModified: Date.now(),
                paperTemplate: template,
                paperSize: size,
                coverColor: coverColor || '#4F46E5',
                pages: [{ id: crypto.randomUUID(), strokes: [] }]
            };
            const updatedNotebooks = [newNotebook, ...state.notebooks];
            scheduleSave(updatedNotebooks);
            return { notebooks: updatedNotebooks };
        });
    },

    deleteNotebook: (id) => {
        set(state => {
            const updated = state.notebooks.filter(n => n.id !== id);
            scheduleSave(updated);
            return { notebooks: updated };
        });
    },

    openNotebook: (id) => {
        const nb = get().notebooks.find(n => n.id === id);
        if (nb && nb.pages.length > 0) {
            set({ activeNotebookId: id, activePageId: nb.pages[0].id, undoStack: [], redoStack: [] });
        }
    },

    closeNotebook: () => set({ activeNotebookId: null, activePageId: null, undoStack: [], redoStack: [] }),

    // --- History ---
    undo: () => {
        const { undoStack, redoStack, activeNotebookId, activePageId, notebooks } = get();
        if (!undoStack.length || !activeNotebookId || !activePageId) return;

        const prevStrokes = undoStack[undoStack.length - 1]; // State to revert TO
        const newUndoStack = undoStack.slice(0, -1);

        // Find current strokes to push to redo
        const activeNotebook = notebooks.find(n => n.id === activeNotebookId);
        const activePage = activeNotebook?.pages.find(p => p.id === activePageId);
        const currentStrokes = activePage?.strokes || [];

        const newRedoStack = [currentStrokes, ...redoStack];

        const updatedNotebooks = notebooks.map(nb => {
            if (nb.id !== activeNotebookId) return nb;
            return {
                ...nb,
                pages: nb.pages.map(p => p.id === activePageId ? { ...p, strokes: prevStrokes } : p)
            };
        });

        set({ notebooks: updatedNotebooks, undoStack: newUndoStack, redoStack: newRedoStack });
        scheduleSave(updatedNotebooks);
    },

    redo: () => {
        const { undoStack, redoStack, activeNotebookId, activePageId, notebooks } = get();
        if (!redoStack.length || !activeNotebookId || !activePageId) return;

        const nextStrokes = redoStack[0];
        const newRedoStack = redoStack.slice(1);

        // Find current strokes to push to undo
        const activeNotebook = notebooks.find(n => n.id === activeNotebookId);
        const activePage = activeNotebook?.pages.find(p => p.id === activePageId);
        const currentStrokes = activePage?.strokes || [];

        const newUndoStack = [...undoStack, currentStrokes];

        const updatedNotebooks = notebooks.map(nb => {
            if (nb.id !== activeNotebookId) return nb;
            return {
                ...nb,
                pages: nb.pages.map(p => p.id === activePageId ? { ...p, strokes: nextStrokes } : p)
            };
        });

        set({ notebooks: updatedNotebooks, undoStack: newUndoStack, redoStack: newRedoStack });
        scheduleSave(updatedNotebooks);
    },

    // --- Page Actions ---

    addPage: () => {
        set(state => {
            if (!state.activeNotebookId) return state;

            const updatedNotebooks = state.notebooks.map(nb => {
                if (nb.id !== state.activeNotebookId) return nb;

                const newPage: Page = { id: crypto.randomUUID(), strokes: [] };
                return { ...nb, pages: [...nb.pages, newPage] };
            });

            // Find the ID of the new page to set it active
            const activeNb = updatedNotebooks.find(n => n.id === state.activeNotebookId);
            const newActivePageId = activeNb?.pages[activeNb.pages.length - 1].id;

            scheduleSave(updatedNotebooks);
            // Clear history on page switch
            return { notebooks: updatedNotebooks, activePageId: newActivePageId, undoStack: [], redoStack: [] };
        });
    },

    deletePage: (pageId) => {
        set(state => {
            if (!state.activeNotebookId) return state;

            const updatedNotebooks = state.notebooks.map(nb => {
                if (nb.id !== state.activeNotebookId) return nb;
                if (nb.pages.length <= 1) return nb; // Prevent deleting last page
                return { ...nb, pages: nb.pages.filter(p => p.id !== pageId) };
            });

            scheduleSave(updatedNotebooks);
            // Clear history? Maybe safer.
            return { notebooks: updatedNotebooks, undoStack: [], redoStack: [] };
        });
    },

    setActivePage: (pageId) => set({ activePageId: pageId, undoStack: [], redoStack: [] }),

    addStroke: (pageId, stroke) => {
        set(state => {
            if (!state.activeNotebookId) return state;

            // Capture current state for Undo BEFORE update
            // OPTIMIZATION: Don't deep clone EVERYTHING if we can avoid it.
            // But Zustand updates are immutable.

            const activeNb = state.notebooks.find(n => n.id === state.activeNotebookId);
            const activeNbIndex = state.notebooks.findIndex(n => n.id === state.activeNotebookId);
            if (!activeNb || activeNbIndex === -1) return state;

            const activePg = activeNb.pages.find(p => p.id === pageId);
            const activePgIndex = activeNb.pages.findIndex(p => p.id === pageId);
            if (!activePg || activePgIndex === -1) return state;

            // History management
            const newUndoStack = [...state.undoStack, activePg.strokes];

            // Selective update: Construct new arrays only for the path to the changed data
            const newPage = { ...activePg, strokes: [...activePg.strokes, stroke] };

            const newPages = [...activeNb.pages];
            newPages[activePgIndex] = newPage;

            const newNotebook = { ...activeNb, pages: newPages, lastModified: Date.now() };

            const newNotebooks = [...state.notebooks];
            newNotebooks[activeNbIndex] = newNotebook;

            scheduleSave(newNotebooks);
            return { notebooks: newNotebooks, undoStack: newUndoStack, redoStack: [] };
        });
    },

    deleteStroke: (pageId, strokeId) => {
        set(state => {
            if (!state.activeNotebookId) return state;

            const activeNb = state.notebooks.find(n => n.id === state.activeNotebookId);
            if (!activeNb) return state;
            const activePg = activeNb.pages.find(p => p.id === pageId);
            if (!activePg) return state;

            const newUndoStack = [...state.undoStack, activePg.strokes];

            const updatedNotebooks = state.notebooks.map(nb => {
                if (nb.id !== state.activeNotebookId) return nb;

                return {
                    ...nb,
                    pages: nb.pages.map(p =>
                        p.id === pageId
                            ? { ...p, strokes: p.strokes.filter(s => s.id !== strokeId) }
                            : p
                    ),
                    lastModified: Date.now()
                };
            });

            scheduleSave(updatedNotebooks);
            return { notebooks: updatedNotebooks, undoStack: newUndoStack, redoStack: [] };
        });
    },

    clearStrokes: (pageId) => {
        set(state => {
            if (!state.activeNotebookId) return state;

            const activeNb = state.notebooks.find(n => n.id === state.activeNotebookId);
            const activePg = activeNb?.pages.find(p => p.id === pageId);
            const currentStrokes = activePg?.strokes || [];

            const newUndoStack = [...state.undoStack, currentStrokes];

            const updatedNotebooks = state.notebooks.map(nb => {
                if (nb.id !== state.activeNotebookId) return nb;
                return {
                    ...nb,
                    pages: nb.pages.map(p => p.id === pageId ? { ...p, strokes: [] } : p),
                    lastModified: Date.now()
                };
            });

            scheduleSave(updatedNotebooks);
            return { notebooks: updatedNotebooks, undoStack: newUndoStack, redoStack: [] };
        });
    },

    loadFromStorage: async () => {
        const data = await idbGet<Notebook[]>('freenota-data');
        if (data) {
            set({ notebooks: data, isLoaded: true });
        } else {
            // Create a default welcome notebook if empty
            const welcomeId = crypto.randomUUID();
            const defaultNotebook: Notebook = {
                id: welcomeId,
                title: 'Welcome to Freenota',
                createdAt: Date.now(),
                lastModified: Date.now(),
                paperTemplate: 'plain',
                paperSize: 'infinite',
                coverColor: '#4F46E5',
                pages: [{ id: crypto.randomUUID(), strokes: [] }]
            };
            set({ notebooks: [defaultNotebook], isLoaded: true });
            idbSet('freenota-data', [defaultNotebook]);
        }
    }
}));
