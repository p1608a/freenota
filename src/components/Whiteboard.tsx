import React, { useState, useRef } from "react";
import { getStroke } from "perfect-freehand";
import { getSvgPathFromStroke } from "../utils/ink";
import { useNoteStore, type Stroke, type PaperSize, type PaperTemplate } from "../store/noteStore";
import { Toolbar } from "./Toolbar";
import clsx from "clsx";

// --- Utilities for Display ---

const getPaperDimensions = (size: PaperSize) => {
    switch (size) {
        case 'a3': return { width: 1122, height: 1587 };
        case 'a4': return { width: 794, height: 1123 }; // roughly 96 DPI
        case 'a5': return { width: 559, height: 794 };
        case 'infinite': return { width: '100%', height: '100%' };
    }
};

const getPatternStyle = (template: PaperTemplate) => {
    const baseLineColor = '#e5e7eb'; // gray-200
    const marginColor = '#fca5a5'; // red-300

    switch (template) {
        case 'lined-s':
            return { backgroundImage: `linear-gradient(${baseLineColor} 1px, transparent 1px)`, backgroundSize: '100% 20px' };
        case 'lined-m':
            return { backgroundImage: `linear-gradient(${baseLineColor} 1px, transparent 1px)`, backgroundSize: '100% 30px' };
        case 'grid-s':
            return {
                backgroundImage: `linear-gradient(${baseLineColor} 1px, transparent 1px), linear-gradient(90deg, ${baseLineColor} 1px, transparent 1px)`,
                backgroundSize: '20px 20px'
            };
        case 'grid-m':
            return {
                backgroundImage: `linear-gradient(${baseLineColor} 1px, transparent 1px), linear-gradient(90deg, ${baseLineColor} 1px, transparent 1px)`,
                backgroundSize: '30px 30px'
            };
        case 'margin-s':
            return {
                backgroundImage: `linear-gradient(90deg, transparent 60px, ${marginColor} 60px, ${marginColor} 61px, transparent 61px)`
            };
        case 'margin-d':
            return {
                backgroundImage: `linear-gradient(90deg, transparent 60px, ${marginColor} 60px, ${marginColor} 61px, transparent 61px, transparent 64px, ${marginColor} 64px, ${marginColor} 65px, transparent 65px)`
            };
        case 'plain':
        default:
            return {};
    }
};


export const Whiteboard: React.FC = () => {
    const { notebooks, activeNotebookId, activePageId, addStroke, deleteStroke, toolState } = useNoteStore();
    const svgRef = useRef<SVGSVGElement>(null);

    // Find the active notebook and page
    const activeNotebook = notebooks.find(n => n.id === activeNotebookId);
    const activePage = activeNotebook?.pages.find(p => p.id === activePageId);
    const strokes = activePage?.strokes || [];

    const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);

    if (!activeNotebook) return <div className="p-10 text-gray-400">No Notebook Open</div>;

    const paperDims = getPaperDimensions(activeNotebook.paperSize);
    const isInfinite = activeNotebook.paperSize === 'infinite';

    const handlePointerDown = (e: React.PointerEvent) => {
        if (!svgRef.current || !activePageId) return;

        // Block interaction if using utility tools that don't draw (like Select, if we were strictly mode-based, but for now select does nothing on down)
        if (toolState.activeTool === 'select' || toolState.activeTool === 'laser') return;

        (e.target as Element).setPointerCapture(e.pointerId);

        const rect = svgRef.current.getBoundingClientRect();
        const startPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top, pressure: e.pressure };

        // Eraser Logic (Whole Eraser deletes on click/drag)
        if (toolState.activeTool === 'eraser' && toolState.eraserMode === 'whole') {
            // For now, let's just create a "erasing stroke" for visual feedback or handle click deletion. 
            // Implementing "Swipe to Delete" by finding intersecting strokes is better.
            // But for simplicity/MVP: "Partial Eraser" acts like a white pen. "Whole Eraser" acts like a delete tool on hover/click?
            // User requested "Whole erase or partial".
            // Let's implement Eraser as a "stroke" that, when finished, we calculating intersections?
            // actually, deleting on click is safer for "Whole". Deleting on swipe is "Blade" mode.
            // Let's treat Eraser as a tool that adds a stroke, but if it hits something, we remove it?
            // Complex. Let's make Eraser draw transparent/white lines for 'partial' and actually delete for 'whole'.

            // ... Actually, for "Whole Eraser", dragging across a line should delete it.
            // I'll implement a simple hit-test loop in pointerMove for Whole Eraser.
            return;
        }

        // Partial Eraser -> draws white (or background color)
        // Pen/Pencil/Highlighter -> draws normal
        const isEraser = toolState.activeTool === 'eraser';
        const strokeColor = isEraser ? '#FFFFFF' : toolState.color; // Assuming white paper for now
        // Highlighter Logic: draw with opacity?
        // NoteStore tracks opacity.

        setCurrentStroke({
            id: crypto.randomUUID(),
            points: [startPoint],
            color: strokeColor,
            size: isEraser ? toolState.eraserSize : toolState.size,
            opacity: toolState.activeTool === 'highlighter' ? 0.3 : toolState.opacity,
            tool: toolState.activeTool,
            isComplete: false,
        });
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!svgRef.current || !activePageId) return;
        const rect = svgRef.current.getBoundingClientRect();
        const pt = { x: e.clientX - rect.left, y: e.clientY - rect.top, pressure: e.pressure };

        // Whole Eraser Logic: Hit Test active strokes
        if (e.buttons === 1 && toolState.activeTool === 'eraser' && toolState.eraserMode === 'whole') {
            // Simple hitbox check: if point is close to any point in any stroke
            const eraseRadius = toolState.eraserSize;
            strokes.forEach(s => {
                // Sample points to improve performance?
                const hit = s.points.some(p => Math.hypot(p.x - pt.x, p.y - pt.y) < eraseRadius);
                if (hit) {
                    deleteStroke(activePageId, s.id);
                }
            });
            return;
        }

        if (e.buttons !== 1 || !currentStroke) return;

        setCurrentStroke(prev => {
            if (!prev) return null;
            return {
                ...prev,
                points: [...prev.points, pt]
            }
        });
    };

    const handlePointerUp = () => {
        if (toolState.activeTool === 'eraser' && toolState.eraserMode === 'whole') return;

        if (!currentStroke) return;
        if (activePageId) {
            addStroke(activePageId, { ...currentStroke, isComplete: true });
        }
        setCurrentStroke(null);
    };

    // Render logic
    const renderStroke = (stroke: Stroke, key?: number | string) => {
        const rawPoints = stroke.points.map(p => [p.x, p.y, p.pressure || 0.5]);
        const options = {
            size: stroke.size,
            thinning: stroke.tool === 'pen' ? 0.5 : 0, // No thinning for marker-like feel if needed
            smoothing: 0.5,
            streamline: 0.5,
            simulatePressure: stroke.tool !== 'highlighter', // Highlighters usually constant width
        };

        const outlinePoints = getStroke(rawPoints, options);
        const pathData = getSvgPathFromStroke(outlinePoints);

        return (
            <path
                key={key}
                d={pathData}
                fill={stroke.color}
                fillOpacity={stroke.opacity ?? 1} // handle transparency
                style={{ mixBlendMode: stroke.tool === 'highlighter' ? 'multiply' : 'normal' }} // Better highlighting
            />
        );
    };

    // Cursor Styling
    const getCursor = () => {
        if (toolState.activeTool === 'eraser') {
            const size = toolState.eraserSize;
            // Simple circle cursor
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 1}" fill="none" stroke="black"/></svg>`;
            return `url('data:image/svg+xml;utf8,${encodeURIComponent(svg)}') ${size / 2} ${size / 2}, auto`;
        }
        if (toolState.activeTool === 'select') return 'default'; // Or crosshair

        // Pen cursor
        return 'crosshair';
    };

    return (
        <div className="w-full h-full relative overflow-auto bg-gray-200 flex items-center justify-center p-8">
            <Toolbar />

            {/* Paper Container */}
            <div
                className={clsx(
                    "bg-white shadow-2xl transition-all relative",
                    isInfinite ? "w-full h-full" : "shrink-0"
                )}
                style={{
                    width: typeof paperDims.width === 'number' ? `${paperDims.width}px` : paperDims.width,
                    height: typeof paperDims.height === 'number' ? `${paperDims.height}px` : paperDims.height,
                    // Apply pattern styles
                    ...getPatternStyle(activeNotebook.paperTemplate)
                }}
            >
                <svg
                    ref={svgRef}
                    className="w-full h-full touch-none"
                    style={{ cursor: getCursor() }}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerLeave={handlePointerUp}
                >
                    {strokes.map((stroke, i) => renderStroke(stroke, stroke.id || i))}
                    {currentStroke && renderStroke(currentStroke, "current")}
                </svg>
            </div>
        </div>
    );
};
