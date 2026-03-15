export const themeLight = {
  colorScheme: "light",
  background: "#f8f9fb",
  highlight: "#4a8c2a",
  text: "#1a1d21",
  textDim: "#5f6672",

  sidebar: "#eceef3",
  group: "#ffffff",
  groupMembers: "#f0f1f5",
  groupShadow: "0 1px 3px #0000000a, 0 1px 2px #0000000f",
  groupSeparator: "#e0e2e8",
  groupBorder: "#e0e2e8",
  searchHighlight: "#fef9c3",

  syntax: {
    literal: "#0e7555",
    interface: "#0e7555",
    parameter: "#0a5e7a",
    nil: "#7c2d8e",
  },

  scrollbar: {
    track: "transparent",
    thumb: "#cdd0d6",
  },

  searchbox: {
    background: "#eceef3",
    placeholder: "#9ca3af",
    border: "none",
    button: "transparent",
    buttonFill: "#777c85",
    buttonFillUpdated: "#1a1d21",
  },
};

export const themeDark = {
  colorScheme: "dark",
  background: "#0c131d",
  highlight: "#6dbf3a",
  text: "#e4e6ea",
  textDim: "#8b909a",

  sidebar: "#090e15",
  group: "#181a21",
  groupMembers: "#1e2028",
  groupShadow: "0 1px 3px #00000033, 0 1px 2px #00000044",
  groupSeparator: "#262930",
  groupBorder: "#262930",
  searchHighlight: "#6dbf3a20",

  syntax: {
    literal: "#5ee6b8",
    interface: "#5ee6b8",
    parameter: "#7dcfed",
    nil: "#d4a0f7",
  },

  scrollbar: {
    track: "transparent",
    thumb: "#363a42",
  },

  searchbox: {
    background: "#090e15",
    placeholder: "#6b7280",
    border: "none",
    button: "transparent",
    buttonFill: "#8b909a",
    buttonFillUpdated: "#e4e6ea",
  },
};

export type Theme = typeof themeLight;
