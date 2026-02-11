
import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({ children, variant = 'primary', className = '', icon, ...props }) => {
  const baseStyle = "flex items-center justify-center gap-2 px-4 py-2 font-bold transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-none focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed";
  
  const variants = {
    primary: "bg-paper text-border border-2 border-border shadow-hard hover:-translate-y-1 hover:-translate-x-1 hover:shadow-[6px_6px_0px_0px_#18181b]",
    secondary: "bg-gray-100 text-border border-2 border-border shadow-hard-sm hover:bg-gray-200",
    danger: "bg-rose-50 text-rose-900 border-2 border-rose-900 shadow-hard hover:bg-rose-100",
    ghost: "bg-transparent text-zinc-600 hover:bg-zinc-100 hover:text-black border-none shadow-none px-2"
  };

  return (
    <button className={`${baseStyle} ${variants[variant]} ${className}`} {...props}>
      {icon && <span className="w-4 h-4">{icon}</span>}
      {children}
    </button>
  );
};

export const Card: React.FC<{ children: React.ReactNode; className?: string; title?: string }> = ({ children, className = '', title }) => {
  return (
    <div className={`bg-paper border-2 border-border shadow-hard flex flex-col ${className}`}>
      {title && (
        <div className="border-b-2 border-border p-3 bg-gray-50 font-bold uppercase tracking-wider text-sm flex justify-between items-center">
          {title}
          <div className="flex gap-1">
             <div className="w-2 h-2 rounded-full border border-black bg-white"></div>
             <div className="w-2 h-2 rounded-full border border-black bg-white"></div>
          </div>
        </div>
      )}
      <div className="flex-1 overflow-hidden relative">
        {children}
      </div>
    </div>
  );
};

export const Badge: React.FC<{ type: 'added' | 'removed' | 'modified' | 'neutral' }> = ({ type }) => {
    const styles = {
        added: "bg-emerald-100 text-emerald-800 border-emerald-800",
        removed: "bg-rose-100 text-rose-800 border-rose-800",
        modified: "bg-amber-100 text-amber-800 border-amber-800",
        neutral: "bg-gray-100 text-gray-800 border-gray-800"
    };
    return (
        <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 border ${styles[type]} rounded-sm`}>
            {type}
        </span>
    );
}

// --- New Form Components ---

export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ className = '', ...props }) => (
    <input 
        className={`w-full bg-white border-2 border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:border-black focus:shadow-hard-sm transition-all ${className}`}
        {...props}
    />
);

export const Label: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
    <label className={`block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1 ${className}`}>
        {children}
    </label>
);

export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({ className = '', ...props }) => (
    <select 
        className={`w-full bg-white border-2 border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:border-black focus:shadow-hard-sm transition-all appearance-none cursor-pointer ${className}`}
        {...props}
    />
);

// --- Modal Component ---

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        }
        if (isOpen) {
            document.addEventListener('keydown', handleEsc);
            document.body.style.overflow = 'hidden';
        }
        return () => {
            document.removeEventListener('keydown', handleEsc);
            document.body.style.overflow = 'auto';
        }
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div 
                ref={ref}
                className="bg-white border-2 border-black shadow-hard w-full max-w-md animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]"
            >
                <div className="flex items-center justify-between p-4 border-b-2 border-black bg-zinc-50">
                    <h3 className="font-bold text-lg uppercase tracking-tight">{title}</h3>
                    <button onClick={onClose} className="p-1 hover:bg-rose-100 hover:text-rose-600 rounded transition-colors">
                        <X size={20} />
                    </button>
                </div>
                <div className="p-6 overflow-y-auto">
                    {children}
                </div>
            </div>
        </div>
    );
};
