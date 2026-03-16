import React from "react";
import { styled } from "@linaria/react";
import { useNavigate, useLocation } from "react-router-dom";
import { AppContext } from "../AppContext";
import { SearchBox } from "../Search";
import { GAMES, GameId, getGame } from "../../games";

export const NavBar = ({ baseUrl, onMenuClick }: { baseUrl: string; onMenuClick?: () => void }) => {
  return (
    <NavBarContentCell>
      {onMenuClick && (
        <MenuButton onClick={onMenuClick} aria-label="Open sidebar">
          <svg
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </MenuButton>
      )}
      <NavBarSearchBox baseUrl={baseUrl} placeholder="Search... (module: or offset: to filter)" />
      <NavBarThemeSwitcher />
    </NavBarContentCell>
  );
};

export function GameSwitcher({ currentGame }: { currentGame: GameId }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  React.useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const currentGameInfo = getGame(currentGame);

  function switchTo(gameId: GameId) {
    setOpen(false);
    if (gameId === currentGame) return;

    // Preserve the path after /:game/ (module/scope) and search params
    const pathAfterGame = location.pathname.replace(/^\/[^/]+/, "");
    navigate(`/${gameId}${pathAfterGame}${location.search}`);
  }

  return (
    <SwitcherWrapper ref={ref}>
      <SwitcherToggle
        onClick={() => setOpen(!open)}
        title={currentGameInfo?.name}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <SwitcherChevron
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </SwitcherChevron>
        <SwitcherIcon>{currentGameInfo?.icon}</SwitcherIcon>
      </SwitcherToggle>
      {open && (
        <SwitcherDropdown>
          {GAMES.map((g) => (
            <SwitcherOption
              key={g.id}
              onClick={() => switchTo(g.id)}
              data-active={g.id === currentGame || undefined}
            >
              {g.icon}
              <span>{g.name}</span>
            </SwitcherOption>
          ))}
        </SwitcherDropdown>
      )}
    </SwitcherWrapper>
  );
}

const SwitcherWrapper = styled.div`
  position: relative;
  flex-shrink: 0;
`;

const SwitcherToggle = styled.button`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  margin: 0;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--text-dim);

  &:hover > span {
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--highlight) 19%, transparent);
  }
`;

const SwitcherIcon = styled.span`
  display: block;
  line-height: 0;
  border-radius: 8px;
  overflow: hidden;
  transition: box-shadow 0.15s;

  svg {
    display: block;
    width: 28px;
    height: 28px;
  }
`;

const SwitcherChevron = styled.svg`
  flex-shrink: 0;
`;

const SwitcherDropdown = styled.div`
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  background: var(--group);
  border: 1px solid var(--group-border);
  border-radius: 8px;
  box-shadow: var(--group-shadow);
  z-index: 200;
  overflow: hidden;
  min-width: 200px;
`;

const SwitcherOption = styled.button`
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 14px;
  border: none;
  background: transparent;
  color: var(--text);
  font-size: 14px;
  cursor: pointer;
  text-align: left;

  &[data-active],
  &:hover {
    background: var(--group-members);
  }
`;

const MenuButton = styled.button`
  display: none;
  background: none;
  border: none;
  padding: 4px;
  color: var(--text);
  cursor: pointer;
  flex-shrink: 0;

  @media (max-width: 768px) {
    display: flex;
    align-items: center;
  }
`;

const NavBarContentCell = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 14px 10px 24px;
  min-width: 0;
  flex-shrink: 0;
  background-color: var(--background);

  @media (max-width: 768px) {
    grid-column: 1;
    padding: 10px 14px;
  }
`;

const NavBarSearchBox = styled(SearchBox)`
  flex: 1;
  min-width: 0;
`;

const ToggleTrack = styled.label`
  display: flex;
  align-items: center;
  width: 44px;
  height: 22px;
  border-radius: 11px;
  background-color: #d1d5db;
  cursor: pointer;
  position: relative;
  transition: background-color 0.2s;
  flex-shrink: 0;

  &:has(input:checked) {
    background-color: #2a2d33;
  }

  input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }
`;

const ToggleThumb = styled.span`
  position: absolute;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background-color: #ffffff;
  transition:
    left 0.2s,
    background-color 0.2s;

  input:checked ~ & {
    left: 22px;
    background-color: #7a7f88;
  }
`;

const ToggleLabel = styled.span`
  font-size: 14px;
  user-select: none;
  position: absolute;
  line-height: 1;
`;

const ToggleLabelLeft = styled(ToggleLabel)`
  left: 5px;
`;

const ToggleLabelRight = styled(ToggleLabel)`
  right: 5px;
`;

export function S2VLogo() {
  return (
    <svg viewBox="0 0 160 160" width="28" height="28">
      <circle cx="75.25" cy="72.75" r="64.58" fill="#242a40" />
      <path
        fill="#458fff"
        d="M143.69 21.16q0 1.04-.12 2.04s-4.59 27.94-7.58 45.96c-.5 3.03-1.46 9.4-1.66 10.01v.02a7.06 7.06 0 0 1-9.48 4.27 6.8 6.8 0 0 1-4.18-6.39v-.08c0-.38.21-3.16.22-4.18a48 48 0 0 0-.25-4.82 44 44 0 0 0-1.58-8.09 45.7 45.7 0 0 0-38.68-32.5 47 47 0 0 0-5.07-.29c-.84 0-4.1.21-4.19.19a7 7 0 0 1-1.68-13.74c.46-.14 6.66-1.18 9.68-1.72 18.25-3.24 44.55-7.88 44.55-7.88a17.3 17.3 0 0 1 11.74 2.35 17.4 17.4 0 0 1 8.29 14.83Z"
      />
      <path
        fill="#385283"
        d="M132.81 87.2q-.22.88-.46 1.75a58 58 0 0 1-3.85 9.98c-.68 1.27-2.45 4.5-3.65 6.42a60 60 0 0 1-10.27 11.84s6.76 18.06 7.05 19.22q.5 1.94.5 4.05a16.6 16.6 0 0 1-16.66 16.61 16.6 16.6 0 0 1-13.92-7.56c-.37-.55-10.13-17.74-10.13-17.74q-4.34.46-8.84.26c-29.95-1.32-54.48-25.23-56.5-55.13a59.2 59.2 0 0 1 20.11-48.78 56 56 0 0 1 8.23-6.05 58 58 0 0 1 16.79-6.97 11.42 11.42 0 0 0 2.33 13.52c-4.7 1.15-12.04 3.47-18.94 10.35-9.78 9.76-16.33 23.06-14.72 38.42 2.35 22.4 20.95 40.03 43.46 40.95l.43.01a45.5 45.5 0 0 0 39.4-20.18c1.43-2.08 4.97-8.87 6.06-13.09l.08-.33a11.4 11.4 0 0 0 13.53 2.45Z"
      />
      <path
        fill="#edf3fc"
        d="M95.73 68.92q5.22 2.91 7.4 9.5a20 20 0 0 1 .33 11.94 23 23 0 0 1-6.4 10.5 29 29 0 0 1-11.44 6.71A28 28 0 0 1 72 108.65a24 24 0 0 1-11.36-5.05c-2.46-2-4.34-4.73-5.5-6.92a8 8 0 0 1-.79-1.99 7.5 7.5 0 0 1 4.93-8.87 7.3 7.3 0 0 1 7.31 1.74l.11.12c.46.47 1.38 1.88 1.46 2.02a12.4 12.4 0 0 0 5.41 4.72q3.49 1.63 7.91.21c4.42-1.42 5.04-2.47 6.5-4.66a8 8 0 0 0 .91-7.22q-.9-2.77-3.51-3.34c-1.74-.38-10.38-.46-10.94-.46-.45 0-8.67.03-11.77-.26A25 25 0 0 1 52.6 75.3q-5.1-2.91-7.08-9.41a19 19 0 0 1-.02-11.59 23 23 0 0 1 6.41-10.04q4.63-4.35 11.11-6.41c6.48-2.06 8.91-1.83 13.17-1.14a24 24 0 0 1 11.11 4.67 22 22 0 0 1 5.51 6.58 9 9 0 0 1 .82 1.92 7.16 7.16 0 0 1-4.77 8.65c-2.63.84-5.4.11-7.28-1.67l-.11-.12a18 18 0 0 1-1.46-1.96q-1.92-3-5.34-4.54-3.41-1.53-7.74-.16c-4.33 1.37-4.94 2.4-6.39 4.52a7.7 7.7 0 0 0-.98 7.02q.86 2.7 3.42 3.27c1.71.37 10.28.44 10.84.43.45 0 8.64-.05 11.74.23q4.96.45 10.17 3.36Z"
      />
      <path
        fill="#242a40"
        d="M137.85 33.08c.21.71.26 1.89-.03 2.48a2.3 2.3 0 0 1-1.44 1.23l-14.56 4.05c-4.59.83-6.59-2.59-5.54-5.66s9.05-15.2 9.55-15.77 1.03-1.54.78-2.4a3.8 3.8 0 0 0-2.08-2.54 4.6 4.6 0 0 0-3.33-.2 4.2 4.2 0 0 0-2.64 1.98 6 6 0 0 0-.72 3.12c0 .07.02.84-.02 1.14l-.01.07a3.1 3.1 0 0 1-2.11 2.47c-1.56.45-3.22-.55-3.79-2.25l-.07-.21a11.23 11.23 0 0 1 .16-4.72 10.72 10.72 0 0 1 7.53-7.41q2.76-.8 5.43-.22 2.69.57 4.71 2.38a10 10 0 0 1 2.86 4.59c.62 2.04.64 4.09-.05 5.7s-8.63 12.3-8.45 12.91l10.66-2.94c.79-.23 1.62 0 2.24.55a4 4 0 0 1 .93 1.62Z"
      />
    </svg>
  );
}

function NavBarThemeSwitcher() {
  const appContext = React.useContext(AppContext);

  return (
    <ToggleTrack>
      <input
        type="checkbox"
        checked={appContext.darkmode}
        onChange={(e) => appContext.setDarkmode(e.target.checked)}
        aria-label="Dark Mode Toggle"
      />
      <ToggleLabelLeft>{appContext.darkmode ? "\u{1F31C}" : ""}</ToggleLabelLeft>
      <ToggleLabelRight>{appContext.darkmode ? "" : "\u{1F31E}"}</ToggleLabelRight>
      <ToggleThumb />
    </ToggleTrack>
  );
}
