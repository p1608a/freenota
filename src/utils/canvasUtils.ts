import type { PaperSize, PaperTemplate } from "../store/noteStore";

export const getPaperDimensions = (size: PaperSize) => {
    switch (size) {
        case 'a3': return { width: 1122, height: 1587 };
        case 'a4': return { width: 794, height: 1123 }; // roughly 96 DPI
        case 'a5': return { width: 559, height: 794 };
        case 'infinite': return { width: 1920, height: 1080 }; // For export, we need fixed size. 
        // TODO: Handle infinite canvas export better (maybe bound box of strokes?)
    }
};

export const getPatternStyle = (template: PaperTemplate) => {
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
