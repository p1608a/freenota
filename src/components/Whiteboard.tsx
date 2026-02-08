import React, { useRef, useMemo } from "react";
import { getStroke } from "perfect-freehand";
import { getSvgPathFromStroke } from "../utils/ink";
import { useNoteStore, type Stroke, type PaperSize, type PaperTemplate } from "../store/noteStore";
import { Toolbar } from "./Toolbar";
import { CanvasLayer } from "./CanvasLayer";
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

// SVG Stroke for static items - uses pre-computed pathData for performance
const StrokePath = React.memo(({ stroke }: { stroke: Stroke }) => {
    // Use pre-computed pathData if available, otherwise compute on-demand (for legacy strokes)
    const pathData = stroke.pathData ?? (() => {
        const outlinePoints = getStroke(stroke.points, {
            size: stroke.size,
            thinning: stroke.tool === 'pen' ? 0.5 : 0,
            smoothing: 0.5,
            streamline: 0.5,
            simulatePressure: stroke.tool !== 'highlighter',
        });
        return getSvgPathFromStroke(outlinePoints);
    })();

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

    // Find the active notebook and page
    const activeNotebook = useMemo(() => notebooks.find(n => n.id === activeNotebookId), [notebooks, activeNotebookId]);
    const activePage = useMemo(() => activeNotebook?.pages.find(p => p.id === activePageId), [activeNotebook, activePageId]);
    const strokes = activePage?.strokes || [];

    // Memoize handlers to prevent CanvasLayer re-renders
    const handleStrokeComplete = React.useCallback((stroke: Stroke) => {
        if (activePageId) {
            addStroke(activePageId, stroke);
        }
    }, [activePageId, addStroke]);

    const handleDeleteStroke = React.useCallback((strokeId: string) => {
        if (activePageId) {
            deleteStroke(activePageId, strokeId);
        }
    }, [activePageId, deleteStroke]);

    if (!activeNotebook) return <div className="p-10 text-gray-400">No Notebook Open</div>;

    const paperDims = getPaperDimensions(activeNotebook.paperSize);
    const isInfinite = activeNotebook.paperSize === 'infinite';

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

                <CanvasLayer
                    activePageId={activePageId}
                    toolState={toolState}
                    strokes={strokes}
                    width={typeof paperDims.width === 'number' ? paperDims.width : '100%'}
                    height={typeof paperDims.height === 'number' ? paperDims.height : '100%'}
                    onStrokeComplete={handleStrokeComplete}
                    onDeleteStroke={handleDeleteStroke}
                />
            </div>
        </div>
    );
};
