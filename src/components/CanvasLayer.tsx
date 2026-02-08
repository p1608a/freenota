import React, { useRef, useEffect } from 'react';
import { type Stroke, type ToolState } from '../store/noteStore';

interface CanvasLayerProps {
    activePageId: string | null;
    toolState: ToolState;
    onStrokeComplete: (stroke: Stroke) => void;
    onDeleteStroke: (strokeId: string) => void;
    getStrokes: () => Stroke[];
}

/**
 * CanvasLayer with Web Worker + OffscreenCanvas
 * 
 * This is the ultimate optimization for web-based drawing:
 * - ALL drawing happens in a Web Worker (separate thread)
 * - Main thread NEVER blocks, regardless of React re-renders
 * - OffscreenCanvas transfers rendering to worker thread
 * - Zero latency between pointer events and drawing
 */
export const CanvasLayer: React.FC<CanvasLayerProps> = React.memo(({
    activePageId,
    toolState,
    onStrokeComplete,
    onDeleteStroke,
    getStrokes
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const workerRef = useRef<Worker | null>(null);
    const isDrawingRef = useRef(false);

    const toolStateRef = useRef(toolState);
    const activePageIdRef = useRef(activePageId);
    const onStrokeCompleteRef = useRef(onStrokeComplete);
    const onDeleteStrokeRef = useRef(onDeleteStroke);
    const getStrokesRef = useRef(getStrokes);

    useEffect(() => { toolStateRef.current = toolState; }, [toolState]);
    useEffect(() => { activePageIdRef.current = activePageId; }, [activePageId]);
    useEffect(() => { onStrokeCompleteRef.current = onStrokeComplete; }, [onStrokeComplete]);
    useEffect(() => { onDeleteStrokeRef.current = onDeleteStroke; }, [onDeleteStroke]);
    useEffect(() => { getStrokesRef.current = getStrokes; }, [getStrokes]);

    // Initialize Web Worker and OffscreenCanvas
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Create worker
        const worker = new Worker(new URL('../workers/canvasWorker.ts', import.meta.url), {
            type: 'module'
        });
        workerRef.current = worker;

        // Transfer canvas control to worker
        const offscreen = canvas.transferControlToOffscreen();
        worker.postMessage({ type: 'init', data: { canvas: offscreen } }, [offscreen]);

        // Handle messages from worker
        worker.onmessage = (e) => {
            const { type, stroke } = e.data;

            if (type === 'strokeComplete') {
                onStrokeCompleteRef.current(stroke);
            }
        };

        return () => {
            worker.terminate();
            workerRef.current = null;
        };
    }, []);

    // Update canvas size
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !workerRef.current) return;

        const updateSize = () => {
            const parent = canvas.parentElement;
            if (parent) {
                const rect = parent.getBoundingClientRect();
                canvas.width = rect.width;
                canvas.height = rect.height;

                workerRef.current?.postMessage({
                    type: 'resize',
                    data: { width: rect.width, height: rect.height }
                });
            }
        };

        updateSize();

        const resizeObserver = new ResizeObserver(updateSize);
        const parent = canvas.parentElement;
        if (parent) {
            resizeObserver.observe(parent);
        }

        window.addEventListener('resize', updateSize);
        return () => {
            window.removeEventListener('resize', updateSize);
            resizeObserver.disconnect();
        };
    }, []);

    // Send tool state updates to worker
    useEffect(() => {
        if (workerRef.current) {
            workerRef.current.postMessage({
                type: 'updateToolState',
                data: { toolState }
            });
        }
    }, [toolState]);

    // Pointer event handlers - send events to worker
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

            isDrawingRef.current = true;

            const rect = canvas.getBoundingClientRect();
            const events = e.getCoalescedEvents?.() || [e];

            const point = {
                x: events[0].clientX - rect.left,
                y: events[0].clientY - rect.top,
                pressure: events[0].pressure
            };

            // Send to worker - no drawing on main thread!
            workerRef.current?.postMessage({
                type: 'pointerDown',
                data: { point }
            });
        };

        const handlePointerMove = (e: PointerEvent) => {
            if (e.buttons === 0 && e.pointerType !== 'touch') return;

            e.preventDefault();
            e.stopPropagation();

            const ts = toolStateRef.current;

            if (e.pointerType === 'touch' && (e.width > 20 || e.height > 20)) return;
            if (ts.onlyPen && e.pointerType !== 'pen') return;
            if (!isDrawingRef.current || !activePageIdRef.current) return;

            const rect = canvas.getBoundingClientRect();
            const events = e.getCoalescedEvents?.() || [e];

            const points = events.map(ev => ({
                x: ev.clientX - rect.left,
                y: ev.clientY - rect.top,
                pressure: ev.pressure
            }));

            // Handle whole eraser on main thread (needs access to strokes)
            if (ts.activeTool === 'eraser' && ts.eraserMode === 'whole') {
                const eraseRadius = ts.eraserSize;
                points.forEach(pt => {
                    getStrokesRef.current().forEach(s => {
                        const hit = s.points.some((p, i) =>
                            i % 4 === 0 && Math.hypot(p.x - pt.x, p.y - pt.y) < eraseRadius
                        );
                        if (hit) onDeleteStrokeRef.current(s.id);
                    });
                });
                return;
            }

            // Send points to worker
            workerRef.current?.postMessage({
                type: 'pointerMove',
                data: { points }
            });
        };

        const handlePointerUp = (e: PointerEvent) => {
            e.preventDefault();
            e.stopPropagation();

            if (!isDrawingRef.current || !activePageIdRef.current) return;

            isDrawingRef.current = false;

            // Tell worker to finish stroke
            workerRef.current?.postMessage({
                type: 'pointerUp',
                data: {}
            });
        };

        const handleDocumentPointerUp = () => {
            if (isDrawingRef.current) {
                isDrawingRef.current = false;
                workerRef.current?.postMessage({
                    type: 'pointerUp',
                    data: {}
                });
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
    }, []);

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
                touchAction: 'none',
                zIndex: 10
            }}
        />
    );
}, (prevProps, nextProps) => {
    return (
        prevProps.activePageId === nextProps.activePageId &&
        prevProps.toolState === nextProps.toolState
    );
});

// Export for Whiteboard to use
export function generateSmoothPath(points: { x: number, y: number, pressure?: number }[]): string {
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
