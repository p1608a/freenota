import React, { useState } from 'react';
import { useNoteStore, type PaperSize, type PaperTemplate } from '../store/noteStore';
import { X, Check } from 'lucide-react';
import clsx from 'clsx';

interface CreateNotebookModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const PAPER_SIZES: { value: PaperSize; label: string }[] = [
    { value: 'infinite', label: 'Infinite Canvas' },
    { value: 'a3', label: 'A3 (Large)' },
    { value: 'a4', label: 'A4 (Standard)' },
    { value: 'a5', label: 'A5 (Small)' },
];

const TEMPLATES: { value: PaperTemplate; label: string }[] = [
    { value: 'plain', label: 'Plain' },
    { value: 'lined-s', label: 'Lined (Small)' },
    { value: 'lined-m', label: 'Lined (Medium)' },
    { value: 'grid-s', label: 'Grid (Small)' },
    { value: 'grid-m', label: 'Grid (Medium)' },
    { value: 'margin-s', label: 'Single Margin' },
    { value: 'margin-d', label: 'Double Margin' },
];

const COLORS = [
    '#4F46E5', // Indigo
    '#EF4444', // Red
    '#10B981', // Emerald
    '#F59E0B', // Amber
    '#EC4899', // Pink
    '#3B82F6', // Blue
    '#6366F1', // Violet
    '#1f2937', // Dark
];

export const CreateNotebookModal: React.FC<CreateNotebookModalProps> = ({ isOpen, onClose }) => {
    const { createNotebook, notebooks } = useNoteStore();
    const [title, setTitle] = useState('New Notebook');
    const [size, setSize] = useState<PaperSize>('infinite');
    const [template, setTemplate] = useState<PaperTemplate>('plain');
    const [coverColor, setCoverColor] = useState('#4F46E5');
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleCreate = () => {
        if (notebooks.some(n => n.title.trim().toLowerCase() === title.trim().toLowerCase())) {
            setError('A notebook with this name already exists. Please choose a different name.');
            return;
        }
        createNotebook(title, template, size, coverColor);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <h2 className="text-xl font-bold text-gray-800">Create New Notebook</h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto space-y-8 flex-1">

                    {/* Title Input */}
                    <div className="space-y-3">
                        <label className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Notebook Title</label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => {
                                setTitle(e.target.value);
                                setError('');
                            }}
                            className={clsx(
                                "w-full p-4 text-lg border-2 rounded-xl focus:ring-0 outline-none transition-all bg-gray-50 focus:bg-white",
                                error ? "border-red-500 focus:border-red-500" : "border-gray-200 focus:border-blue-500"
                            )}
                            placeholder="Enter title..."
                        />
                        {error && (
                            <p className="text-red-500 text-sm font-medium animate-in slide-in-from-top-1">{error}</p>
                        )}
                    </div>

                    {/* Cover Color */}
                    <div className="space-y-3">
                        <label className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Cover Color</label>
                        <div className="flex gap-3 flex-wrap">
                            {COLORS.map(c => (
                                <button
                                    key={c}
                                    onClick={() => setCoverColor(c)}
                                    className={clsx(
                                        "w-10 h-10 rounded-full transition-transform hover:scale-110 ring-2 ring-offset-2",
                                        coverColor === c ? "ring-gray-400 scale-110" : "ring-transparent"
                                    )}
                                    style={{ backgroundColor: c }}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Paper Size */}
                    <div className="space-y-3">
                        <label className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Page Size</label>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {PAPER_SIZES.map(s => (
                                <button
                                    key={s.value}
                                    onClick={() => setSize(s.value)}
                                    className={clsx(
                                        "p-3 rounded-xl border-2 text-sm font-medium transition-all text-center",
                                        size === s.value
                                            ? "border-blue-500 bg-blue-50 text-blue-700"
                                            : "border-gray-100 bg-white text-gray-600 hover:border-gray-200"
                                    )}
                                >
                                    {s.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Template */}
                    <div className="space-y-3">
                        <label className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Page Template</label>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            {TEMPLATES.map(t => (
                                <button
                                    key={t.value}
                                    onClick={() => setTemplate(t.value)}
                                    className={clsx(
                                        "p-4 rounded-xl border-2 text-sm font-medium transition-all flex items-center justify-between group",
                                        template === t.value
                                            ? "border-blue-500 bg-blue-50 text-blue-700"
                                            : "border-gray-100 bg-white text-gray-600 hover:border-gray-200"
                                    )}
                                >
                                    <span>{t.label}</span>
                                    {template === t.value && <Check size={16} />}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-6 py-3 rounded-xl font-medium text-gray-600 hover:bg-gray-200 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleCreate}
                        className="px-8 py-3 rounded-xl font-medium text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-200 transition-transform active:scale-95"
                    >
                        Create Notebook
                    </button>
                </div>
            </div>
        </div>
    );
};
