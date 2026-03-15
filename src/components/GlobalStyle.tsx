import { createGlobalStyle } from "styled-components";

export const GlobalStyle = createGlobalStyle`
    html, body, #root {
        width: 100%;
        height: 100%;
        margin: 0;
        color-scheme: ${(props) => props.theme.colorScheme};
        background-color: ${(props) => props.theme.background};
        scrollbar-gutter: stable;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif;
        font-size: 16px;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        scrollbar-color: ${(props) => props.theme.scrollbar.thumb} ${(props) => props.theme.scrollbar.track};
    }

    *, *::before, *::after {
        box-sizing: border-box;
    }

    ::selection {
        background: ${(props) => props.theme.highlight}40;
    }
`;
