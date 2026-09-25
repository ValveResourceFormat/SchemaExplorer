import { useContext } from "react";
import { styled } from "@linaria/react";
import { useLocation, useParams } from "react-router";
import { GAME_LIST, type GameId } from "../../games-list";
import { getGameContext } from "../../data/derived";
import { buildHash } from "../../utils/filtering";
import { searchForSection, type SearchMode } from "../../utils/section-search";
import { AppContext } from "../AppContext";
import { ICONS_URL, KindIcon } from "../kind-icon/KindIcon";
import { Link } from "../Link";
import {
  DeclarationsContext,
  consolePath,
  schemaPath,
  sectionPath,
} from "../schema/DeclarationsContext";
import { SearchContext } from "../search/SearchContext";
import {
  OtherSectionContext,
  SECTIONS,
  formatSectionCount,
  sectionTotal,
} from "../search/useOtherSection";
import { SidebarCount } from "./Sidebar";
import { iconButton, sidebarRow } from "./sidebar-styles";

/**
 * Brand, then where you are: the game and the section, each a list of rows. The page's own
 * list follows below it
 */
export function SidebarTop({
  section,
  count,
  onNavigate,
  sidebarOpen,
}: {
  section: SearchMode;
  count?: string;
  /** Closes the mobile drawer */
  onNavigate: () => void;
  sidebarOpen: boolean;
}) {
  return (
    <Top>
      <BrandRow>
        <Brand href="https://s2v.app/">
          <svg width="28" height="28">
            <use href={`${ICONS_URL}#s2v-logo`} />
          </svg>
          <span>Source 2 Viewer</span>
        </Brand>
        <ThemeButton />
        {sidebarOpen && (
          <IconButton onClick={onNavigate} aria-label="Close sidebar">
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </IconButton>
        )}
      </BrandRow>
      <GameRows section={section} onNavigate={onNavigate} />
      <SectionRows section={section} count={count} onNavigate={onNavigate} />
    </Top>
  );
}

function ThemeButton() {
  const { darkmode, setDarkmode } = useContext(AppContext);
  const icon = {
    viewBox: "0 0 24 24",
    width: 18,
    height: 18,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  } as const;

  return (
    <ThemeToggle
      onClick={() => setDarkmode(!darkmode)}
      title={darkmode ? "Switch to light theme" : "Switch to dark theme"}
      aria-label="Toggle dark theme"
    >
      <ThemeIcon className="moon" {...icon}>
        <path d="M12 3a6 6 0 0 0 9 9a9 9 0 1 1-9-9" />
      </ThemeIcon>
      <ThemeIcon className="sun" {...icon}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
      </ThemeIcon>
    </ThemeToggle>
  );
}

function GameRows({ section, onNavigate }: { section: SearchMode; onNavigate: () => void }) {
  const { game } = useContext(DeclarationsContext);
  const { search } = useContext(SearchContext);
  const { hash } = useLocation();
  const { module, scope } = useParams();

  // The same page in the other game where it can be. Off the console page for a game without
  // convars, only the search words schemas understand come along
  function target(gameId: GameId) {
    if (section === "schemas") return { pathname: schemaPath(gameId, module, scope), hash };
    if (getGameContext(gameId).consoleItems.length > 0) {
      return { pathname: consolePath(gameId), hash };
    }
    return {
      pathname: schemaPath(gameId),
      hash: buildHash({ search: searchForSection(search, "schemas").search }),
    };
  }

  return (
    <Group aria-label="Games">
      <GroupLabel>Game</GroupLabel>
      {GAME_LIST.map((g) => (
        <NavRow
          key={g.id}
          to={target(g.id)}
          onClick={onNavigate}
          data-current={g.id === game || undefined}
          aria-current={g.id === game ? "true" : undefined}
        >
          <svg width="16" height="16" aria-hidden="true">
            <use href={`${ICONS_URL}#game-${g.id}`} />
          </svg>
          {g.name}
        </NavRow>
      ))}
    </Group>
  );
}

function SectionRows({
  section,
  count,
  onNavigate,
}: {
  section: SearchMode;
  count?: string;
  onNavigate: () => void;
}) {
  const context = useContext(DeclarationsContext);
  const { search } = useContext(SearchContext);
  const other = useContext(OtherSectionContext)!;
  if (context.consoleItems.length === 0) return null;

  // Each section's results for the search, or all it has without one. The other section has
  // none when the search uses filters only this one has
  const countText = (mode: SearchMode) => {
    if (mode === section) return count ?? formatSectionCount(sectionTotal(context, mode));
    if (!search) return formatSectionCount(sectionTotal(context, mode));
    return other.results && formatSectionCount(other.results.items.length, mode);
  };

  // The current section goes back to its start, the other one takes the search along
  const row = (mode: SearchMode) => {
    const current = mode === section;
    const text = countText(mode);
    return (
      <NavRow
        key={mode}
        to={current ? sectionPath(context.game, mode) : other.to}
        onClick={onNavigate}
        data-current={current || undefined}
        aria-current={current ? "true" : undefined}
      >
        <KindIcon kind={SECTIONS[mode].icon} size="small" />
        {SECTIONS[mode].label}
        {text && <SidebarCount>{text}</SidebarCount>}
      </NavRow>
    );
  };

  return (
    <Group aria-label="Sections">
      <GroupLabel>Section</GroupLabel>
      {row("schemas")}
      {row("console")}
    </Group>
  );
}

const Top = styled.div`
  flex-shrink: 0;
  padding-bottom: 8px;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--row-line);
`;

const BrandRow = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  /* Centered on the navbar's search box next to it */
  height: 38px;
  margin: 4px 0 2px;
`;

const Brand = styled.a`
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  font-size: 16px;
  text-decoration: none;
  color: var(--text);
  white-space: nowrap;
`;

const IconButton = styled.button`
  ${iconButton}
`;

// Pushes itself and the close button after it to the end of the row
const ThemeToggle = styled.button`
  ${iconButton}
  margin-left: auto;
`;

// The icon follows the theme through CSS, the prerendered page can't know it
const ThemeIcon = styled.svg`
  [data-theme="dark"] &.sun,
  :root:not([data-theme="dark"]) &.moon {
    display: none;
  }
`;

const Group = styled.nav`
  display: flex;
  flex-direction: column;
`;

const GroupLabel = styled.div`
  padding: 8px 10px 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-dim);
`;

const NavRow = styled(Link)`
  ${sidebarRow}

  &[data-current] {
    font-weight: 600;
    background: var(--group);
  }
`;
