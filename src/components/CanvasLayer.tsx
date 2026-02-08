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
 * Generate SVG path data using quadratic bezier curves (Amanote-style)
 * Much simpler and faster than perfect-freehand polygon calculations
 */
function generateSmoothPath(points: { x: number, y: number, pressure?: number }[]): string {
    if (points.length === 0) return '';
    if (points.length === 1) {
        return `M ${points[0].x} ${points[0].y} L ${points[0].x} ${points[0].y}`;
    }
    if (points.length === 2) {
        return `M ${points[0].x} ${points[0].y} L ${points[1].x},${points[1].y}`;
    }

    // Start at first point
    let path = `M ${points[0].x} ${points[0].y}`;

    // Use quadratic bezier curves for smooth connections
    for (let i = 1; i < points.length - 1; i++) {
        const p0 = points[i];
        const p1 = points[i + 1];
        // Midpoint between current and next point
        const midX = (p0.x + p1.x) / 2;
        const midY = (p0.y + p1.y) / 2;
        // Quadratic bezier: Q controlX,controlY endX,endY
        path += ` Q ${p0.x},${p0.y} ${midX},${midY}`;
    }

    // End at last point
    const lastPoint = points[points.length - 1];
    path += ` L ${lastPoint.x},${lastPoint.y}`;

    return path;
}

/**
 * CanvasLayer - Hybrid rendering with SVG paths (Amanote-style)
 * 
 * Key insight from Amanote: Use SVG <path> with stroke attribute and
 * quadratic bezier curves. This is MUCH faster than perfect-freehand
 * because there's no polygon calculation - just simple path building.
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
    const activePointerIdRef = useRef<number | null>(null);

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

    // Draw active stroke on canvas using simple line rendering
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

        // Draw using simple quadratic bezier curves (like Amanote)
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

            // End at last point
            const lastPoint = pointsRef.current[pointsRef.current.length - 1];
            ctx.lineTo(lastPoint.x, lastPoint.y);
            ctx.stroke();
        }

        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
    }, []);

    // Native event handlers
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const handlePointerDown = (e: PointerEvent) => {
            e.preventDefault();
            e.stopPropagation();

            const ts = toolStateRef.current;

            if (e.pointerType === 'touch' && (e.width > 20 || e.height > 20)) return;
            if (ts.onlyPen && e.pointerType !== 'pen') return;
            if (!activePageIdRef.current) return;
            if (ts.activeTool === 'select' || ts.activeTool === 'laser') return;
            if (activePointerIdRef.current !== null) return;

            canvas.setPointerCapture(e.pointerId);
            activePointerIdRef.current = e.pointerId;
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

            // Throttled drawing
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

            const ts = toolStateRef.current;

            // Release pointer capture FIRST - this is critical for fast pen lifts
            const pointerIdToRelease = activePointerIdRef.current;
            if (pointerIdToRelease !== null) {
                try {
                    canvas.releasePointerCapture(pointerIdToRelease);
                } catch (err) { }
            }
            activePointerIdRef.current = null;

            if (!isDrawingRef.current || !activePageIdRef.current) return;
            isDrawingRef.current = false;

            if (rafId.current) {
                cancelAnimationFrame(rafId.current);
                rafId.current = null;
            }

            // Clear canvas immediately - SVG will show the stroke
            const ctx = canvas.getContext('2d');
            ctx?.clearRect(0, 0, canvas.width, canvas.height);

            const strokePoints = [...pointsRef.current];
            pointsRef.current = [];

            if (ts.activeTool === 'eraser' && ts.eraserMode === 'whole') {
                return;
            }

            if (strokePoints.length > 0) {
                const isEraser = ts.activeTool === 'eraser';

                // Generate simple SVG path (Amanote-style) - much faster than getStroke
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

                // Immediate commit - no deferral needed with simple path
                onStrokeCompleteRef.current(stroke);
            }
        };

        canvas.addEventListener('pointerdown', handlePointerDown, { passive: false });
        canvas.addEventListener('pointermove', handlePointerMove, { passive: false });
        canvas.addEventListener('pointerup', handlePointerUp, { passive: false });
        canvas.addEventListener('pointerleave', handlePointerUp, { passive: false });
        canvas.addEventListener('pointercancel', handlePointerUp, { passive: false });

        return () => {
            canvas.removeEventListener('pointerdown', handlePointerDown);
            canvas.removeEventListener('pointermove', handlePointerMove);
            canvas.removeEventListener('pointerup', handlePointerUp);
            canvas.removeEventListener('pointerleave', handlePointerUp);
            canvas.removeEventListener('pointercancel', handlePointerUp);
        };
    }, [drawActiveStroke]);

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
            {/* SVG layer for completed strokes - uses stroke paths like Amanote */}
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
