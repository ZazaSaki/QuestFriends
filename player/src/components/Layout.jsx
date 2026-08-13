import Icon from './Icon';
import BottomNav from './BottomNav';

/**
 * The mobile container shell: TopAppBar + scrolling canvas + the floating pill
 * nav. `pb-32` keeps the last card clear of the pill, exactly as every Stitch
 * screen's <body> does.
 */
export default function Layout({
  children,
  activeTab,
  onTabChange,
  showNav = true,
  connected,
  teamName,
  onAccount,
}) {
  return (
    <div className="min-h-[100dvh] flex flex-col pb-32">
      <header className="flex justify-between items-center px-container-margin py-4 w-full bg-surface dark:bg-primary-container shadow-md sticky top-0 z-40 transition-colors">
        <div className="flex items-center gap-2 text-on-surface-variant dark:text-on-primary-fixed-variant">
          {/* Connection lamp — replaces the decorative menu button, since the
              one thing a player in a forest actually needs is signal state. */}
          <span
            className={`w-2 h-2 rounded-full ${connected ? 'bg-[#d97736] pulse-dot' : 'bg-outline/50'}`}
            title={connected ? 'Connected' : 'Offline'}
          />
          <span className="font-label-sm text-label-sm uppercase">
            {connected ? 'Live' : 'Offline'}
          </span>
        </div>

        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-primary dark:text-primary-fixed italic">
          EJAS26
        </h1>

        <button
          type="button"
          aria-label="Account"
          onClick={onAccount}
          className="flex items-center justify-center p-2 rounded-full hover:bg-surface-variant dark:hover:bg-primary/40 transition-colors text-on-surface-variant dark:text-on-primary-fixed-variant"
          title={teamName ? `Team ${teamName}` : 'Account'}
        >
          <Icon name="account_circle" />
        </button>
      </header>

      <main className="flex-grow w-full">{children}</main>

      {showNav && <BottomNav active={activeTab} onChange={onTabChange} />}
    </div>
  );
}
