import React, { useRef, useEffect } from 'react';
import { getStroke } from 'perfect-freehand';
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

    // Initial canvas setup and resize handling
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

        // Initial sizing
        updateCanvasSize();

        // Resize observer for more robust resizing
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
        e.preventDefault(); // Critical: Prevent browser default behaviors
        e.stopPropagation();

        // Palm rejection: ignore large touch areas
        const nativeEvent = e.nativeEvent as PointerEvent;
        if (e.pointerType === 'touch' && (nativeEvent.width > 20 || nativeEvent.height > 20)) {
            return;
        }

        // Pen Only Mode logic
        if (toolState.onlyPen && e.pointerType !== 'pen') return;

        if (!activePageId) return;
        if (toolState.activeTool === 'select' || toolState.activeTool === 'laser') return;

        (e.target as Element).setPointerCapture(e.pointerId);
        isDrawingRef.current = true;

        if (canvasRef.current) {
            const rect = canvasRef.current.getBoundingClientRect();
            // Process coalesced events
            const events = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() || [e.nativeEvent];
            pointsRef.current = [];

            for (const ev of events) {
                pointsRef.current.push({
                    x: ev.clientX - rect.left,
                    y: ev.clientY - rect.top,
                    pressure: ev.pressure
                });
            }
        }


        if (toolState.activeTool === 'eraser' && toolState.eraserMode === 'whole') return;

        // Immediate draw for responsiveness
        drawActiveStroke();
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const nativeEvent = e.nativeEvent as PointerEvent;
        if (e.pointerType === 'touch' && (nativeEvent.width > 20 || nativeEvent.height > 20)) return;
        if (toolState.onlyPen && e.pointerType !== 'pen') return;

        if (!isDrawingRef.current || !activePageId || !canvasRef.current) return;

        const rect = canvasRef.current.getBoundingClientRect();
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
                // Check against existing strokes (passed via props)
                strokes.forEach(s => {
                    const hit = s.points.some((p, i) => i % 4 === 0 && Math.hypot(p.x - pt.x, p.y - pt.y) < eraseRadius);
                    if (hit) onDeleteStroke(s.id);
                });
                continue;
            }

            pointsRef.current.push(pt);
        }

        if (toolState.activeTool === 'eraser' && toolState.eraserMode === 'whole') return;

        // Throttled Drawing
        if (!rafId.current) {
            rafId.current = requestAnimationFrame(() => {
                drawActiveStroke();
                rafId.current = null;
            });
        }
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (!isDrawingRef.current || !activePageId) return;
        isDrawingRef.current = false;

        if (rafId.current) {
            cancelAnimationFrame(rafId.current);
            rafId.current = null;
        }

        if (toolState.activeTool === 'eraser' && toolState.eraserMode === 'whole') {
            pointsRef.current = [];
            return;
        }

        // Commit stroke
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
            onStrokeComplete(stroke);
        }

        // Clear canvas
        if (canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d');
            ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
        pointsRef.current = [];
    };

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
                touchAction: 'none' // double insurance
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onPointerCancel={handlePointerUp}
        />
    );
});
