import React, { useLayoutEffect, useMemo } from "react";
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import { styled } from "@linaria/react";
import { AppContext } from "./components/AppContext";
import { SITE_ORIGIN } from "./games-list";
import ogImage from "./source2viewer.png";
import "./global.css";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Source 2 Schema Explorer" />
        <meta property="og:image" content={`${SITE_ORIGIN}${ogImage}`} />
        <meta name="theme-color" content="#63a1ff" />
        <link rel="sitemap" href="/SchemaExplorer/sitemap.xml" />
        <Meta />
        <Links />
        <script
          dangerouslySetInnerHTML={{
            __html: `var t=localStorage.getItem("theme");if(t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme:dark)").matches))document.documentElement.setAttribute("data-theme","dark")`,
          }}
        />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

function applyTheme(dark: boolean) {
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

const AppWrapper = styled.div`
  display: flex;
  flex-flow: column;
  min-height: 100dvh;
  max-width: 1440px;
  margin: 0 auto;
  background-color: var(--background);
  color: var(--text);
`;

export function HydrateFallback() {
  return null;
}

export default function Root() {
  const [darkmode, setDarkmode] = React.useState(() => {
    if (typeof window === "undefined") return false;
    const t = localStorage.getItem("theme");
    return t === "dark" || (t !== "light" && matchMedia("(prefers-color-scheme:dark)").matches);
  });

  useLayoutEffect(() => {
    applyTheme(darkmode);
  }, [darkmode]);

  const appContext = useMemo(
    () => ({
      darkmode,
      setDarkmode(dark: boolean) {
        window.localStorage.setItem("theme", dark ? "dark" : "light");
        applyTheme(dark);
        setDarkmode(dark);
      },
    }),
    [darkmode],
  );

  return (
    <AppContext.Provider value={appContext}>
      <AppWrapper>
        <Outlet />
      </AppWrapper>
    </AppContext.Provider>
  );
}
