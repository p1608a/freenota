import React, { useState, useRef, useMemo } from "react";
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

// Render logic detached to be reusable or memoizable
const StrokePath = React.memo(({ stroke }: { stroke: Stroke }) => {
    const outlinePoints = getStroke(stroke.points, {
        size: stroke.size,
        thinning: stroke.tool === 'pen' ? 0.5 : 0,
        smoothing: 0.5,
        streamline: 0.5,
        simulatePressure: stroke.tool !== 'highlighter',
    });
    const pathData = getSvgPathFromStroke(outlinePoints);

    return (
        <path
            d={pathData}
            fill={stroke.color}
            fillOpacity={stroke.opacity ?? 1}
            style={{ mixBlendMode: stroke.tool === 'highlighter' ? 'multiply' : 'normal' }}
        />
    );
});

const StaticStrokes = React.memo(({ strokes }: { strokes: Stroke[] }) => {
    return (
        <g>
            {strokes.map((stroke) => (
                <StrokePath key={stroke.id} stroke={stroke} />
            ))}
        </g>
    );
});


export const Whiteboard: React.FC = () => {
    const { notebooks, activeNotebookId, activePageId, addStroke, deleteStroke, toolState } = useNoteStore();
    const svgRef = useRef<SVGSVGElement>(null);

    // Find the active notebook and page
    const activeNotebook = notebooks.find(n => n.id === activeNotebookId);
    const activePage = activeNotebook?.pages.find(p => p.id === activePageId);
    const strokes = activePage?.strokes || [];

    const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
    const currentStrokeRef = useRef<Stroke | null>(null);

    if (!activeNotebook) return <div className="p-10 text-gray-400">No Notebook Open</div>;

    const paperDims = getPaperDimensions(activeNotebook.paperSize);
    const isInfinite = activeNotebook.paperSize === 'infinite';

    const handlePointerDown = (e: React.PointerEvent) => {
        if (!svgRef.current || !activePageId) return;
        if (toolState.activeTool === 'select' || toolState.activeTool === 'laser') return;

        (e.target as Element).setPointerCapture(e.pointerId);

        const rect = svgRef.current.getBoundingClientRect();
        // Use pressure if available, default to 0.5
        const startPoint = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
            pressure: e.pressure
        };

        if (toolState.activeTool === 'eraser' && toolState.eraserMode === 'whole') return;

        const isEraser = toolState.activeTool === 'eraser';
        const strokeColor = isEraser ? '#FFFFFF' : toolState.color;

        const newStroke: Stroke = {
            id: crypto.randomUUID(),
            points: [startPoint],
            color: strokeColor,
            size: isEraser ? toolState.eraserSize : toolState.size,
            opacity: toolState.activeTool === 'highlighter' ? 0.3 : toolState.opacity,
            tool: toolState.activeTool,
            isComplete: false,
        };

        currentStrokeRef.current = newStroke;
        setCurrentStroke(newStroke);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!svgRef.current || !activePageId) return;

        // Optimize: Do not calculations if we are not dragging or erasing
        if (e.buttons !== 1) return;

        const rect = svgRef.current.getBoundingClientRect();
        const pt = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
            pressure: e.pressure
        };

        // Whole Eraser Logic
        if (toolState.activeTool === 'eraser' && toolState.eraserMode === 'whole') {
            const eraseRadius = toolState.eraserSize;
            // Throttle hit testing?
            requestAnimationFrame(() => {
                strokes.forEach(s => {
                    // Optimization: Check bounding box first before all points?
                    // For now, checking every 10th point might be faster?
                    const hit = s.points.some((p, i) => i % 2 === 0 && Math.hypot(p.x - pt.x, p.y - pt.y) < eraseRadius);
                    if (hit) {
                        deleteStroke(activePageId, s.id);
                    }
                });
            });
            return;
        }

        if (!currentStrokeRef.current) return;

        // Optimization: Don't update state if point hasn't moved enough?
        // But perfect-freehand handles smoothing.
        const updatedStroke = {
            ...currentStrokeRef.current,
            points: [...currentStrokeRef.current.points, pt]
        };

        currentStrokeRef.current = updatedStroke;
        setCurrentStroke(updatedStroke);
    };

    const handlePointerUp = () => {
        if (toolState.activeTool === 'eraser' && toolState.eraserMode === 'whole') return;

        if (!currentStrokeRef.current) return;
        if (activePageId) {
            addStroke(activePageId, { ...currentStrokeRef.current, isComplete: true });
        }

        currentStrokeRef.current = null;
        setCurrentStroke(null);
    };

    const getCursor = () => {
        if (toolState.activeTool === 'eraser') {
            const size = toolState.eraserSize;
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 1}" fill="none" stroke="black"/></svg>`;
            return `url('data:image/svg+xml;utf8,${encodeURIComponent(svg)}') ${size / 2} ${size / 2}, auto`;
        }
        if (toolState.activeTool === 'select') return 'default';
        return 'crosshair';
    };

    return (
        <div className="w-full h-full relative overflow-auto bg-gray-200 flex items-center justify-center p-8">
            <Toolbar />
            <div
                className={clsx(
                    "bg-white shadow-2xl transition-all relative",
                    isInfinite ? "w-full h-full" : "shrink-0"
                )}
                style={{
                    width: typeof paperDims.width === 'number' ? `${paperDims.width}px` : paperDims.width,
                    height: typeof paperDims.height === 'number' ? `${paperDims.height}px` : paperDims.height,
                    ...getPatternStyle(activeNotebook.paperTemplate)
                }}
            >
                <svg
                    ref={svgRef}
                    className="w-full h-full touch-none"
                    style={{ cursor: getCursor() }}
                    // Use pointer events, ensure touch-action is none (in class above)
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerLeave={handlePointerUp}
                >
                    <StaticStrokes strokes={strokes} />
                    {currentStroke && <StrokePath stroke={currentStroke} />}
                </svg>
            </div>
        </div>
    );
};
