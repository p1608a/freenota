import React, { useState } from 'react';
import { useNoteStore } from '../store/noteStore';
import { Plus, Book, Trash2, Calendar, Download } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { CreateNotebookModal } from './CreateNotebookModal';
import { exportNotebookToPdf } from '../utils/export';
import { Logo } from './Logo';

export const Home: React.FC = () => {
    const { notebooks, deleteNotebook, openNotebook } = useNoteStore();
    const navigate = useNavigate();
    const [isModalOpen, setIsModalOpen] = useState(false);

    const handleOpen = (id: string) => {
        openNotebook(id);
        navigate(`/notebook/${id}`);
    };

    return (
        <div className="w-full h-full bg-gray-50 p-8 overflow-y-auto">
            <div className="max-w-6xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <Logo />

                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-6 py-3 shadow-lg flex items-center gap-2 transition-transform hover:scale-105 active:scale-95 font-medium"
                    >
                        <Plus size={20} />
                        <span>New Note</span>
                    </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {notebooks.map((nb) => (
                        <div
                            key={nb.id}
                            onClick={() => handleOpen(nb.id)}
                            className="bg-white rounded-2xl shadow-sm hover:shadow-md transition-all border border-gray-100 overflow-hidden group cursor-pointer aspect-[3/4] flex flex-col relative"
                        >
                            {/* Cover Preview (Dynamic color) */}
                            <div
                                className="flex-1 flex items-center justify-center relative transition-colors"
                                style={{ backgroundColor: nb.coverColor ? `${nb.coverColor}20` : '#eff6ff' }} // 20 hex for low opacity
                            >
                                <Book size={48} style={{ color: nb.coverColor || '#9ca3af' }} />

                                {/* Pages count badge */}
                                <div className="absolute bottom-2 right-2 bg-white/50 backdrop-blur-sm px-2 py-1 rounded-md text-xs text-gray-600 font-bold shadow-sm">
                                    {nb.pages.length} Pages
                                </div>
                            </div>

                            {/* Metadata */}
                            <div className="p-4 bg-white border-t border-gray-100 relative">
                                <h3 className="font-bold text-gray-800 truncate mb-1" title={nb.title}>{nb.title}</h3>
                                <div className="flex items-center gap-2 text-xs text-gray-400">
                                    <Calendar size={12} />
                                    <span>{new Date(nb.lastModified).toLocaleDateString()}</span>
                                </div>

                                <div className="absolute bottom-4 right-4 flex gap-1 bg-white/80 backdrop-blur-sm rounded-lg p-1 shadow-sm">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            exportNotebookToPdf(nb);
                                        }}
                                        className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                                        title="Export as PDF"
                                    >
                                        <Download size={18} />
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); deleteNotebook(nb.id); }}
                                        className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                                        title="Delete Notebook"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {notebooks.length === 0 && (
                    <div className="text-center mt-20 text-gray-400">
                        <Book size={64} className="mx-auto mb-4 opacity-20" />
                        <p>No notebooks yet. Tap "+ New Note" to start.</p>
                    </div>
                )}
            </div>

            <CreateNotebookModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
            />
        </div>
    );
};
