/**
 * Canvas Web Worker - Processes ALL drawing in separate thread
 * 
 * This worker runs completely independently of the main thread,
 * ensuring that React re-renders or state updates can NEVER
 * block pointer event processing or drawing.
 */

interface Point {
    x: number;
    y: number;
    pressure: number;
}

interface ToolState {
    activeTool: 'pen' | 'pencil' | 'highlighter' | 'eraser';
    color: string;
    size: number;
    opacity: number;
    eraserSize: number;
}

let canvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
let currentPoints: Point[] = [];
let currentToolState: ToolState = {
    activeTool: 'pen',
    color: '#000000',
    size: 4,
    opacity: 1,
    eraserSize: 10
};

// Generate smooth path using quadratic bezier curves
function generateSmoothPath(points: Point[]): string {
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

// Draw active stroke on canvas
function drawActiveStroke() {
    if (!ctx || !canvas) return;
    if (currentPoints.length === 0) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const ts = currentToolState;
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

    if (currentPoints.length === 1) {
        const pt = currentPoints[0];
        ctx.arc(pt.x, pt.y, size / 2, 0, Math.PI * 2);
        ctx.fill();
    } else {
        ctx.moveTo(currentPoints[0].x, currentPoints[0].y);

        for (let i = 1; i < currentPoints.length - 1; i++) {
            const p0 = currentPoints[i];
            const p1 = currentPoints[i + 1];
            const midX = (p0.x + p1.x) / 2;
            const midY = (p0.y + p1.y) / 2;
            ctx.quadraticCurveTo(p0.x, p0.y, midX, midY);
        }

        const lastPoint = currentPoints[currentPoints.length - 1];
        ctx.lineTo(lastPoint.x, lastPoint.y);
        ctx.stroke();
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
}

// Message handler from main thread
self.onmessage = (e) => {
    const { type, data } = e.data;

    switch (type) {
        case 'init':
            // Initialize with OffscreenCanvas
            canvas = data.canvas;
            if (canvas) {
                ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                }
            }
            self.postMessage({ type: 'ready' });
            break;

        case 'resize':
            if (canvas) {
                canvas.width = data.width;
                canvas.height = data.height;
            }
            break;

        case 'updateToolState':
            currentToolState = data.toolState;
            break;

        case 'pointerDown':
            currentPoints = [data.point];
            drawActiveStroke();
            break;

        case 'pointerMove':
            if (data.points && data.points.length > 0) {
                currentPoints.push(...data.points);
                drawActiveStroke();
            }
            break;

        case 'pointerUp':
            if (currentPoints.length > 0) {
                const pathData = generateSmoothPath(currentPoints);
                const isEraser = currentToolState.activeTool === 'eraser';

                // Send completed stroke back to main thread
                self.postMessage({
                    type: 'strokeComplete',
                    stroke: {
                        id: crypto.randomUUID(),
                        points: currentPoints,
                        color: isEraser ? '#FFFFFF' : currentToolState.color,
                        size: isEraser ? currentToolState.eraserSize : currentToolState.size,
                        opacity: currentToolState.activeTool === 'highlighter' ? 0.3 : currentToolState.opacity,
                        tool: currentToolState.activeTool,
                        isComplete: true,
                        pathData: pathData
                    }
                });

                // Clear canvas and reset points
                if (ctx && canvas) {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                }
                currentPoints = [];
            }
            break;

        case 'clear':
            if (ctx && canvas) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                currentPoints = [];
            }
            break;
    }
};

export { };
