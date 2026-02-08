import React, { useRef, useEffect, useCallback } from 'react';
import { type Stroke, type ToolState } from '../store/noteStore';

interface CanvasLayerProps {
    activePageId: string | null;
    toolState: ToolState;
    strokes: Stroke[];
    width: number | string;
    height: number | string;
    onStrokeComplete: (stroke: Stroke) => void;
    onDeleteStroke: (strokeId: string) => void;
}

/**
 * Generate SVG path data using quadratic bezier curves
 */
function generateSmoothPath(points: { x: number, y: number, pressure?: number }[]): string {
    if (points.length === 0) return '';
    if (points.length === 1) {
        return `M ${points[0].x} ${points[0].y} L ${points[0].x} ${points[0].y}`;
    }
    if (points.length === 2) {
        return `M ${points[0].x} ${points[0].y} L ${points[1].x},${points[1].y}`;
    }

    let path = `M ${points[0].x} ${points[0].y}`;

    for (let i = 1; i < points.length - 1; i++) {
        const p0 = points[i];
        const p1 = points[i + 1];
        const midX = (p0.x + p1.x) / 2;
        const midY = (p0.y + p1.y) / 2;
        path += ` Q ${p0.x},${p0.y} ${midX},${midY}`;
    }

    const lastPoint = points[points.length - 1];
    path += ` L ${lastPoint.x},${lastPoint.y}`;

    return path;
}

/**
 * CanvasLayer - Aggressive event handling WITHOUT pointer capture
 * 
 * CRITICAL CHANGE: Removed setPointerCapture/releasePointerCapture entirely.
 * Some drawing apps don't use it - they just track button state.
 * Pointer capture can cause browser-level delays that drop fast strokes.
 */
export const CanvasLayer: React.FC<CanvasLayerProps> = React.memo(({
    activePageId,
    toolState,
    strokes,
    width,
    height,
    onStrokeComplete,
    onDeleteStroke
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);

    const pointsRef = useRef<{ x: number, y: number, pressure: number }[]>([]);
    const isDrawingRef = useRef(false);
    const rafId = useRef<number | null>(null);

    // Store refs to current props
    const toolStateRef = useRef(toolState);
    const activePageIdRef = useRef(activePageId);
    const strokesRef = useRef(strokes);
    const onStrokeCompleteRef = useRef(onStrokeComplete);
    const onDeleteStrokeRef = useRef(onDeleteStroke);

    useEffect(() => { toolStateRef.current = toolState; }, [toolState]);
    useEffect(() => { activePageIdRef.current = activePageId; }, [activePageId]);
    useEffect(() => { strokesRef.current = strokes; }, [strokes]);
    useEffect(() => { onStrokeCompleteRef.current = onStrokeComplete; }, [onStrokeComplete]);
    useEffect(() => { onDeleteStrokeRef.current = onDeleteStroke; }, [onDeleteStroke]);

    // Canvas resize handling
    useEffect(() => {
        const updateCanvasSize = () => {
            if (canvasRef.current) {
                const parent = canvasRef.current.parentElement;
                if (parent) {
                    const rect = parent.getBoundingClientRect();
                    canvasRef.current.width = rect.width;
                    canvasRef.current.height = rect.height;
                }
            }
        };

        updateCanvasSize();

        const resizeObserver = new ResizeObserver(updateCanvasSize);
        if (canvasRef.current?.parentElement) {
            resizeObserver.observe(canvasRef.current.parentElement);
        }

        window.addEventListener('resize', updateCanvasSize);
        return () => {
            window.removeEventListener('resize', updateCanvasSize);
            resizeObserver.disconnect();
        };
    }, [width, height]);

    // Draw active stroke on canvas
    const drawActiveStroke = useCallback(() => {
        const canvas = canvasRef.current;
        const ts = toolStateRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (pointsRef.current.length === 0) return;

        const size = ts.activeTool === 'eraser' ? ts.eraserSize : ts.size;
        const color = ts.activeTool === 'eraser' ? '#FFFFFF' : ts.color;
        const opacity = ts.activeTool === 'highlighter' ? 0.3 : ts.opacity;

        ctx.strokeStyle = color;
        ctx.lineWidth = size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalAlpha = opacity;

        if (ts.activeTool === 'highlighter') {
            ctx.globalCompositeOperation = 'multiply';
        } else {
            ctx.globalCompositeOperation = 'source-over';
        }

        ctx.beginPath();

        if (pointsRef.current.length === 1) {
            const pt = pointsRef.current[0];
            ctx.arc(pt.x, pt.y, size / 2, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.moveTo(pointsRef.current[0].x, pointsRef.current[0].y);

            for (let i = 1; i < pointsRef.current.length - 1; i++) {
                const p0 = pointsRef.current[i];
                const p1 = pointsRef.current[i + 1];
                const midX = (p0.x + p1.x) / 2;
                const midY = (p0.y + p1.y) / 2;
                ctx.quadraticCurveTo(p0.x, p0.y, midX, midY);
            }

            const lastPoint = pointsRef.current[pointsRef.current.length - 1];
            ctx.lineTo(lastPoint.x, lastPoint.y);
            ctx.stroke();
        }

        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
    }, []);

    // Commit current stroke and reset state
    const commitStroke = useCallback(() => {
        const ts = toolStateRef.current;
        const canvas = canvasRef.current;

        if (rafId.current) {
            cancelAnimationFrame(rafId.current);
            rafId.current = null;
        }

        // Clear canvas
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx?.clearRect(0, 0, canvas.width, canvas.height);
        }

        const strokePoints = [...pointsRef.current];
        pointsRef.current = [];
        isDrawingRef.current = false;

        if (ts.activeTool === 'eraser' && ts.eraserMode === 'whole') {
            return;
        }

        if (strokePoints.length > 0) {
            const isEraser = ts.activeTool === 'eraser';
            const pathData = generateSmoothPath(strokePoints);

            const stroke: Stroke = {
                id: crypto.randomUUID(),
                points: strokePoints,
                color: isEraser ? '#FFFFFF' : ts.color,
                size: isEraser ? ts.eraserSize : ts.size,
                opacity: ts.activeTool === 'highlighter' ? 0.3 : ts.opacity,
                tool: ts.activeTool,
                isComplete: true,
                pathData: pathData
            };

            onStrokeCompleteRef.current(stroke);
        }
    }, []);

    // Native event handlers - NO POINTER CAPTURE
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const handlePointerDown = (e: PointerEvent) => {
            e.preventDefault();
            e.stopPropagation();

            const ts = toolStateRef.current;

            // Palm rejection
            if (e.pointerType === 'touch' && (e.width > 20 || e.height > 20)) return;
            if (ts.onlyPen && e.pointerType !== 'pen') return;
            if (!activePageIdRef.current) return;
            if (ts.activeTool === 'select' || ts.activeTool === 'laser') return;

            // If already drawing, commit the previous stroke first
            if (isDrawingRef.current && pointsRef.current.length > 0) {
                commitStroke();
            }

            // NO setPointerCapture - just start drawing immediately
            isDrawingRef.current = true;

            const rect = canvas.getBoundingClientRect();
            const events = e.getCoalescedEvents?.() || [e];
            pointsRef.current = [];

            for (const ev of events) {
                pointsRef.current.push({
                    x: ev.clientX - rect.left,
                    y: ev.clientY - rect.top,
                    pressure: ev.pressure
                });
            }

            if (ts.activeTool === 'eraser' && ts.eraserMode === 'whole') return;

            drawActiveStroke();
        };

        const handlePointerMove = (e: PointerEvent) => {
            // Only process if button is down (for stylus/mouse)
            if (e.buttons === 0 && e.pointerType !== 'touch') return;

            e.preventDefault();
            e.stopPropagation();

            const ts = toolStateRef.current;

            if (e.pointerType === 'touch' && (e.width > 20 || e.height > 20)) return;
            if (ts.onlyPen && e.pointerType !== 'pen') return;
            if (!isDrawingRef.current || !activePageIdRef.current) return;

            const rect = canvas.getBoundingClientRect();
            const events = e.getCoalescedEvents?.() || [e];

            for (const ev of events) {
                const pt = {
                    x: ev.clientX - rect.left,
                    y: ev.clientY - rect.top,
                    pressure: ev.pressure
                };

                if (ts.activeTool === 'eraser' && ts.eraserMode === 'whole') {
                    const eraseRadius = ts.eraserSize;
                    strokesRef.current.forEach(s => {
                        const hit = s.points.some((p, i) => i % 4 === 0 && Math.hypot(p.x - pt.x, p.y - pt.y) < eraseRadius);
                        if (hit) onDeleteStrokeRef.current(s.id);
                    });
                    continue;
                }

                pointsRef.current.push(pt);
            }

            if (ts.activeTool === 'eraser' && ts.eraserMode === 'whole') return;

            if (!rafId.current) {
                rafId.current = requestAnimationFrame(() => {
                    drawActiveStroke();
                    rafId.current = null;
                });
            }
        };

        const handlePointerUp = (e: PointerEvent) => {
            e.preventDefault();
            e.stopPropagation();

            if (!isDrawingRef.current || !activePageIdRef.current) return;

            // NO releasePointerCapture - just commit immediately
            commitStroke();
        };

        // Listen on document level for pointerup to catch strokes that end outside canvas
        const handleDocumentPointerUp = () => {
            if (isDrawingRef.current && pointsRef.current.length > 0) {
                commitStroke();
            }
        };

        canvas.addEventListener('pointerdown', handlePointerDown, { passive: false });
        canvas.addEventListener('pointermove', handlePointerMove, { passive: false });
        canvas.addEventListener('pointerup', handlePointerUp, { passive: false });
        document.addEventListener('pointerup', handleDocumentPointerUp);

        return () => {
            canvas.removeEventListener('pointerdown', handlePointerDown);
            canvas.removeEventListener('pointermove', handlePointerMove);
            canvas.removeEventListener('pointerup', handlePointerUp);
            document.removeEventListener('pointerup', handleDocumentPointerUp);
        };
    }, [drawActiveStroke, commitStroke]);

    const getCursor = () => {
        if (toolState.activeTool === 'eraser') {
            const size = toolState.eraserSize;
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 1}" fill="none" stroke="black"/></svg>`;
            return `url('data:image/svg+xml;utf8,${encodeURIComponent(svg)}') ${size / 2} ${size / 2}, auto`;
        }
        return 'crosshair';
    };

    return (
        <>
            {/* SVG layer for completed strokes */}
            <svg
                ref={svgRef}
                className="absolute inset-0 w-full h-full pointer-events-none"
                style={{ overflow: 'visible' }}
            >
                {strokes.map((stroke) => (
                    <path
                        key={stroke.id}
                        d={stroke.pathData || generateSmoothPath(stroke.points)}
                        stroke={stroke.color}
                        strokeWidth={stroke.size}
                        opacity={stroke.opacity}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                        style={{
                            mixBlendMode: stroke.tool === 'highlighter' ? 'multiply' : 'normal'
                        }}
                    />
                ))}
            </svg>

            {/* Canvas layer for active stroke only */}
            <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full touch-none select-none"
                style={{
                    cursor: getCursor(),
                    touchAction: 'none'
                }}
            />
        </>
    );
});
