import React, { useRef, useEffect, useCallback } from 'react';
import { getStroke } from 'perfect-freehand';
import { getSvgPathFromStroke } from '../utils/ink';
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
 * CanvasLayer - High-performance drawing layer with DECOUPLED state management
 * 
 * Architecture:
 * 1. Active stroke is drawn on the canvas during pointer events
 * 2. Completed strokes are buffered locally and rendered on canvas
 * 3. Strokes are synced to React/Zustand using requestIdleCallback
 * 4. This ensures input handling is NEVER blocked by React re-renders
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
    const pointsRef = useRef<{ x: number, y: number, pressure: number }[]>([]);
    const isDrawingRef = useRef(false);
    const rafId = useRef<number | null>(null);
    const activePointerIdRef = useRef<number | null>(null);

    // LOCAL STROKE BUFFER - strokes that haven't been synced to React yet
    // These are rendered directly on canvas for instant display
    const pendingStrokesRef = useRef<Stroke[]>([]);
    const syncTimeoutRef = useRef<number | null>(null);

    // Store refs to current props for use in native event handlers
    const toolStateRef = useRef(toolState);
    const activePageIdRef = useRef(activePageId);
    const strokesRef = useRef(strokes);
    const onStrokeCompleteRef = useRef(onStrokeComplete);
    const onDeleteStrokeRef = useRef(onDeleteStroke);

    // Update refs when props change
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
                    // Re-render all strokes after resize
                    renderAllStrokes();
                }
            }
        };

        updateCanvasSize();

        const resizeObserver = new ResizeObserver(() => {
            updateCanvasSize();
        });

        if (canvasRef.current?.parentElement) {
            resizeObserver.observe(canvasRef.current.parentElement);
        }

        window.addEventListener('resize', updateCanvasSize);
        return () => {
            window.removeEventListener('resize', updateCanvasSize);
            resizeObserver.disconnect();
        };
    }, [width, height]);

    // Render ALL strokes (both synced and pending) on canvas
    const renderAllStrokes = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Render synced strokes from React state
        for (const stroke of strokesRef.current) {
            renderStrokeOnCanvas(ctx, stroke);
        }

        // Render pending strokes (not yet synced to React)
        for (const stroke of pendingStrokesRef.current) {
            renderStrokeOnCanvas(ctx, stroke);
        }
    }, []);

    // Render a single stroke on canvas
    const renderStrokeOnCanvas = (ctx: CanvasRenderingContext2D, stroke: Stroke) => {
        if (stroke.points.length === 0) return;

        const outlinePoints = getStroke(stroke.points, {
            size: stroke.size,
            thinning: stroke.tool === 'pen' ? 0.5 : 0,
            smoothing: 0.5,
            streamline: 0.5,
            simulatePressure: stroke.tool !== 'highlighter',
        });

        if (outlinePoints.length < 3) {
            // Single point - draw a dot
            if (stroke.points.length > 0) {
                ctx.beginPath();
                ctx.arc(stroke.points[0].x, stroke.points[0].y, stroke.size / 2, 0, Math.PI * 2);
                ctx.fillStyle = stroke.color;
                ctx.globalAlpha = stroke.opacity;
                ctx.fill();
            }
            return;
        }

        ctx.beginPath();
        ctx.moveTo(outlinePoints[0][0], outlinePoints[0][1]);
        for (let i = 1; i < outlinePoints.length; i++) {
            ctx.lineTo(outlinePoints[i][0], outlinePoints[i][1]);
        }
        ctx.closePath();

        ctx.fillStyle = stroke.color;
        ctx.globalAlpha = stroke.opacity;
        ctx.globalCompositeOperation = stroke.tool === 'highlighter' ? 'multiply' : 'source-over';
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
    };

    // Draw active stroke (while drawing)
    const drawActiveStroke = useCallback(() => {
        const canvas = canvasRef.current;
        const ts = toolStateRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear and redraw all existing strokes
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Render synced strokes
        for (const stroke of strokesRef.current) {
            renderStrokeOnCanvas(ctx, stroke);
        }

        // Render pending strokes
        for (const stroke of pendingStrokesRef.current) {
            renderStrokeOnCanvas(ctx, stroke);
        }

        // Draw the active stroke (currently being drawn)
        if (pointsRef.current.length === 0) return;

        // Handle single-point strokes (dots/taps)
        if (pointsRef.current.length === 1) {
            const pt = pointsRef.current[0];
            const size = ts.activeTool === 'eraser' ? ts.eraserSize : ts.size;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, size / 2, 0, Math.PI * 2);
            ctx.fillStyle = ts.activeTool === 'eraser' ? '#FFFFFF' : ts.color;
            ctx.globalAlpha = ts.activeTool === 'highlighter' ? 0.3 : ts.opacity;
            ctx.fill();
            return;
        }

        const outlinePoints = getStroke(pointsRef.current, {
            size: ts.activeTool === 'eraser' ? ts.eraserSize : ts.size,
            thinning: ts.activeTool === 'pen' ? 0.5 : 0,
            smoothing: 0.5,
            streamline: 0.5,
            simulatePressure: ts.activeTool !== 'highlighter',
        });

        if (outlinePoints.length < 3) return;

        ctx.beginPath();
        ctx.moveTo(outlinePoints[0][0], outlinePoints[0][1]);
        for (let i = 1; i < outlinePoints.length; i++) {
            ctx.lineTo(outlinePoints[i][0], outlinePoints[i][1]);
        }
        ctx.closePath();

        ctx.fillStyle = ts.activeTool === 'eraser' ? '#FFFFFF' : ts.color;
        ctx.globalAlpha = ts.activeTool === 'highlighter' ? 0.3 : ts.opacity;
        ctx.globalCompositeOperation = ts.activeTool === 'highlighter' ? 'multiply' : 'source-over';
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
    }, []);

    // Sync pending strokes to React/Zustand (called during idle time)
    const syncPendingStrokes = useCallback(() => {
        if (pendingStrokesRef.current.length === 0) return;

        // Use requestIdleCallback if available, otherwise setTimeout
        const scheduleSync = window.requestIdleCallback || ((cb: () => void) => setTimeout(cb, 16));

        scheduleSync(() => {
            const strokesToSync = [...pendingStrokesRef.current];
            pendingStrokesRef.current = [];

            for (const stroke of strokesToSync) {
                onStrokeCompleteRef.current(stroke);
            }
        });
    }, []);

    // Native event handlers
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

                // Whole Eraser Logic
                if (ts.activeTool === 'eraser' && ts.eraserMode === 'whole') {
                    const eraseRadius = ts.eraserSize;
                    // Check synced strokes
                    strokesRef.current.forEach(s => {
                        const hit = s.points.some((p, i) => i % 4 === 0 && Math.hypot(p.x - pt.x, p.y - pt.y) < eraseRadius);
                        if (hit) onDeleteStrokeRef.current(s.id);
                    });
                    // Check pending strokes
                    pendingStrokesRef.current = pendingStrokesRef.current.filter(s => {
                        const hit = s.points.some((p, i) => i % 4 === 0 && Math.hypot(p.x - pt.x, p.y - pt.y) < eraseRadius);
                        return !hit;
                    });
                    continue;
                }

                pointsRef.current.push(pt);
            }

            if (ts.activeTool === 'eraser' && ts.eraserMode === 'whole') {
                renderAllStrokes();
                return;
            }

            // Throttled Drawing
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

            // Release pointer capture FIRST
            const pointerIdToRelease = activePointerIdRef.current;
            if (pointerIdToRelease !== null) {
                try {
                    canvas.releasePointerCapture(pointerIdToRelease);
                } catch (err) {
                    // Pointer may already be released
                }
            }
            activePointerIdRef.current = null;

            if (!isDrawingRef.current || !activePageIdRef.current) return;
            isDrawingRef.current = false;

            if (rafId.current) {
                cancelAnimationFrame(rafId.current);
                rafId.current = null;
            }

            const strokePoints = [...pointsRef.current];
            pointsRef.current = [];

            if (ts.activeTool === 'eraser' && ts.eraserMode === 'whole') {
                renderAllStrokes();
                return;
            }

            // Create stroke and add to LOCAL BUFFER (not React state)
            if (strokePoints.length > 0) {
                const isEraser = ts.activeTool === 'eraser';

                // Pre-compute the SVG path data
                const outlinePoints = getStroke(strokePoints, {
                    size: isEraser ? ts.eraserSize : ts.size,
                    thinning: ts.activeTool === 'pen' ? 0.5 : 0,
                    smoothing: 0.5,
                    streamline: 0.5,
                    simulatePressure: ts.activeTool !== 'highlighter',
                });
                const pathData = getSvgPathFromStroke(outlinePoints);

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

                // Add to LOCAL buffer and render immediately
                pendingStrokesRef.current.push(stroke);
                renderAllStrokes();

                // Schedule sync to React during IDLE time
                if (syncTimeoutRef.current) {
                    clearTimeout(syncTimeoutRef.current);
                }
                syncTimeoutRef.current = window.setTimeout(() => {
                    syncPendingStrokes();
                    syncTimeoutRef.current = null;
                }, 100); // Sync after 100ms of no new strokes
            }
        };

        // Attach native event listeners
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

            if (syncTimeoutRef.current) {
                clearTimeout(syncTimeoutRef.current);
            }
        };
    }, [drawActiveStroke, renderAllStrokes, syncPendingStrokes]);

    // Re-render when strokes from React state change
    useEffect(() => {
        renderAllStrokes();
    }, [strokes, renderAllStrokes]);

    const getCursor = () => {
        if (toolState.activeTool === 'eraser') {
            const size = toolState.eraserSize;
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 1}" fill="none" stroke="black"/></svg>`;
            return `url('data:image/svg+xml;utf8,${encodeURIComponent(svg)}') ${size / 2} ${size / 2}, auto`;
        }
        return 'crosshair';
    };

    return (
        <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full touch-none select-none"
            style={{
                cursor: getCursor(),
                touchAction: 'none'
            }}
        />
    );
});
