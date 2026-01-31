'use client';

interface StillWatchingModalProps {
  isOpen: boolean;
  onContinue: () => void;
  onStay: () => void;
  showTitle: string;
  season: number;
  episode: number;
}

export default function StillWatchingModal({ 
  isOpen, 
  onContinue, 
  onStay, 
  showTitle, 
  season, 
  episode 
}: StillWatchingModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm">
      <div className="bg-netflix-dark border border-netflix-gray w-full max-w-md mx-4 overflow-hidden shadow-2xl ring-1 ring-white/10 animate-slide-in rounded-xl">
        <div className="p-8">
          <h2 className="text-2xl font-bold mb-4 text-white">Are you still watching?</h2>
          <p className="text-netflix-gray mb-6">
            {showTitle} - Season {season}, Episode {episode}
          </p>
          
          <div className="flex gap-4">
            <button
              onClick={onContinue}
              className="flex-1 bg-netflix-red hover:bg-red-600 text-white px-6 py-3 font-semibold transition-all duration-300 rounded-lg shadow-lg shadow-netflix-red/50 hover:shadow-xl hover:shadow-netflix-red/70 hover:-translate-y-1"
            >
              Continue Watching
            </button>
            <button
              onClick={onStay}
              className="flex-1 bg-netflix-dark/80 hover:bg-netflix-dark border border-netflix-gray hover:border-netflix-light text-netflix-light px-6 py-3 font-semibold transition-all duration-300 rounded-lg shadow-md hover:shadow-lg hover:-translate-y-0.5"
            >
              Stay
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

