import Icon from './Icon';

const TABS = [
  { id: 'mission', icon: 'explore', label: 'Mission' },
  { id: 'compass', icon: 'explore_nearby', label: 'Compass' },
  { id: 'leaderboard', icon: 'leaderboard', label: 'Leaderboard' },
];

/**
 * The "Floating Pill" navigation from DESIGN.md — a pill-shaped bar hovering
 * 16px above the safe area, dark green at 90% with a backdrop blur, active tab
 * in accent orange. Toggles the Mission screen against the two overlays.
 */
export default function BottomNav({ active, onChange }) {
  return (
    <nav className="fixed bottom-6 left-0 right-0 mx-auto z-50 flex justify-around items-center px-6 py-3 max-w-md bg-primary/90 backdrop-blur-md rounded-full shadow-ambient-lg w-[calc(100%-48px)]">
      {TABS.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            aria-label={tab.label}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onChange(tab.id)}
            className={
              isActive
                ? 'flex items-center justify-center bg-secondary text-on-secondary rounded-full w-12 h-12 shadow-md hover:scale-110 active:scale-90 transition-transform duration-200'
                : 'flex items-center justify-center text-white/70 w-12 h-12 hover:scale-110 active:scale-90 transition-transform duration-200'
            }
          >
            <Icon name={tab.icon} fill={isActive} className="text-2xl" />
          </button>
        );
      })}
    </nav>
  );
}
