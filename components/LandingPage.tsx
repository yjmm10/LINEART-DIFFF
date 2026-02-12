
import React from 'react';
import { GitBranch, Zap, Shield, History, ArrowRight, BookOpen, Github } from 'lucide-react';
import { Button } from './ui';
import { useLanguage } from '../translations';

interface LandingPageProps {
  onStart: () => void;
  onOpenAbout: () => void;
}

const FeatureCard = ({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) => (
  <div className="p-6 border-2 border-black bg-white shadow-hard hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_#18181b] transition-all duration-200">
    <div className="w-12 h-12 bg-black text-white flex items-center justify-center mb-4 rounded-sm">
      {icon}
    </div>
    <h3 className="font-bold text-lg mb-2 uppercase tracking-wide">{title}</h3>
    <p className="text-zinc-600 text-sm leading-relaxed">{desc}</p>
  </div>
);

export const LandingPage: React.FC<LandingPageProps> = ({ onStart, onOpenAbout }) => {
  const { t, lang, setLang } = useLanguage();

  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-zinc-900 flex flex-col">
      {/* Header */}
      <header className="px-6 py-4 border-b-2 border-zinc-200 bg-white flex justify-between items-center shrink-0">
        <div className="flex items-center gap-2">
          <div className="bg-black text-white p-2">
            <GitBranch size={20} />
          </div>
          <span className="font-black text-xl uppercase tracking-tighter">LineArt</span>
        </div>
        <div className="flex items-center gap-4">
          <button 
             onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}
             className="font-bold text-sm hover:underline uppercase"
          >
             {lang === 'en' ? '中文' : 'English'}
          </button>
          <Button variant="ghost" onClick={onOpenAbout} className="hidden sm:flex">
             {t('hero.about')}
          </Button>
          <a href="https://github.com" target="_blank" rel="noreferrer" className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
            <Github size={20} />
          </a>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col">
        <div className="bg-white border-b-2 border-zinc-200 relative overflow-hidden">
           {/* Abstract Line Art Background */}
           <div className="absolute inset-0 opacity-5 pointer-events-none">
              <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                 <path d="M0 100 C 20 0 50 0 100 100 Z" fill="none" stroke="black" strokeWidth="0.5" />
                 <path d="M0 0 C 50 100 80 100 100 0 Z" fill="none" stroke="black" strokeWidth="0.5" />
                 <line x1="0" y1="50" x2="100" y2="50" stroke="black" strokeWidth="0.2" />
                 <line x1="50" y1="0" x2="50" y2="100" stroke="black" strokeWidth="0.2" />
              </svg>
           </div>

           <div className="max-w-5xl mx-auto px-6 py-20 md:py-32 flex flex-col items-center text-center relative z-10">
              <div className="inline-block px-3 py-1 bg-black text-white text-xs font-bold uppercase tracking-widest mb-6">
                v2.0.0 Alpha
              </div>
              <h1 className="text-5xl md:text-7xl font-black mb-6 tracking-tight leading-tight">
                {t('hero.title')}
              </h1>
              <p className="text-lg md:text-xl text-zinc-600 max-w-2xl mb-10 leading-relaxed">
                {t('hero.subtitle')}
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                 <Button onClick={onStart} className="text-lg px-8 py-4 h-auto">
                    {t('hero.start')} <ArrowRight size={20} />
                 </Button>
                 <Button variant="secondary" onClick={onOpenAbout} className="text-lg px-8 py-4 h-auto bg-white">
                    <BookOpen size={20} /> {t('hero.about')}
                 </Button>
              </div>
           </div>
        </div>

        {/* Features Grid */}
        <div className="flex-1 bg-zinc-50 py-20 px-6">
           <div className="max-w-6xl mx-auto">
              <div className="flex items-center gap-4 mb-12">
                 <div className="h-px bg-zinc-300 flex-1"></div>
                 <h2 className="font-bold text-zinc-400 uppercase tracking-widest text-sm">{t('hero.features')}</h2>
                 <div className="h-px bg-zinc-300 flex-1"></div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                 <FeatureCard 
                    icon={<GitBranch size={24} />}
                    title={t('features.diff.title')}
                    desc={t('features.diff.desc')}
                 />
                 <FeatureCard 
                    icon={<Zap size={24} />}
                    title={t('features.format.title')}
                    desc={t('features.format.desc')}
                 />
                 <FeatureCard 
                    icon={<Shield size={24} />}
                    title={t('features.local.title')}
                    desc={t('features.local.desc')}
                 />
                 <FeatureCard 
                    icon={<History size={24} />}
                    title={t('features.snapshot.title')}
                    desc={t('features.snapshot.desc')}
                 />
              </div>
           </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t-2 border-zinc-200 bg-white py-8 px-6 text-center">
         <p className="text-zinc-400 text-sm font-bold uppercase tracking-wider">
            © {new Date().getFullYear()} LineArt JSON. Designed for Simplicity.
         </p>
      </footer>
    </div>
  );
};
