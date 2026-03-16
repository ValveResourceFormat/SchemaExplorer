import React, { useContext, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { styled } from "@linaria/react";
import { SearchContext } from "./SearchContext";
import { DeclarationsContext } from "../Docs/DeclarationsContext";
import { KindIcon, IconKind } from "../KindIcon";

export function useCtrlFHook<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (ref.current && (event.ctrlKey || event.metaKey) && event.key === "f") {
        // Use default CTRL+F only when element already has focus
        if (document.activeElement !== ref.current) event.preventDefault();
        ref.current.focus();
      }
    };

    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, []);

  return ref;
}

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

const SEARCH_TAGS = [
  { tag: "module:",        icon: "field" as IconKind,         label: "Module",         description: "Filter by module name",        example: "e.g. module:client" },
  { tag: "offset:",        icon: "meta-default" as IconKind,  label: "Offset",         description: "Filter by byte offset",         example: "e.g. offset:0x1A0" },
  { tag: "metadata:",      icon: "meta-tag" as IconKind,      label: "Metadata",       description: "Filter by metadata key name",   example: "e.g. metadata:MNetworkEnable" },
  { tag: "metadatavalue:", icon: "meta-variable" as IconKind, label: "Metadata Value", description: "Filter by metadata value",      example: "e.g. metadatavalue:true" },
] as const;

function getLastWord(input: string): string {
  if (input === "" || input.endsWith(" ")) return "";
  return input.split(" ").at(-1) ?? "";
}

function shouldShowFirstLevelPopup(input: string): boolean {
  return !getLastWord(input).includes(":");
}

function filterTags(lastWord: string) {
  if (lastWord === "") return SEARCH_TAGS;
  return SEARCH_TAGS.filter(t => t.tag.startsWith(lastWord.toLowerCase()));
}

function insertTag(inputValue: string, tag: string): string {
  if (inputValue === "" || inputValue.endsWith(" ")) return inputValue + tag;
  const parts = inputValue.split(" ");
  parts[parts.length - 1] = tag;
  return parts.join(" ");
}

function getSecondLevelContext(lastWord: string): { type: "module" | "metadata"; value: string } | null {
  const lower = lastWord.toLowerCase();
  if (lower.startsWith("module:")) return { type: "module", value: lastWord.slice(7) };
  if (lower.startsWith("metadata:")) return { type: "metadata", value: lastWord.slice(9) };
  return null;
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
  &[data-active], &:hover { background: var(--group-members); }
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

const ValuePopupList = styled.div`
  max-height: 200px;
  overflow-y: auto;
`;

function ValueSuggestPopup({
  header, values, activeIndex, onSelect,
}: {
  header: string;
  values: string[];
  activeIndex: number;
  onSelect: (value: string) => void;
}) {
  return (
    <TagPopup role="listbox" aria-label={header}>
      <TagPopupHeader>{header}</TagPopupHeader>
      <ValuePopupList>
        {values.map((v, i) => (
          <TagItem
            key={v}
            role="option"
            aria-selected={i === activeIndex}
            data-active={i === activeIndex || undefined}
            onMouseDown={(e) => { e.preventDefault(); onSelect(v); }}
          >
            <TagItemName>{v}</TagItemName>
          </TagItem>
        ))}
      </ValuePopupList>
    </TagPopup>
  );
}

function SearchTagPopup({
  tags, activeIndex, onSelect,
}: {
  tags: typeof SEARCH_TAGS[number][];
  activeIndex: number;
  onSelect: (tag: string) => void;
}) {
  return (
    <TagPopup role="listbox" aria-label="Search tag suggestions">
      <TagPopupHeader>Filters</TagPopupHeader>
      {tags.map((t, i) => (
        <TagItem
          key={t.tag}
          role="option"
          aria-selected={i === activeIndex}
          data-active={i === activeIndex || undefined}
          onMouseDown={(e) => { e.preventDefault(); onSelect(t.tag); }}
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
  baseUrl,
  className,
  placeholder = "Search...",
}: {
  baseUrl: string;
  className?: string;
  placeholder?: string;
}) {
  const { search, setSearch } = useContext(SearchContext);
  const { declarations } = useContext(DeclarationsContext);
  const [inputValue, setInputValue] = useState(search);
  const [isFocused, setIsFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();
  const [, startTransition] = useTransition();
  const ownNavigateRef = useRef(false);

  // Sync from URL (back/forward navigation, clicking links)
  useEffect(() => {
    if (ownNavigateRef.current) {
      ownNavigateRef.current = false;
      return;
    }
    const urlSearch = new URLSearchParams(location.search).get("search") ?? "";
    setInputValue(urlSearch);
    startTransition(() => setSearch(urlSearch));
    // Intentionally depends only on location.search — we sync *from* the URL.
    // search/setSearch are omitted because including them would create an
    // infinite loop: setSearch triggers a navigate which changes location.search.
  }, [location.search]); // eslint-disable-line react-hooks/exhaustive-deps

  const uniqueModules = useMemo(() => {
    const set = new Set<string>();
    for (const d of declarations) set.add(d.module);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [declarations]);

  const uniqueMetadataKeys = useMemo(() => {
    const set = new Set<string>();
    for (const d of declarations) {
      for (const m of d.metadata) set.add(m.name);
      if (d.kind === "class") {
        for (const f of d.fields) for (const m of f.metadata) set.add(m.name);
      } else {
        for (const mem of d.members) for (const m of mem.metadata) set.add(m.name);
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [declarations]);

  const lastWord = getLastWord(inputValue);
  const filteredTags = filterTags(lastWord);
  const showFirstLevel = isFocused && shouldShowFirstLevelPopup(inputValue) && filteredTags.length > 0;

  const secondLevel = getSecondLevelContext(lastWord);
  const secondLevelValues = useMemo(() => {
    if (!secondLevel) return [];
    const list = secondLevel.type === "module" ? uniqueModules : uniqueMetadataKeys;
    if (secondLevel.value === "") return list;
    const lower = secondLevel.value.toLowerCase();
    return list.filter(v => v.toLowerCase().startsWith(lower));
  }, [secondLevel?.type, secondLevel?.value, uniqueModules, uniqueMetadataKeys]);
  const isExactMatch = secondLevel != null && secondLevelValues.length === 1 && secondLevelValues[0].toLowerCase() === secondLevel.value.toLowerCase();
  const showSecondLevel = isFocused && secondLevel != null && secondLevelValues.length > 0 && !isExactMatch;

  const showPopup = showFirstLevel || showSecondLevel;
  const popupLength = showFirstLevel ? filteredTags.length : secondLevelValues.length;

  const applyNewValue = (newValue: string) => {
    setInputValue(newValue);
    ownNavigateRef.current = true;
    const replace = inputValue !== "" || newValue === "";
    startTransition(() => {
      setSearch(newValue);
      navigate(newValue === "" ? baseUrl : `${baseUrl}?search=${encodeURIComponent(newValue)}`, { replace });
    });
    setActiveIndex(0);
    ref.current?.focus();
  };

  const handleTagSelect = (tag: string) => {
    applyNewValue(insertTag(inputValue, tag));
  };

  const handleValueSelect = (value: string) => {
    if (!secondLevel) return;
    const tagPrefix = secondLevel.type === "module" ? "module:" : "metadata:";
    applyNewValue(insertValue(inputValue, tagPrefix, value));
  };

  const onChange: React.ChangeEventHandler<HTMLInputElement> = ({ target: { value } }) => {
    const wasSearching = inputValue !== "";
    setInputValue(value);
    setActiveIndex(0);
    ownNavigateRef.current = true;
    // Push a history entry when starting a new search so back button works.
    // Replace while typing to avoid polluting history with every keystroke.
    const replace = wasSearching || value === "";
    startTransition(() => {
      setSearch(value);
      navigate(value === "" ? baseUrl : `${baseUrl}?search=${encodeURIComponent(value)}`, {
        replace,
      });
    });
  };

  const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (!showPopup) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, popupLength - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      if (showFirstLevel && filteredTags[activeIndex]) handleTagSelect(filteredTags[activeIndex].tag);
      else if (showSecondLevel && secondLevelValues[activeIndex]) handleValueSelect(secondLevelValues[activeIndex]);
    }
    else if (e.key === "Escape") { setIsFocused(false); }
  };

  const ref = useCtrlFHook<HTMLInputElement>();

  return (
    <SearchBoxWrapper className={className}>
      <SearchInput
        type="search"
        placeholder={placeholder}
        ref={ref}
        value={inputValue}
        onChange={onChange}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onKeyDown={onKeyDown}
        aria-label="Search"
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
          header={secondLevel.type === "module" ? "Modules" : "Metadata Keys"}
          values={secondLevelValues}
          activeIndex={activeIndex}
          onSelect={handleValueSelect}
        />
      )}
    </SearchBoxWrapper>
  );
}
