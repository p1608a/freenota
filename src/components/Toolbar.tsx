import React, { useState, useEffect, useRef } from 'react';
import { useNoteStore, type ToolType, type EraserMode } from '../store/noteStore';
import { Pen, Pencil, Highlighter, Eraser, MousePointer2, Trash2, Scaling, Undo, Redo, Minimize2 } from 'lucide-react';
import clsx from 'clsx';

const PRESET_COLORS = [
    '#000000', '#EF4444', '#3B82F6', '#10B981', '#F59E0B', '#6366F1', '#EC4899', '#FFFFFF'
];

export const Toolbar: React.FC = () => {
    const { toolState, setToolState, activePageId, clearStrokes, undo, redo, undoStack, redoStack } = useNoteStore();
    const [position, setPosition] = useState({ x: window.innerWidth / 2 - 200, y: 40 });
    const [isDragging, setIsDragging] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const dragStartRef = useRef<{ x: number, y: number } | null>(null);
    const toolBarRef = useRef<HTMLDivElement>(null);

    // Drag Logic
    useEffect(() => {
        const handleMove = (e: PointerEvent) => {
            if (!isDragging || !dragStartRef.current) return;
            const dx = e.clientX - dragStartRef.current.x;
            const dy = e.clientY - dragStartRef.current.y;

            setPosition(prev => ({
                x: prev.x + dx,
                y: prev.y + dy
            }));

            dragStartRef.current = { x: e.clientX, y: e.clientY };
        };

        const handleUp = () => setIsDragging(false);

        if (isDragging) {
            window.addEventListener('pointermove', handleMove);
            window.addEventListener('pointerup', handleUp);
        }
        return () => {
            window.removeEventListener('pointermove', handleMove);
            window.removeEventListener('pointerup', handleUp);
        };
    }, [isDragging]);

    const startDrag = (e: React.PointerEvent) => {
        setIsDragging(true);
        dragStartRef.current = { x: e.clientX, y: e.clientY };
        (e.target as Element).setPointerCapture(e.pointerId);
    };

    // Tool Config Helpers
    const update = (patch: Partial<typeof toolState>) => setToolState(patch);

    const ToolButton = ({ tool, icon: Icon }: { tool: ToolType; icon: any }) => (
        <button
            onClick={() => update({ activeTool: tool })}
            className={clsx(
                "p-3 rounded-xl transition-all hover:bg-gray-100 active:scale-95 flex flex-col items-center gap-1 min-w-[3rem]",
                toolState.activeTool === tool ? "bg-blue-100 text-blue-600 ring-2 ring-blue-400 ring-offset-2" : "text-gray-500"
            )}
            title={tool.charAt(0).toUpperCase() + tool.slice(1)}
        >
            <Icon size={24} />
            <span className="text-[10px] font-medium">{tool}</span>
        </button>
    );

    if (isMinimized) {
        return (
            <div
                style={{ left: position.x, top: position.y, touchAction: 'none' }}
                className="fixed z-[100] animate-in fade-in zoom-in duration-200"
            >
                <div
                    onPointerDown={startDrag}
                    onClick={() => {
                        setIsMinimized(false);
                    }}
                    className="w-14 h-14 bg-white border border-gray-200 text-blue-600 rounded-full shadow-2xl flex items-center justify-center hover:bg-gray-50 transition-transform active:scale-95 cursor-move"
                    title="Restore Toolbar"
                >
                    <Pen size={24} />
                </div>
            </div>
        );
    }

    return (
        <div
            ref={toolBarRef}
            style={{
                left: position.x,
                top: position.y,
                touchAction: 'none'
            }}
            className="fixed bg-white/95 backdrop-blur shadow-2xl rounded-3xl border border-gray-200 w-[420px] flex flex-col z-[100] animate-in fade-in zoom-in-95 duration-200"
        >
            {/* Drag Handle & Header */}
            <div
                onPointerDown={startDrag}
                className="h-10 w-full bg-gray-50 border-b border-gray-100 rounded-t-3xl cursor-move flex items-center justify-between px-4 group"
            >
                {/* Undo/Redo in Header */}
                <div className="flex gap-2" onPointerDown={e => e.stopPropagation()}>
                    <button
                        onClick={undo}
                        disabled={undoStack.length === 0}
                        className="p-1.5 rounded-lg hover:bg-white text-gray-600 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                        title="Undo"
                    >
                        <Undo size={16} />
                    </button>
                    <button
                        onClick={redo}
                        disabled={redoStack.length === 0}
                        className="p-1.5 rounded-lg hover:bg-white text-gray-600 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                        title="Redo"
                    >
                        <Redo size={16} />
                    </button>
                </div>

                <div className="w-12 h-1 bg-gray-300 rounded-full group-hover:bg-gray-400 transition-colors" />

                {/* Minimize Button */}
                <button
                    onPointerDown={e => e.stopPropagation()}
                    onClick={() => setIsMinimized(true)}
                    className="p-1.5 rounded-lg hover:bg-white text-gray-500 hover:text-gray-800 transition-colors"
                    title="Minimize"
                >
                    <Minimize2 size={16} />
                </button>
            </div>

            <div className="p-4 space-y-4">
                {/* Tools Row */}
                <div className="flex justify-between gap-1 items-center bg-gray-50 p-1.5 rounded-2xl">
                    <ToolButton tool="pen" icon={Pen} />
                    <ToolButton tool="pencil" icon={Pencil} />
                    <ToolButton tool="highlighter" icon={Highlighter} />
                    <ToolButton tool="eraser" icon={Eraser} />
                    <ToolButton tool="select" icon={MousePointer2} />
                    <ToolButton tool="laser" icon={Scaling} />
                </div>

                {/* Sub-Menu: Contextual Settings */}
                <div className="space-y-4 px-2">

                    {/* Color Picker (Only for drawing tools) */}
                    {(toolState.activeTool === 'pen' || toolState.activeTool === 'pencil' || toolState.activeTool === 'highlighter') && (
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Color</label>
                            <div className="flex flex-wrap gap-3 items-center">
                                {PRESET_COLORS.map(c => (
                                    <button
                                        key={c}
                                        onClick={() => update({ color: c })}
                                        className={clsx(
                                            "w-8 h-8 rounded-full border border-black/10 transition-transform hover:scale-110",
                                            toolState.color === c ? "ring-2 ring-offset-2 ring-gray-400 scale-110" : ""
                                        )}
                                        style={{ backgroundColor: c }}
                                    />
                                ))}
                                {/* Custom Color Input */}
                                <div className="relative w-8 h-8 rounded-full overflow-hidden border border-black/10">
                                    <input
                                        type="color"
                                        value={toolState.color}
                                        onChange={e => update({ color: e.target.value })}
                                        className="absolute -top-2 -left-2 w-12 h-12 cursor-pointer p-0 border-0"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Size & Opacity Slider */}
                    {(toolState.activeTool !== 'select' && toolState.activeTool !== 'laser') && (
                        <div className="space-y-3">
                            <div className="flex justify-between items-center text-xs font-bold text-gray-400 uppercase tracking-wider">
                                <span>Size</span>
                                <span>{toolState.activeTool === 'eraser' ? toolState.eraserSize : toolState.size}px</span>
                            </div>
                            <input
                                type="range"
                                min="1"
                                max={toolState.activeTool === 'eraser' ? 100 : 50}
                                step="1"
                                value={toolState.activeTool === 'eraser' ? toolState.eraserSize : toolState.size}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value);
                                    if (toolState.activeTool === 'eraser') update({ eraserSize: val });
                                    else update({ size: val });
                                }}
                                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                            />

                            {/* Eraser Mode Toggle */}
                            {toolState.activeTool === 'eraser' && (
                                <div className="flex bg-gray-100 p-1 rounded-lg mt-2">
                                    {(['partial', 'whole'] as EraserMode[]).map(mode => (
                                        <button
                                            key={mode}
                                            onClick={() => update({ eraserMode: mode })}
                                            className={clsx(
                                                "flex-1 py-1.5 text-xs font-medium rounded-md capitalize transition-colors",
                                                toolState.eraserMode === mode ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"
                                            )}
                                        >
                                            {mode} Eraser
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Actions Row */}
                    <div className="pt-2 border-t border-gray-100 flex justify-end">
                        <button
                            onClick={() => activePageId && clearStrokes(activePageId)}
                            className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                            <Trash2 size={14} />
                            Clear Page
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
