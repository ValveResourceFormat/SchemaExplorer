import { createContext } from "react";

export const SearchContext = createContext<{
  search: string;
  setSearch: (value: string) => void;
}>({ search: "", setSearch: () => {} });
