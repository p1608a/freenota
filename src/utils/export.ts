import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import type { Notebook } from "../store/noteStore";
import { getPaperDimensions, getPatternStyle } from "./canvasUtils";
import { getStroke } from "perfect-freehand";
import { getSvgPathFromStroke } from "./ink";

export const exportNotebookToPdf = async (notebook: Notebook) => {
    // 1. Create a doc
    const doc = new jsPDF({
        orientation: 'p',
        unit: 'px',
        format: 'a4',
        hotfixes: ['px_scaling']
    });
    doc.deletePage(1); // Remove default page

    // 2. Create Hidden Container
    // MUST NOT be display:none or visibility:hidden for html2canvas to render contents
    const hiddenContainer = document.createElement('div');
    hiddenContainer.style.position = 'absolute';
    hiddenContainer.style.top = '-10000px';
    hiddenContainer.style.left = '-10000px';
    hiddenContainer.style.zIndex = '-1000';
    document.body.appendChild(hiddenContainer);

    for (const page of notebook.pages) {
        // Create Page DOM
        const dims = getPaperDimensions(notebook.paperSize);
        const width = typeof dims.width === 'number' ? dims.width : 794;
        const height = typeof dims.height === 'number' ? dims.height : 1123;

        const pageDiv = document.createElement('div');
        pageDiv.style.width = `${width}px`;
        pageDiv.style.height = `${height}px`;
        pageDiv.style.backgroundColor = 'white';
        pageDiv.style.position = 'relative';
        pageDiv.style.overflow = 'hidden';

        // Apply Pattern
        const patternStyle = getPatternStyle(notebook.paperTemplate);
        Object.assign(pageDiv.style, patternStyle);

        // Create SVG
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("width", "100%");
        svg.setAttribute("height", "100%");
        svg.setAttribute("viewBox", `0 0 ${width} ${height}`); // Explicit viewBox helps

        page.strokes.forEach(stroke => {
            if (stroke.points.length < 2) return;

            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");

            const rawPoints = stroke.points.map(p => [p.x, p.y, p.pressure ?? 0.5]);
            const options = {
                size: stroke.size,
                thinning: stroke.tool === 'pen' ? 0.5 : 0,
                smoothing: 0.5,
                streamline: 0.5,
                simulatePressure: stroke.tool !== 'highlighter',
            };

            const outlinePoints = getStroke(rawPoints as any, options);
            const d = getSvgPathFromStroke(outlinePoints);

            path.setAttribute("d", d);
            path.setAttribute("fill", stroke.color);
            // Default fill-opacity is 1
            if (stroke.opacity !== undefined && stroke.opacity < 1) {
                path.setAttribute("fill-opacity", stroke.opacity.toString());
            }
            if (stroke.tool === 'highlighter') {
                path.style.mixBlendMode = 'multiply';
            }

            svg.appendChild(path);
        });

        pageDiv.appendChild(svg);
        hiddenContainer.appendChild(pageDiv);

        // 3. Render
        try {
            // Need to wait a tick for DOM to calc styles? usually synchronous append is fine, 
            // but let's be safe with html2canvas options
            const canvas = await html2canvas(pageDiv, {
                scale: 2, // Better quality
                backgroundColor: '#ffffff',
                logging: false,
                useCORS: true,
                onclone: () => {
                    // Optional: manipuluate cloned doc if needed
                }
            });

            const imgData = canvas.toDataURL('image/jpeg', 0.95); // JPEG slightly smaller than PNG

            doc.addPage([width, height], width > height ? 'l' : 'p');
            doc.addImage(imgData, 'JPEG', 0, 0, width, height);

        } catch (err) {
            console.error("Error rendering page to PDF", err);
        } finally {
            hiddenContainer.removeChild(pageDiv);
        }
    }

    document.body.removeChild(hiddenContainer);
    doc.save(`${notebook.title}.pdf`);
};
