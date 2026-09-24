import React, { useContext, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useLocation, useNavigate } from "react-router";
import { buildHash } from "../../utils/filtering";
import { getConsoleStats } from "../../utils/console-filtering";
import { styled } from "@linaria/react";
import { SearchContext } from "./SearchContext";
import { DeclarationsContext, consolePath, schemaPath } from "../schema/DeclarationsContext";
import { getMetadataKeys, type GameContext } from "../../data/derived";
import { KindIcon, IconKind, ICONS_URL } from "../kind-icon/KindIcon";

export const SearchInput = styled.input`
  width: 100%;
  box-sizing: border-box;
  padding: 8px 14px;
  border: none;
  border-radius: 8px;
  background: var(--searchbox-background);
  color: var(--text);
  font-family: inherit;
  font-size: 16px;
  outline: none;
  transition: box-shadow 0.15s;

  &:hover {
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--highlight) 19%, transparent);
  }

  &:focus {
    box-shadow: 0 0 0 2px var(--highlight);
  }

  &::placeholder {
    color: var(--searchbox-placeholder);
  }
`;

export type SearchMode = "schemas" | "console";

export interface SearchTag {
  tag: string;
  icon: IconKind;
  label: string;
  description: string;
  example: string;
  /** Only shown for games that have entities */
  entities?: boolean;
}

const SEARCH_TAGS: readonly SearchTag[] = [
  {
    tag: "module:",
    icon: "field",
    label: "Module",
    description: "Filter by module name",
    example: "e.g. module:client",
  },
  {
    tag: "offset:",
    icon: "meta-default",
    label: "Offset",
    description: "Filter by byte offset",
    example: "e.g. offset:0x1A0",
  },
  {
    tag: "enumvalue:",
    icon: "enum-member",
    label: "Enum Value",
    description: "Filter by enum member value",
    example: "e.g. enumvalue:4",
  },
  {
    tag: "metadata:",
    icon: "meta-tag",
    label: "Metadata",
    description: "Filter by metadata key name",
    example: "e.g. metadata:MPropertyFriendlyName",
  },
  {
    tag: "metadatavalue:",
    icon: "meta-variable",
    label: "Metadata Value",
    description: "Filter by metadata value",
    example: "e.g. metadatavalue:true",
  },
];

const CONSOLE_SEARCH_TAGS: readonly SearchTag[] = [
  {
    tag: "module:",
    icon: "field",
    label: "Module",
    description: "Filter by declaring module",
    example: "e.g. module:server",
  },
  {
    tag: "flag:",
    icon: "meta-tag",
    label: "Flag",
    description: "Filter by flag, -flag: excludes",
    example: "e.g. flag:cheat -flag:hidden",
  },
  {
    tag: "type:",
    icon: "convar",
    label: "Type",
    description: "Filter convars by value type",
    example: "e.g. type:float32",
  },
];

export function getSearchTags(mode: SearchMode, hasEntities: boolean): readonly SearchTag[] {
  if (mode === "console") return CONSOLE_SEARCH_TAGS;
  return hasEntities ? SEARCH_TAGS : SEARCH_TAGS.filter((t) => !t.entities);
}

function getLastWord(input: string): string {
  if (input === "" || input.endsWith(" ")) return "";
  return input.split(" ").at(-1) ?? "";
}

function shouldShowFirstLevelPopup(input: string): boolean {
  if (input.endsWith(" ")) return false;
  return !getLastWord(input).includes(":");
}

/** Only console tags can be negated with a leading "-" */
function negationPrefix(word: string, mode: SearchMode): "-" | "" {
  return mode === "console" && word.startsWith("-") ? "-" : "";
}

function filterTags(tags: readonly SearchTag[], lastWord: string, mode: SearchMode) {
  if (lastWord === "") return tags;
  const lower = lastWord.toLowerCase().slice(negationPrefix(lastWord, mode).length);
  return tags.filter((t) => t.tag.includes(lower));
}

function insertTag(inputValue: string, tag: string, mode: SearchMode): string {
  if (inputValue === "" || inputValue.endsWith(" ")) return inputValue + tag;
  const parts = inputValue.split(" ");
  parts[parts.length - 1] = negationPrefix(parts[parts.length - 1], mode) + tag;
  return parts.join(" ");
}

type ValueSuggestions = {
  tag: string;
  header: string;
  values: string[];
  counts?: Map<string, number>;
};

function getSecondLevelContext(
  lastWord: string,
  suggestions: ValueSuggestions[],
  mode: SearchMode,
): { prefix: string; value: string; suggestions: ValueSuggestions } | null {
  const lower = lastWord.toLowerCase();
  const negated = negationPrefix(lower, mode);
  for (const sug of suggestions) {
    if (lower.startsWith(negated + sug.tag)) {
      return {
        prefix: negated + sug.tag,
        value: lastWord.slice(negated.length + sug.tag.length),
        suggestions: sug,
      };
    }
  }
  return null;
}

function getConsoleSuggestions(items: GameContext["consoleItems"]): ValueSuggestions[] {
  const { sorted, modules, flags, types } = getConsoleStats(items);
  return [
    { tag: "module:", header: "Modules", values: sorted.modules, counts: modules },
    { tag: "flag:", header: "Flags", values: sorted.flags, counts: flags },
    { tag: "type:", header: "Types", values: sorted.types, counts: types },
  ];
}

function insertValue(inputValue: string, tagPrefix: string, value: string): string {
  if (inputValue === "" || inputValue.endsWith(" ")) return inputValue + tagPrefix + value;
  const parts = inputValue.split(" ");
  parts[parts.length - 1] = tagPrefix + value;
  return parts.join(" ");
}

const SearchBoxWrapper = styled.div`
  position: relative;
  width: 100%;
`;

const SearchIcon = styled.svg`
  position: absolute;
  left: 12px;
  top: 50%;
  translate: 0 -50%;
  pointer-events: none;
  color: var(--searchbox-placeholder);
`;

const MainSearchInput = styled(SearchInput)`
  padding-left: 36px;
`;

const SearchPlaceholder = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 14px 0 36px;
  pointer-events: none;
  color: var(--searchbox-placeholder);
  font-size: 14px;
  font-family: inherit;
  white-space: nowrap;
  overflow: hidden;

  > span {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  kbd {
    font-family: inherit;
    font-size: 12px;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 4px;
    border: 1px solid var(--searchbox-placeholder);
    opacity: 0.6;
    line-height: 1.4;
  }
`;

const TagPopup = styled.div`
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: var(--group);
  border: 1px solid var(--group-border);
  border-radius: 8px;
  box-shadow: var(--group-shadow);
  z-index: 200;
  overflow: hidden;
`;

const TagPopupHeader = styled.div`
  padding: 6px 12px 4px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-dim);
`;

const TagItem = styled.button`
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 7px 12px;
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

const TagItemText = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex: 1;
  min-width: 0;
`;

const TagItemName = styled.span`
  font-weight: 600;
  font-size: 13px;
  font-family: monospace;
`;

const TagItemDesc = styled.span`
  font-size: 12px;
  color: var(--text-dim);
`;

const TagItemExample = styled.span`
  font-size: 11px;
  color: var(--text-dim);
  opacity: 0.6;
  font-family: monospace;
  flex-shrink: 0;
`;

const ValueCount = styled.span`
  margin-left: auto;
  font-size: 12px;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
`;

const ValuePopupList = styled.div`
  max-height: 200px;
  overflow-y: auto;
`;

const MatchHighlight = styled.span`
  background: color-mix(in srgb, var(--highlight) 25%, transparent);
  border-radius: 2px;
`;

function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <MatchHighlight>{text.slice(idx, idx + query.length)}</MatchHighlight>
      {text.slice(idx + query.length)}
    </>
  );
}

function ValueSuggestPopup({
  header,
  values,
  counts,
  activeIndex,
  onSelect,
  query,
}: {
  header: string;
  values: string[];
  counts?: Map<string, number>;
  activeIndex: number;
  onSelect: (value: string) => void;
  query: string;
}) {
  return (
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
    <TagPopup role="listbox" id="search-listbox" aria-label={header}>
      <TagPopupHeader>{header}</TagPopupHeader>
      <ValuePopupList>
        {values.map((v, i) => (
          // oxlint-disable-next-line jsx-a11y/interactive-supports-focus
          <TagItem
            key={v}
            ref={i === activeIndex ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
            aria-selected={i === activeIndex}
            data-active={i === activeIndex || undefined}
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(v);
            }}
          >
            <TagItemName>
              <HighlightMatch text={v} query={query} />
            </TagItemName>
            {counts && <ValueCount>{counts.get(v)}</ValueCount>}
          </TagItem>
        ))}
      </ValuePopupList>
    </TagPopup>
  );
}

function SearchTagPopup({
  tags,
  activeIndex,
  onSelect,
}: {
  tags: readonly SearchTag[];
  activeIndex: number;
  onSelect: (tag: string) => void;
}) {
  return (
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
    <TagPopup role="listbox" id="search-listbox" aria-label="Search tag suggestions">
      <TagPopupHeader>Filters</TagPopupHeader>
      {tags.map((t, i) => (
        // oxlint-disable-next-line jsx-a11y/interactive-supports-focus
        <TagItem
          key={t.tag}
          ref={i === activeIndex ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
          aria-selected={i === activeIndex}
          data-active={i === activeIndex || undefined}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(t.tag);
          }}
        >
          <KindIcon kind={t.icon} size="small" />
          <TagItemText>
            <TagItemName>{t.tag}</TagItemName>
            <TagItemDesc>{t.description}</TagItemDesc>
          </TagItemText>
          <TagItemExample>{t.example}</TagItemExample>
        </TagItem>
      ))}
    </TagPopup>
  );
}

export function SearchBox({
  className,
  mode = "schemas",
}: {
  className?: string;
  mode?: SearchMode;
}) {
  const { search } = useContext(SearchContext);
  const { game, declarations, entities, consoleItems } = useContext(DeclarationsContext);
  const baseUrl = mode === "console" ? consolePath(game) : schemaPath(game);
  const hasEntities = entities.length > 0;
  const tags = getSearchTags(mode, hasEntities);
  const [inputValue, setInputValue] = useState(search);
  const [isFocused, setIsFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();
  const [, startTransition] = useTransition();
  const ownNavigateRef = useRef(false);

  // Sync input value from URL (back/forward navigation, clicking links)
  useEffect(() => {
    if (ownNavigateRef.current) {
      ownNavigateRef.current = false;
      return;
    }
    const urlSearch = new URLSearchParams(location.hash.slice(1)).get("search") ?? "";
    setInputValue(urlSearch);
  }, [location.hash]);

  const valueSuggestions = useMemo((): ValueSuggestions[] => {
    if (mode === "console") return getConsoleSuggestions(consoleItems);
    const list: ValueSuggestions[] = [
      { tag: "module:", header: "Modules", values: [...declarations.keys()] },
      { tag: "metadata:", header: "Metadata Keys", values: getMetadataKeys(declarations) },
    ];
    return list;
  }, [mode, consoleItems, declarations]);

  const lastWord = getLastWord(inputValue);
  const filteredTags = filterTags(tags, lastWord, mode);
  const showFirstLevel =
    isFocused && shouldShowFirstLevelPopup(inputValue) && filteredTags.length > 0;

  const secondLevel = getSecondLevelContext(lastWord, valueSuggestions, mode);
  const secondLevelValues = useMemo(() => {
    if (!secondLevel) return [];
    const list = secondLevel.suggestions.values;
    if (secondLevel.value === "") return list;
    const lower = secondLevel.value.toLowerCase();
    return list.filter((v) => v.toLowerCase().includes(lower));
  }, [secondLevel?.suggestions, secondLevel?.value]);
  const isExactMatch =
    secondLevel != null &&
    secondLevelValues.length === 1 &&
    secondLevelValues[0].toLowerCase() === secondLevel.value.toLowerCase();
  const showSecondLevel =
    isFocused && secondLevel != null && secondLevelValues.length > 0 && !isExactMatch;

  const showPopup = showFirstLevel || showSecondLevel;
  const popupLength = showFirstLevel ? filteredTags.length : secondLevelValues.length;

  const applyNewValue = (newValue: string) => {
    setInputValue(newValue);
    ownNavigateRef.current = true;
    const replace = inputValue !== "" || newValue === "";
    // Other hash params, like the convars page kind filter, stay when searching on the same page.
    // A directly loaded prerendered page can have a trailing slash
    const samePage = location.pathname.replace(/\/$/, "") === baseUrl;
    const params = Object.fromEntries(new URLSearchParams(samePage ? location.hash.slice(1) : ""));
    startTransition(() => {
      navigate(
        { pathname: baseUrl, hash: buildHash({ ...params, name: null, search: newValue }) },
        { replace },
      );
    });
    setActiveIndex(0);
    ref.current?.focus();
  };

  const handleTagSelect = (tag: string) => {
    applyNewValue(insertTag(inputValue, tag, mode));
  };

  const handleValueSelect = (value: string) => {
    if (!secondLevel) return;
    applyNewValue(insertValue(inputValue, secondLevel.prefix, value));
  };

  const onChange: React.ChangeEventHandler<HTMLInputElement> = ({ target: { value } }) => {
    setIsFocused(true);
    applyNewValue(value);
  };

  const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (showPopup) {
        setIsFocused(false);
      } else {
        ref.current?.blur();
      }
      return;
    }
    if (!showPopup) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, popupLength - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      if (showFirstLevel && filteredTags[activeIndex])
        handleTagSelect(filteredTags[activeIndex].tag);
      else if (showSecondLevel && secondLevelValues[activeIndex])
        handleValueSelect(secondLevelValues[activeIndex]);
    }
  };

  const ref = useRef<HTMLInputElement>(null);

  // "/" focuses the search from anywhere outside an input
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      if (!(document.activeElement instanceof HTMLInputElement)) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, []);

  return (
    <SearchBoxWrapper className={className}>
      <SearchIcon width="16" height="16" aria-hidden="true">
        <use href={`${ICONS_URL}#search`} />
      </SearchIcon>
      {!inputValue && !isFocused && (
        <SearchPlaceholder>
          Type <kbd>/</kbd> <span>to search{mode === "console" && " convars and commands"}</span>
        </SearchPlaceholder>
      )}
      <MainSearchInput
        id="main-search"
        type="search"
        ref={ref}
        value={inputValue}
        onChange={onChange}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onKeyDown={onKeyDown}
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
        role="combobox"
        tabIndex={0}
        aria-label="Search"
        aria-controls={showPopup ? "search-listbox" : undefined}
        aria-autocomplete="list"
        aria-expanded={showPopup}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
      />
      {showFirstLevel && (
        <SearchTagPopup tags={filteredTags} activeIndex={activeIndex} onSelect={handleTagSelect} />
      )}
      {showSecondLevel && secondLevel && (
        <ValueSuggestPopup
          header={secondLevel.suggestions.header}
          values={secondLevelValues}
          counts={secondLevel.suggestions.counts}
          activeIndex={activeIndex}
          onSelect={handleValueSelect}
          query={secondLevel.value}
        />
      )}
    </SearchBoxWrapper>
  );
}
