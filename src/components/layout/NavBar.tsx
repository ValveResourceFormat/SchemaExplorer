import React from "react";
import { styled } from "@linaria/react";
import { useNavigate, useLocation, useParams } from "react-router";
import { AppContext } from "../AppContext";
import { SearchBox } from "../search/SearchBox";
import type { SearchMode } from "../../utils/section-search";
import { useDismiss } from "../useDismiss";
import { DeclarationsContext, consolePath, schemaPath } from "../schema/DeclarationsContext";
import { GAME_LIST, GameId, getGameDef } from "../../games-list";
import { getGameContext } from "../../data/derived";
import { ICONS_URL } from "../kind-icon/KindIcon";
import { Link } from "../Link";

export const NavBar = ({
  onMenuClick,
  section = "schemas",
}: {
  onMenuClick?: () => void;
  section?: SearchMode;
}) => {
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
      <SectionTabs section={section} />
      <NavBarSearchBox mode={section} />
      <NavBarThemeSwitcher />
    </NavBarContentCell>
  );
};

function SectionTabs({ section }: { section: SearchMode }) {
  const { game, consoleItems } = React.useContext(DeclarationsContext);
  if (consoleItems.length === 0) return null;

  return (
    <TabsWrapper aria-label="Sections">
      <Tab to={schemaPath(game)} {...tabState(section === "schemas")}>
        Schemas
      </Tab>
      <Tab to={consolePath(game)} {...tabState(section === "console")}>
        ConVars<TabLongLabel> &amp; Commands</TabLongLabel>
      </Tab>
    </TabsWrapper>
  );
}

// The active section, not the current page: the schemas tab links to the game's home
function tabState(active: boolean) {
  return {
    "data-active": active || undefined,
    "aria-current": active ? ("true" as const) : undefined,
  };
}

const TabsWrapper = styled.nav`
  display: flex;
  flex-shrink: 0;
  padding: 3px;
  gap: 2px;
  border-radius: 8px;
  background: var(--searchbox-background);
`;

const Tab = styled(Link)`
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  color: var(--text-dim);
  text-decoration: none;

  &:hover {
    color: var(--text);
  }

  &[data-active] {
    color: var(--text);
    background: var(--group);
    box-shadow: var(--group-shadow);
  }
`;

const TabLongLabel = styled.span`
  @media (max-width: 1024px) {
    display: none;
  }
`;

/** S2V brand link and the game switcher */
export function BrandRow({ section }: { section?: SearchMode }) {
  const { game } = React.useContext(DeclarationsContext);
  return (
    <BrandRowWrapper>
      <Brand href="https://s2v.app/">
        <S2VLogo />
        <span>Source 2 Viewer</span>
      </Brand>
      <GameSwitcher currentGame={game} section={section} />
    </BrandRowWrapper>
  );
}

const BrandRowWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`;

const Brand = styled.a`
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
  font-size: 16px;
  text-decoration: none;
  color: var(--text);
  white-space: nowrap;
`;

function GameSwitcher({
  currentGame,
  section = "schemas",
}: {
  currentGame: GameId;
  section?: SearchMode;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { module, scope } = useParams();

  const close = React.useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  const currentGameInfo = getGameDef(currentGame);

  function switchTo(gameId: GameId) {
    setOpen(false);
    if (gameId === currentGame) return;

    // Stay on the console page when the other game has convars
    const pathname =
      section === "console" && getGameContext(gameId).consoleItems.length > 0
        ? consolePath(gameId)
        : schemaPath(gameId, module, scope);
    navigate({ pathname, hash: location.hash });
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
        <SwitcherIcon>
          {currentGameInfo && (
            <svg width="24" height="24">
              <use href={`${ICONS_URL}#game-${currentGameInfo.id}`} />
            </svg>
          )}
        </SwitcherIcon>
      </SwitcherToggle>
      {open && (
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
        <SwitcherDropdown role="listbox" aria-label="Select game">
          {GAME_LIST.map((g) => (
            <SwitcherOption
              key={g.id}
              tabIndex={0}
              aria-selected={g.id === currentGame}
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
  font: inherit;
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
    flex-wrap: wrap;
    gap: 8px 14px;
  }
`;

const NavBarSearchBox = styled(SearchBox)`
  flex: 1;
  min-width: 0;

  @media (max-width: 768px) {
    order: 10;
    flex-basis: 100%;
  }
`;

const ToggleTrack = styled.label`
  display: block;
  width: 40px;
  height: 22px;
  border-radius: 11px;
  border: 1px solid var(--group-border);
  background-color: var(--group-members);
  cursor: pointer;
  position: relative;
  transition:
    border-color 0.25s,
    background-color 0.25s;
  flex-shrink: 0;

  &:hover {
    border-color: var(--text-dim);
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
  top: 0;
  left: 0;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background-color: var(--sidebar);
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.04),
    0 1px 2px rgba(0, 0, 0, 0.06);
  transition: transform 0.25s;
  overflow: hidden;

  [data-theme="dark"] & {
    transform: translateX(18px);
  }
`;

const ToggleIcon = styled.span`
  position: absolute;
  top: 3px;
  left: 3px;
  width: 14px;
  height: 14px;
  opacity: 1;
  transition: opacity 0.25s;

  &.sun {
    background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cg fill='none' stroke='%23f5a623' stroke-linecap='round' stroke-linejoin='round' stroke-width='2'%3E%3Ccircle cx='12' cy='12' r='4'/%3E%3Cpath d='M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41'/%3E%3C/g%3E%3C/svg%3E")
      no-repeat center / contain;
  }

  &.moon {
    background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='none' stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M12 3a6 6 0 0 0 9 9a9 9 0 1 1-9-9'/%3E%3C/svg%3E")
      no-repeat center / contain;
  }

  &.sun {
    opacity: 1;
  }
  &.moon {
    opacity: 0;
  }
  [data-theme="dark"] &.sun {
    opacity: 0;
  }
  [data-theme="dark"] &.moon {
    opacity: 1;
  }
`;

function S2VLogo() {
  return (
    <svg width="28" height="28">
      <use href={`${ICONS_URL}#s2v-logo`} />
    </svg>
  );
}

function NavBarThemeSwitcher() {
  const appContext = React.useContext(AppContext);

  return (
    <ToggleTrack title={appContext.darkmode ? "Switch to light theme" : "Switch to dark theme"}>
      <input
        type="checkbox"
        checked={appContext.darkmode}
        onChange={(e) => appContext.setDarkmode(e.target.checked)}
        aria-label="Dark Mode Toggle"
      />
      <ToggleThumb>
        <ToggleIcon className="sun" />
        <ToggleIcon className="moon" />
      </ToggleThumb>
    </ToggleTrack>
  );
}
