import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import styled from "styled-components";
import { SearchContext } from "./SearchContext";

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

export const SearchInput = styled.input.attrs({ type: "search" })`
  width: 100%;
  box-sizing: border-box;
  padding: 8px 14px;
  border: none;
  border-radius: 8px;
  background: ${(props) => props.theme.searchbox.background};
  color: ${(props) => props.theme.text};
  font-family: inherit;
  font-size: 16px;
  outline: none;
  transition: box-shadow 0.15s;

  &:hover {
    box-shadow: 0 0 0 2px ${(props) => props.theme.highlight}30;
  }

  &:focus {
    box-shadow: 0 0 0 2px ${(props) => props.theme.highlight};
  }

  &::placeholder {
    color: ${(props) => props.theme.searchbox.placeholder};
  }
`;

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
  const navigate = useNavigate();
  const location = useLocation();
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const ownNavigateRef = useRef(false);

  // Sync from URL (back/forward navigation, clicking links)
  useEffect(() => {
    if (ownNavigateRef.current) {
      ownNavigateRef.current = false;
      return;
    }
    const urlSearch = new URLSearchParams(location.search).get("search") ?? "";
    setSearch(urlSearch);
    setInputValue(urlSearch);
    clearTimeout(timerRef.current);
    // Intentionally depends only on location.search — we sync *from* the URL.
    // search/setSearch are omitted because including them would create an
    // infinite loop: setSearch triggers a navigate which changes location.search.
  }, [location.search]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup debounce timer on unmount
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const onChange = useCallback<React.ChangeEventHandler<HTMLInputElement>>(
    ({ target: { value } }) => {
      setInputValue(value);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setSearch(value);
        ownNavigateRef.current = true;
        if (value === "") {
          navigate(baseUrl, { replace: true });
        } else {
          navigate(`${baseUrl}?search=${encodeURIComponent(value)}`, { replace: true });
        }
      }, 150);
    },
    [setSearch, navigate, baseUrl],
  );

  const ref = useCtrlFHook<HTMLInputElement>();

  return (
    <SearchInput
      className={className}
      placeholder={placeholder}
      ref={ref}
      value={inputValue}
      onChange={onChange}
      aria-label="Search"
    />
  );
}
