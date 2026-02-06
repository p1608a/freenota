import React, { useRef, useMemo, useEffect } from "react";
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

// SVG Stroke for static items
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
    // Select only what we need to minimize re-renders
    const notebooks = useNoteStore(state => state.notebooks);
    const activeNotebookId = useNoteStore(state => state.activeNotebookId);
    const activePageId = useNoteStore(state => state.activePageId);
    const addStroke = useNoteStore(state => state.addStroke);
    const deleteStroke = useNoteStore(state => state.deleteStroke);
    const toolState = useNoteStore(state => state.toolState);

    const svgRef = useRef<SVGSVGElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Active stroke tracking (Ref-based for speed)
    const pointsRef = useRef<{ x: number, y: number, pressure: number }[]>([]);
    const isDrawingRef = useRef(false);

    // Find the active notebook and page
    const activeNotebook = useMemo(() => notebooks.find(n => n.id === activeNotebookId), [notebooks, activeNotebookId]);
    const activePage = useMemo(() => activeNotebook?.pages.find(p => p.id === activePageId), [activeNotebook, activePageId]);
    const strokes = activePage?.strokes || [];

    if (!activeNotebook) return <div className="p-10 text-gray-400">No Notebook Open</div>;

    const paperDims = getPaperDimensions(activeNotebook.paperSize);
    const isInfinite = activeNotebook.paperSize === 'infinite';

    // Canvas drawing function
    const drawActiveStroke = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Handle single-point strokes (dots/taps)
        if (pointsRef.current.length === 1) {
            const pt = pointsRef.current[0];
            const size = toolState.activeTool === 'eraser' ? toolState.eraserSize : toolState.size;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, size / 2, 0, Math.PI * 2);
            ctx.fillStyle = toolState.activeTool === 'eraser' ? '#FFFFFF' : toolState.color;
            ctx.globalAlpha = toolState.activeTool === 'highlighter' ? 0.3 : toolState.opacity;
            ctx.fill();
            return;
        }

        if (pointsRef.current.length < 2) return;

        const outlinePoints = getStroke(pointsRef.current, {
            size: toolState.activeTool === 'eraser' ? toolState.eraserSize : toolState.size,
            thinning: toolState.activeTool === 'pen' ? 0.5 : 0,
            smoothing: 0.5,
            streamline: 0.5,
            simulatePressure: toolState.activeTool !== 'highlighter',
        });

        if (outlinePoints.length < 3) return;

        ctx.beginPath();
        ctx.moveTo(outlinePoints[0][0], outlinePoints[0][1]);
        for (let i = 1; i < outlinePoints.length; i++) {
            ctx.lineTo(outlinePoints[i][0], outlinePoints[i][1]);
        }
        ctx.closePath();

        ctx.fillStyle = toolState.activeTool === 'eraser' ? '#FFFFFF' : toolState.color;
        ctx.globalAlpha = toolState.activeTool === 'highlighter' ? 0.3 : toolState.opacity;

        if (toolState.activeTool === 'highlighter') {
            ctx.globalCompositeOperation = 'multiply';
        } else {
            ctx.globalCompositeOperation = 'source-over';
        }

        ctx.fill();
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        e.preventDefault(); // Prevent browser default behaviors (scroll, selection)
        const currentActivePageId = activePageId;
        if (!canvasRef.current || !currentActivePageId) return;
        if (toolState.activeTool === 'select' || toolState.activeTool === 'laser') return;

        (e.target as Element).setPointerCapture(e.pointerId);
        isDrawingRef.current = true;

        const rect = canvasRef.current.getBoundingClientRect();

        // Process coalesced events from pen/stylus for the initial touch as well
        const events = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() || [e.nativeEvent];
        pointsRef.current = [];

        for (const ev of events) {
            pointsRef.current.push({
                x: ev.clientX - rect.left,
                y: ev.clientY - rect.top,
                pressure: ev.pressure
            });
        }

        if (toolState.activeTool === 'eraser' && toolState.eraserMode === 'whole') return;

        drawActiveStroke();
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        e.preventDefault(); // Prevent browser default behaviors
        const currentActivePageId = activePageId;
        if (!isDrawingRef.current || !canvasRef.current || !currentActivePageId) return;

        const rect = canvasRef.current.getBoundingClientRect();

        // Styli often send multiple high-frequency events coalesced into one pointermove event.
        // We unpack them to ensure extreme accuracy.
        const events = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() || [e.nativeEvent];

        for (const ev of events) {
            const pt = {
                x: ev.clientX - rect.left,
                y: ev.clientY - rect.top,
                pressure: ev.pressure
            };

            // Whole Eraser Logic
            if (toolState.activeTool === 'eraser' && toolState.eraserMode === 'whole') {
                const eraseRadius = toolState.eraserSize;
                strokes.forEach(s => {
                    const hit = s.points.some((p, i) => i % 4 === 0 && Math.hypot(p.x - pt.x, p.y - pt.y) < eraseRadius);
                    if (hit) deleteStroke(currentActivePageId, s.id);
                });
                continue; // Move to next coalesced point if any
            }

            pointsRef.current.push(pt);
        }

        requestAnimationFrame(drawActiveStroke);
    };

    const handlePointerUp = () => {
        const currentActivePageId = activePageId;
        if (!isDrawingRef.current || !currentActivePageId) return;
        isDrawingRef.current = false;

        if (toolState.activeTool === 'eraser' && toolState.eraserMode === 'whole') return;

        // Save strokes even if they have only 1 point (a dot/tap)
        if (pointsRef.current.length > 0) {
            const isEraser = toolState.activeTool === 'eraser';
            const stroke: Stroke = {
                id: crypto.randomUUID(),
                points: [...pointsRef.current],
                color: isEraser ? '#FFFFFF' : toolState.color,
                size: isEraser ? toolState.eraserSize : toolState.size,
                opacity: toolState.activeTool === 'highlighter' ? 0.3 : toolState.opacity,
                tool: toolState.activeTool,
                isComplete: true
            };
            addStroke(currentActivePageId, stroke);
        }

        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx?.clearRect(0, 0, canvas.width, canvas.height);
        }
        pointsRef.current = [];
    };

    useEffect(() => {
        const updateCanvasSize = () => {
            if (canvasRef.current && (typeof paperDims.width === 'number' || isInfinite)) {
                const rect = canvasRef.current.parentElement?.getBoundingClientRect();
                if (rect) {
                    canvasRef.current.width = rect.width;
                    canvasRef.current.height = rect.height;
                }
            }
        };
        updateCanvasSize();
        window.addEventListener('resize', updateCanvasSize);
        return () => window.removeEventListener('resize', updateCanvasSize);
    }, [paperDims, isInfinite]);

    const getCursor = () => {
        if (toolState.activeTool === 'eraser') {
            const size = toolState.eraserSize;
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 1}" fill="none" stroke="black"/></svg>`;
            return `url('data:image/svg+xml;utf8,${encodeURIComponent(svg)}') ${size / 2} ${size / 2}, auto`;
        }
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
                    className="absolute inset-0 w-full h-full pointer-events-none"
                >
                    <StaticStrokes strokes={strokes} />
                </svg>

                <canvas
                    ref={canvasRef}
                    className="absolute inset-0 w-full h-full touch-none select-none"
                    style={{ cursor: getCursor() }}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerLeave={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                />
            </div>
        </div>
    );
};
