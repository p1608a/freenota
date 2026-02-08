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
 * CanvasLayer - Maximum performance drawing with DOUBLE BUFFERING
 * 
 * Architecture:
 * - Offscreen canvas stores ALL completed strokes as a single baked image
 * - Main canvas only draws: offscreen image + current active stroke
 * - When stroke completes, it's "baked" into offscreen canvas (one draw operation)
 * - This means we NEVER re-render old strokes, achieving zero-latency input
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

    // OFFSCREEN CANVAS - stores all completed strokes as a baked image
    const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);

    const pointsRef = useRef<{ x: number, y: number, pressure: number }[]>([]);
    const isDrawingRef = useRef(false);
    const rafId = useRef<number | null>(null);
    const activePointerIdRef = useRef<number | null>(null);

    // Track which strokes have been baked into offscreen canvas
    const bakedStrokeIdsRef = useRef<Set<string>>(new Set());

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

    // Initialize offscreen canvas and handle resizing
    useEffect(() => {
        const updateCanvasSize = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;

            const parent = canvas.parentElement;
            if (!parent) return;

            const rect = parent.getBoundingClientRect();
            const newWidth = rect.width;
            const newHeight = rect.height;

            // Create or resize offscreen canvas
            if (!offscreenCanvasRef.current) {
                offscreenCanvasRef.current = document.createElement('canvas');
            }

            const offscreen = offscreenCanvasRef.current;

            // If size changed, we need to re-bake all strokes
            if (canvas.width !== newWidth || canvas.height !== newHeight) {
                canvas.width = newWidth;
                canvas.height = newHeight;
                offscreen.width = newWidth;
                offscreen.height = newHeight;

                // Reset baked strokes - they'll be re-baked on next render
                bakedStrokeIdsRef.current.clear();
                rebakeAllStrokes();
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

    // Bake a single stroke onto the offscreen canvas
    const bakeStroke = useCallback((stroke: Stroke) => {
        const offscreen = offscreenCanvasRef.current;
        if (!offscreen) return;

        const ctx = offscreen.getContext('2d');
        if (!ctx) return;

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
                ctx.globalCompositeOperation = stroke.tool === 'highlighter' ? 'multiply' : 'source-over';
                ctx.fill();
                ctx.globalCompositeOperation = 'source-over';
                ctx.globalAlpha = 1;
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

        bakedStrokeIdsRef.current.add(stroke.id);
    }, []);

    // Rebake all strokes (used after resize or stroke deletion)
    const rebakeAllStrokes = useCallback(() => {
        const offscreen = offscreenCanvasRef.current;
        if (!offscreen) return;

        const ctx = offscreen.getContext('2d');
        if (!ctx) return;

        // Clear offscreen canvas
        ctx.clearRect(0, 0, offscreen.width, offscreen.height);
        bakedStrokeIdsRef.current.clear();

        // Bake all strokes from React state
        for (const stroke of strokesRef.current) {
            bakeStroke(stroke);
        }

        // Render to main canvas
        renderToMainCanvas();
    }, [bakeStroke]);

    // Render offscreen buffer + active stroke to main canvas
    const renderToMainCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        const offscreen = offscreenCanvasRef.current;
        if (!canvas || !offscreen) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear main canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw offscreen buffer (all completed strokes)
        ctx.drawImage(offscreen, 0, 0);
    }, []);

    // Draw active stroke on main canvas (on top of offscreen buffer)
    const drawActiveStroke = useCallback(() => {
        const canvas = canvasRef.current;
        const offscreen = offscreenCanvasRef.current;
        const ts = toolStateRef.current;
        if (!canvas || !offscreen) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear and draw offscreen buffer
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(offscreen, 0, 0);

        // Draw active stroke on top
        if (pointsRef.current.length === 0) return;

        if (pointsRef.current.length === 1) {
            const pt = pointsRef.current[0];
            const size = ts.activeTool === 'eraser' ? ts.eraserSize : ts.size;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, size / 2, 0, Math.PI * 2);
            ctx.fillStyle = ts.activeTool === 'eraser' ? '#FFFFFF' : ts.color;
            ctx.globalAlpha = ts.activeTool === 'highlighter' ? 0.3 : ts.opacity;
            ctx.fill();
            ctx.globalAlpha = 1;
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

    // When strokes from React change, sync any new ones to offscreen canvas
    useEffect(() => {
        const offscreen = offscreenCanvasRef.current;
        if (!offscreen) return;

        // Check for deletions - if a baked stroke is no longer in strokes array, rebake all
        const currentStrokeIds = new Set(strokes.map(s => s.id));
        let needsRebake = false;

        for (const bakedId of bakedStrokeIdsRef.current) {
            if (!currentStrokeIds.has(bakedId)) {
                needsRebake = true;
                break;
            }
        }

        if (needsRebake) {
            rebakeAllStrokes();
        } else {
            // Just bake any new strokes
            for (const stroke of strokes) {
                if (!bakedStrokeIdsRef.current.has(stroke.id)) {
                    bakeStroke(stroke);
                }
            }
            renderToMainCanvas();
        }
    }, [strokes, bakeStroke, rebakeAllStrokes, renderToMainCanvas]);

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

            // Release pointer capture FIRST
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

            const strokePoints = [...pointsRef.current];
            pointsRef.current = [];

            if (ts.activeTool === 'eraser' && ts.eraserMode === 'whole') {
                renderToMainCanvas();
                return;
            }

            if (strokePoints.length > 0) {
                const isEraser = ts.activeTool === 'eraser';

                // Pre-compute pathData
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

                // IMMEDIATE: Bake stroke to offscreen canvas (one draw operation)
                bakeStroke(stroke);

                // Render to main canvas (just one drawImage call)
                renderToMainCanvas();

                // Defer sync to React
                setTimeout(() => {
                    onStrokeCompleteRef.current(stroke);
                }, 0);
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
    }, [drawActiveStroke, bakeStroke, renderToMainCanvas]);

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
