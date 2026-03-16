import React, { useContext, useEffect, useRef, useState, useTransition } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { styled } from "@linaria/react";
import { SearchContext } from "./SearchContext";
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

function shouldShowPopup(input: string): boolean {
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

  const lastWord = getLastWord(inputValue);
  const filteredTags = filterTags(lastWord);
  const showPopup = isFocused && shouldShowPopup(inputValue) && filteredTags.length > 0;

  const handleTagSelect = (tag: string) => {
    const newValue = insertTag(inputValue, tag);
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
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, filteredTags.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" || e.key === "Tab") { if (filteredTags[activeIndex]) { e.preventDefault(); handleTagSelect(filteredTags[activeIndex].tag); } }
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
      {showPopup && (
        <SearchTagPopup tags={filteredTags} activeIndex={activeIndex} onSelect={handleTagSelect} />
      )}
    </SearchBoxWrapper>
  );
}
