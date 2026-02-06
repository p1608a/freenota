import React from 'react';
import { useNoteStore } from '../store/noteStore';
import { Plus, Trash2 } from 'lucide-react';
import clsx from 'clsx';

export const Sidebar: React.FC = () => {
    const { notebooks, activeNotebookId, activePageId, setActivePage, addPage, deletePage } = useNoteStore();

    const activeNotebook = notebooks.find(n => n.id === activeNotebookId);
    if (!activeNotebook) return null; // Or some other UI

    return (
        <div className="w-64 h-full bg-gray-100 border-r border-gray-200 flex flex-col backdrop-blur-xl bg-opacity-80">
            <div className="p-4 border-b border-gray-200 bg-white/50">
                <h1 className="text-xl font-bold bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent truncate">
                    {activeNotebook.title}
                </h1>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {activeNotebook.pages.map((page, index) => (
                    <div
                        key={page.id}
                        onClick={() => setActivePage(page.id)}
                        className={clsx(
                            "group flex items-center justify-between p-3 rounded-xl transition-all cursor-pointer border",
                            activePageId === page.id
                                ? "bg-white border-blue-400 shadow-sm ring-1 ring-blue-400"
                                : "bg-white/40 border-transparent hover:bg-white/80 hover:shadow-sm"
                        )}
                    >
                        <div className="flex items-center gap-3">
                            <div className={clsx(
                                "w-8 h-10 rounded border flex items-center justify-center text-xs font-medium",
                                activePageId === page.id ? "bg-blue-50 border-blue-200 text-blue-600" : "bg-gray-50 border-gray-200 text-gray-500"
                            )}>
                                {index + 1}
                            </div>
                            <span className="font-medium text-sm text-gray-700">Page {index + 1}</span>
                        </div>

                        <button
                            onClick={(e) => { e.stopPropagation(); deletePage(page.id); }}
                            className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                            title="Delete Page"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                ))}
            </div>

            <div className="p-4 border-t border-gray-200 bg-white/50">
                <button
                    onClick={addPage}
                    className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl font-medium shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 transition-all"
                >
                    <Plus size={18} />
                    New Page
                </button>
            </div>
        </div>
    );
};
