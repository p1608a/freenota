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
 * CanvasLayer - High-performance drawing layer using NATIVE DOM events
 * 
 * Key insight: React synthetic events add latency that can cause dropped strokes
 * during rapid pen input. By using native addEventListener directly on the canvas,
 * we ensure the browser processes pointer events with minimal delay.
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

    const drawActiveStroke = useCallback(() => {
        const canvas = canvasRef.current;
        const ts = toolStateRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

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

        if (pointsRef.current.length < 2) return;

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

        if (ts.activeTool === 'highlighter') {
            ctx.globalCompositeOperation = 'multiply';
        } else {
            ctx.globalCompositeOperation = 'source-over';
        }

        ctx.fill();
    }, []);

    // ============================================================
    // NATIVE EVENT HANDLERS - Attached via addEventListener
    // This bypasses React's synthetic event system for lower latency
    // ============================================================

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const handlePointerDown = (e: PointerEvent) => {
            e.preventDefault();
            e.stopPropagation();

            const ts = toolStateRef.current;

            // Palm rejection: ignore large touch areas
            if (e.pointerType === 'touch' && (e.width > 20 || e.height > 20)) {
                return;
            }

            // Pen Only Mode logic
            if (ts.onlyPen && e.pointerType !== 'pen') return;

            if (!activePageIdRef.current) return;
            if (ts.activeTool === 'select' || ts.activeTool === 'laser') return;

            // If we're already tracking a pointer, ignore new pointerdown events
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
                    strokesRef.current.forEach(s => {
                        const hit = s.points.some((p, i) => i % 4 === 0 && Math.hypot(p.x - pt.x, p.y - pt.y) < eraseRadius);
                        if (hit) onDeleteStrokeRef.current(s.id);
                    });
                    continue;
                }

                pointsRef.current.push(pt);
            }

            if (ts.activeTool === 'eraser' && ts.eraserMode === 'whole') return;

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

            // CRITICAL: Release pointer capture FIRST
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

            // Clear canvas immediately
            const ctx = canvas.getContext('2d');
            ctx?.clearRect(0, 0, canvas.width, canvas.height);

            // Capture points before clearing
            const strokePoints = [...pointsRef.current];
            pointsRef.current = [];

            if (ts.activeTool === 'eraser' && ts.eraserMode === 'whole') {
                return;
            }

            // Commit stroke - no setTimeout needed with native events
            if (strokePoints.length > 0) {
                const isEraser = ts.activeTool === 'eraser';

                // Pre-compute the SVG path data so rendering is instant
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
                    pathData: pathData // Pre-computed for instant SVG rendering
                };
                onStrokeCompleteRef.current(stroke);
            }
        };

        // Attach native event listeners with { passive: false } for preventDefault to work
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
        <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full touch-none select-none"
            style={{
                cursor: getCursor(),
                touchAction: 'none'
            }}
        // No React event handlers - we use native addEventListener above
        />
    );
});
