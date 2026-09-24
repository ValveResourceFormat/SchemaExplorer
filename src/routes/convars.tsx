import { useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import type { MetaFunction } from "react-router";
import { isGameId, DEFAULT_GAME, getGameDef, canonicalUrl, pageMeta } from "../games-list";
import { getGameContext } from "../data/derived";
import { schemaPath } from "../components/schema/DeclarationsContext";
import ConsolePage from "../components/console/ConsolePage";
import { getConsoleStats } from "../utils/console-filtering";

export const meta: MetaFunction = ({ params }) => {
  const game = params.game && isGameId(params.game) ? params.game : null;
  const gameName = game ? getGameDef(game)!.name : null;
  // Worded like the searches for these lists, "cs2 console commands list", "cs2 cvar list"
  const title = ["Console Commands & ConVars List", gameName, "Source 2 Schema Explorer"]
    .filter(Boolean)
    .join(" - ");

  let description = "Complete lists of Source 2 console commands and convars (cvars).";
  if (game) {
    const { convars, commands } = getConsoleStats(getGameContext(game).consoleItems);
    const fmt = (n: number) => n.toLocaleString("en-US");
    description = `Complete list of all ${fmt(commands)} console commands and ${fmt(convars)} convars (cvars) in ${gameName}, including hidden and development-only ones, with default values, ranges, flags and help text.`;
  }

  return pageMeta(title, description, canonicalUrl(params.game, "convars"));
};

export default function ConvarsPage() {
  const { game: gameParam } = useParams<{ game: string }>();
  const game = gameParam && isGameId(gameParam) ? gameParam : DEFAULT_GAME;
  const context = getGameContext(game);
  const navigate = useNavigate();
  const valid = gameParam === game && context.consoleItems.length > 0;

  // Unknown games and games without convars go to the schemas page
  useEffect(() => {
    if (!valid) navigate(schemaPath(game), { replace: true });
  }, [valid, game, navigate]);

  return <ConsolePage context={context} />;
}
