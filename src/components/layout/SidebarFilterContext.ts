import { createContext } from "react";

export const SidebarFilterContext = createContext<{
  filter: string;
  setFilter: (value: string) => void;
}>({ filter: "", setFilter: () => {} });
