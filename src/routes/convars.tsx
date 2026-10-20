import { useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import type { MetaFunction } from "react-router";
import { DEFAULT_GAME, gameIdFrom, getGameDef, canonicalUrl, pageMeta } from "../games-list";
import { getGameContext } from "../data/derived";
import { schemaPath } from "../components/schema/DeclarationsContext";
import ConsolePage from "../components/console/ConsolePage";
import { consoleCountsText, getConsoleStats } from "../utils/console-filtering";

export const meta: MetaFunction = ({ params }) => {
  const game = gameIdFrom(params.game);
  // Worded like the searches for these lists, "cs2 console commands list", "cs2 cvar list"
  let title = "Console Commands & ConVars List - Source 2 Schema Explorer";
  let description = "Complete lists of Source 2 console commands and convars (cvars).";
  if (game) {
    const gameName = getGameDef(game).name;
    const { metadata, consoleItems } = getGameContext(game);
    title = `${gameName} Console Commands & ConVars – Full List`;
    if (metadata.versionDate) title += ` (${metadata.versionDate})`;
    const counts = consoleCountsText(getConsoleStats(consoleItems));
    description = `Complete list of all ${counts} (cvars) in ${gameName}, including hidden and development-only ones, with default values, ranges, flags and help text.`;
  }

  return pageMeta(title, description, canonicalUrl(params.game, "convars"));
};

export default function ConvarsPage() {
  const { game: gameParam } = useParams<{ game: string }>();
  const game = gameIdFrom(gameParam) ?? DEFAULT_GAME;
  const context = getGameContext(game);
  const navigate = useNavigate();
  const valid = gameParam === game && context.consoleItems.length > 0;

  // Unknown games and games without convars go to the schemas page
  useEffect(() => {
    if (!valid) navigate(schemaPath(game), { replace: true });
  }, [valid, game, navigate]);

  return <ConsolePage context={context} />;
}
