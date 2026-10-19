import { useMemo } from "react";
import type { ConsoleMatch } from "../../utils/console-filtering";
import { fieldRowKey, nameRowKey } from "../../utils/result-rows";
import type { SectionItems } from "../../utils/section-search";
import { KindIcon } from "../kind-icon/KindIcon";
import { ResultsHeading } from "../layout/Content";
import { FieldRowView, NameRowView, OtherSectionHeading, OtherSectionHint } from "./ResultRows";
import { SECTIONS, useBetterMatches } from "./useOtherSection";

/**
 * Above the ConVars page's results, the schemas that match the search better, like the
 * CBaseEntity class when searching for baseentity. Without results of its own, a link to the
 * schemas when they have any
 */
export function OtherSectionMatches({ own }: { own: readonly ConsoleMatch[] }) {
  const items = useMemo<SectionItems>(() => ({ section: "console", items: own }), [own]);
  const matches = useBetterMatches(items);
  if (!matches || matches.better.section !== "schemas") return null;

  const { names, fields } = matches.better;
  const shown = names.length + fields.length;
  if (shown === 0) {
    if (own.length > 0) return null;
    return <OtherSectionHint total={matches.count} />;
  }

  return (
    <>
      <OtherSectionHeading total={matches.count} shown={shown} />
      {names.map((row, i) => (
        <NameRowView
          key={nameRowKey(row.hit)}
          hit={row.hit}
          paired={row.paired}
          first={i === 0}
          last={i === shown - 1}
        />
      ))}
      {fields.map((row, i) => (
        <FieldRowView
          key={fieldRowKey(row.hit)}
          row={row}
          first={names.length + i === 0}
          last={names.length + i === shown - 1}
        />
      ))}
      {own.length > 0 && (
        <ResultsHeading>
          <KindIcon kind={SECTIONS.console.icon} />
          {SECTIONS.console.label}
        </ResultsHeading>
      )}
    </>
  );
}
