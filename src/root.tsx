import React, { useLayoutEffect, useMemo } from "react";
import { flushSync } from "react-dom";
import { Links, Meta, Outlet, Scripts, ScrollRestoration, useParams } from "react-router";
import { styled } from "@linaria/react";
import { AppContext } from "./components/AppContext";
import { TooltipHost } from "./components/Tooltip";
import {
  BASE_PATH,
  SITE_NAME,
  SITE_ORIGIN,
  canonicalUrl,
  gameIdFrom,
  getGameDef,
} from "./games-list";
import { getGameContext } from "./data/derived";
import { buildComponentEmbed } from "./utils/discord-embed";
import ogImage from "./source2viewer.png";
import searchPrehydrate from "./search-prehydrate.js?url";
import "./global.css";

const OG_IMAGE_URL = SITE_ORIGIN + ogImage;
/** The browser chrome and phone status bar match the navbar, which is --background in global.css */
const THEME_COLORS = { light: "#f8f9fb", dark: "#0c131d" };

// Custom Discord link preview for declaration pages. It must be in the prerendered HTML
function DiscordComponentEmbed() {
  const { game: gameParam, module, scope } = useParams();
  const game = gameIdFrom(gameParam);
  if (!game || !module || !scope) return null;

  const decl = getGameContext(game).declarations.get(module)?.get(scope);
  if (!decl) return null;

  const json = buildComponentEmbed(decl, {
    siteName: SITE_NAME,
    gameName: getGameDef(game).name,
    url: canonicalUrl(game, module, scope),
    imageUrl: OG_IMAGE_URL,
  });

  return (
    <script
      id="discord:component-embed"
      type="application/json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content={SITE_NAME} />
        <meta property="og:image" content={OG_IMAGE_URL} />
        <meta
          name="theme-color"
          media="(prefers-color-scheme: light)"
          content={THEME_COLORS.light}
        />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content={THEME_COLORS.dark} />
        <link rel="sitemap" href="/SchemaExplorer/sitemap.xml" />
        <link
          rel="alternate"
          type="text/plain"
          href={`${BASE_PATH}/llms.txt`}
          title="Machine-readable schema data (llms.txt)"
        />
        <Meta />
        <Links />
        <DiscordComponentEmbed />
        <script
          dangerouslySetInnerHTML={{
            __html: `var t=localStorage.getItem("theme");if(t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme:dark)").matches))document.documentElement.setAttribute("data-theme","dark")`,
          }}
        />
      </head>
      <body>
        {children}
        <TooltipHost />
        <script src={searchPrehydrate} />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

function applyTheme(dark: boolean) {
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  // The theme picked on the site can differ from the system one the media queries follow
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute("content", dark ? THEME_COLORS.dark : THEME_COLORS.light);
  }
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
        const update = () => {
          applyTheme(dark);
          flushSync(() => setDarkmode(dark));
        };
        if (document.startViewTransition) document.startViewTransition(update);
        else update();
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
