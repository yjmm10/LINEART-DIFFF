import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({ children, variant = 'primary', className = '', icon, ...props }) => {
  const baseStyle = "flex items-center justify-center gap-2 px-4 py-2 font-bold border-2 border-border transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-none focus:outline-none";
  
  const variants = {
    primary: "bg-paper text-border shadow-hard hover:-translate-y-1 hover:-translate-x-1 hover:shadow-[6px_6px_0px_0px_#18181b]",
    secondary: "bg-gray-100 text-border shadow-hard-sm hover:bg-gray-200",
    danger: "bg-red-100 text-red-900 border-red-900 shadow-hard hover:bg-red-200"
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
