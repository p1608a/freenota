import React from 'react';
import { PenTool } from 'lucide-react';

export const Logo: React.FC<{ className?: string }> = ({ className = "" }) => {
    return (
        <div className={`flex items-center gap-2 ${className}`}>
            <div className="bg-gradient-to-tr from-blue-600 to-purple-600 p-2 rounded-xl shadow-lg transform -rotate-12">
                <PenTool className="text-white w-6 h-6" />
            </div>
            <span className="text-2xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent tracking-tight">
                Freenota
            </span>
        </div>
    );
};
