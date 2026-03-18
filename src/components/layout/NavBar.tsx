import React from "react";
import { styled } from "@linaria/react";
import { useNavigate, useLocation, useParams } from "react-router";
import { AppContext } from "../AppContext";
import { SearchBox } from "../search/SearchBox";
import { schemaPath } from "../schema/DeclarationsContext";
import { GAME_LIST, GameId, getGameDef } from "../../games-list";
import { ICONS_URL } from "../kind-icon/KindIcon";

export const NavBar = ({ onMenuClick }: { onMenuClick?: () => void }) => {
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
      <NavBarSearchBox />
      <NavBarThemeSwitcher />
    </NavBarContentCell>
  );
};

export function GameSwitcher({ currentGame }: { currentGame: GameId }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { module, scope } = useParams();

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

  const currentGameInfo = getGameDef(currentGame);

  function switchTo(gameId: GameId) {
    setOpen(false);
    if (gameId === currentGame) return;

    navigate({
      pathname: schemaPath(gameId, module, scope),
      hash: location.hash,
    });
  }

  return (
    <SwitcherWrapper ref={ref}>
      <SwitcherToggle
        onClick={() => setOpen(!open)}
        title={currentGameInfo?.name}
        aria-expanded={open}
        aria-haspopup="menu"
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
        <SwitcherIcon>
          {currentGameInfo && (
            <svg width="24" height="24">
              <use href={`${ICONS_URL}#game-${currentGameInfo.id}`} />
            </svg>
          )}
        </SwitcherIcon>
      </SwitcherToggle>
      {open && (
        <SwitcherDropdown role="menu" aria-label="Select game">
          {GAME_LIST.map((g) => (
            <SwitcherOption
              key={g.id}
              role="menuitem"
              onClick={() => switchTo(g.id)}
              data-active={g.id === currentGame || undefined}
            >
              <svg width="24" height="24">
                <use href={`${ICONS_URL}#game-${g.id}`} />
              </svg>
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

const NavBarContentCell = styled.header`
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 0;
  min-width: 0;
  flex-shrink: 0;
  position: sticky;
  top: 0;
  z-index: 10;
  background-color: var(--background);

  @media (max-width: 768px) {
    grid-column: 1;
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

  [data-theme="dark"] & {
    background-color: #2a2d33;
  }

  .theme-icon-dark {
    display: none;
  }
  .theme-icon-light {
    display: block;
  }

  [data-theme="dark"] & .theme-icon-dark {
    display: block;
  }
  [data-theme="dark"] & .theme-icon-light {
    display: none;
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

  [data-theme="dark"] & {
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
    <svg width="28" height="28">
      <use href={`${ICONS_URL}#s2v-logo`} />
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
      <ToggleLabelLeft className="theme-icon-dark">{"\u{1F31C}"}</ToggleLabelLeft>
      <ToggleLabelRight className="theme-icon-light">{"\u{1F31E}"}</ToggleLabelRight>
      <ToggleThumb />
    </ToggleTrack>
  );
}
