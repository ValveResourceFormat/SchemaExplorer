import { memo, useContext } from "react";
import { styled } from "@linaria/react";
import type { Declaration, SchemaEnumMember } from "../../data/types";
import { declarationKey } from "../../data/derived";
import { formatEnumHex } from "../../utils/format";
import type { ConsoleMatch } from "../../utils/console-filtering";
import {
  itemName,
  type FieldHit,
  type FuzzyHit,
  type InheritedSide,
  type MemberHit,
  type NameHit,
  type SearchRow,
} from "../../utils/search-types";
import {
  formatRowOffsets,
  hitDesignNames,
  hitWhy,
  matchedRanges,
  rowDeclarations,
  SECTION_LABELS,
  type SectionId,
  type SectionRow,
} from "../../utils/result-rows";
import { hover } from "../interaction-styles";
import { Link } from "../Link";
import { KindIcon, ModuleIcon, UiIcon } from "../kind-icon/KindIcon";
import { moduleLabel } from "../../data/modules";
import { ResultsHeading, TextMessage } from "../layout/Content";
import { ConsoleRow } from "../console/ConsoleRow";
import { useConsoleRowLinks } from "../console/ConsoleRowsCard";
import { ColoredSyntax } from "../schema/ColoredSyntax";
import { DeclarationsContext, fieldLink, schemaPath } from "../schema/DeclarationsContext";
import { DesignNamePill, DesignNamePills } from "../schema/EntitySections";
import { highlightLink } from "../schema/link-styles";
import { SchemaTypeView } from "../schema/SchemaType";
import { AnchorName, Dim, Pill, PillLink } from "../schema/styles";
import { HighlightRanges } from "./Highlight";
import { ShowAllButton } from "./ShowAllButton";
import { OtherSectionContext, SECTIONS } from "./useOtherSection";

/** Where a row is in the card the rows of its section make up, which rounds the card's corners */
interface RowState {
  first?: boolean;
  last?: boolean;
}

/** The edges of a row in the card its section makes up */
const cardRowStyles = `
  background: var(--group);
  border: solid var(--group-border);
  border-width: 0 1px 1px;
  border-bottom-color: var(--row-line);
  min-width: 0;
  overflow-wrap: anywhere;

  &[data-first] {
    border-top-width: 1px;
    border-radius: 10px 10px 0 0;
  }

  &[data-last] {
    border-bottom-color: var(--group-border);
    border-radius: 0 0 10px 10px;
  }

  &[data-first][data-last] {
    border-radius: 10px;
  }
`;

const ItemRow = styled.div`
  padding: 6px 12px;
  ${cardRowStyles}

  ${hover("background: var(--row-hover);")}
`;

/** Holds a convar row, which brings its own padding and hover */
const ConsoleFrame = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;
  overflow: hidden;
  ${cardRowStyles}
`;

/** The attributes of a row that mark its place in the card */
function rowState({ first, last }: RowState) {
  return { "data-first": first || undefined, "data-last": last || undefined };
}

const Line = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 8px;
  min-width: 0;
  min-height: 22px;
`;

const NameText = styled.span`
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 15px;
`;

/** The end of a class or enum row: why it matched and its modules, on the right */
const NameEnd = styled.span`
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  margin-left: auto;
`;

/** Why the row matched when its name doesn't say, on the right */
const Why = styled.span`
  margin-left: auto;
  min-width: 0;
  font-size: 13px;
  color: var(--text-dim);
  text-align: right;
`;

/** The entity names a field row matched and why else it matched, on a line under its columns */
const Notes = styled.div`
  grid-column: 1 / -1;
  flex: 0 0 100%;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  min-width: 0;
  font-size: 13px;
  color: var(--text-dim);
`;

const Cell = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px 8px;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: 14px;
`;

/**
 * The same width in every row, so their columns line up. It fits the pills of a client and a
 * server class and most single modules. A longer module name is cut short
 */
const moduleColumnWidth = "10.5rem";

const FieldGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1.4fr) minmax(0, 1fr) ${moduleColumnWidth};
  gap: 2px 16px;
  align-items: center;
  min-height: 22px;

  /* The field goes on the first line, the class, the type and its modules wrap on the second */
  @media (max-width: 768px) {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 8px;
  }
`;

/** The class takes one line. A long name is cut short */
const ClassCell = styled(Cell)`
  flex-wrap: nowrap;
  grid-column: 1;
  grid-row: 1;

  > svg {
    flex-shrink: 0;
  }

  @media (max-width: 768px) {
    display: contents;
    font-size: 13px;
    color: var(--text-dim);
  }
`;

const ClassLink = styled(AnchorName)`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  @media (max-width: 768px) {
    overflow: visible;
    white-space: normal;
  }
`;

const ModuleCell = styled.span`
  grid-column: 4;
  grid-row: 1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex: none;
  width: ${moduleColumnWidth};

  /* A pill narrower than its module name cuts the name short */
  > a {
    min-width: 0;
  }

  @media (max-width: 768px) {
    display: contents;
  }
`;

const ModuleName = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
`;

/** A long name wraps next to its icon */
const FieldCell = styled(Cell)`
  flex-wrap: nowrap;
  grid-column: 2;
  grid-row: 1;
  font-weight: 600;

  > svg {
    flex-shrink: 0;
  }

  > a {
    min-width: 0;
  }

  @media (max-width: 768px) {
    flex: 0 0 100%;
  }
`;

const TypeCell = styled(Cell)`
  grid-column: 3;
  grid-row: 1;
  gap: 0 8px;

  @media (max-width: 768px) {
    display: contents;
    font-size: 13px;
    color: var(--text-dim);
  }
`;

const OffsetText = styled.span`
  margin-left: auto;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
`;

/** A section heading, which has more room above than the heading of another game's results */
const Heading = styled(ResultsHeading)`
  padding-top: 16px;
`;

function SectionIcon({ id }: { id: SectionId }) {
  switch (id) {
    case "names":
      return <KindIcon kind="class" />;
    case "fields":
      return <KindIcon kind="field" />;
    case "inherited":
      return <KindIcon kind="inherited-class" />;
    case "similar":
      return <UiIcon name="search" />;
  }
}

/**
 * The heading of a fields table, over its class column, with the names of the other columns over
 * them on the same line
 */
const TableHeading = styled(FieldGrid)`
  padding: 16px 13px 4px;
  color: var(--text-dim);
`;

const TableTitle = styled.span`
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 15px;
`;

const ColumnHead = styled.span`
  font-size: 12px;

  @media (max-width: 768px) {
    display: none;
  }
`;

export const SectionHeader = memo(function SectionHeader({ section }: { section: SectionRow }) {
  const title = (
    <>
      <SectionIcon id={section.id} />
      {SECTION_LABELS[section.id]}
    </>
  );

  switch (section.id) {
    case "fields":
      return (
        <TableHeading>
          <TableTitle>{title}</TableTitle>
          <ColumnHead>Field</ColumnHead>
          <ColumnHead>Type / value</ColumnHead>
        </TableHeading>
      );
    case "inherited":
      return (
        <TableHeading>
          <TableTitle>{title}</TableTitle>
          <ColumnHead>Field</ColumnHead>
          <ColumnHead>Type</ColumnHead>
        </TableHeading>
      );
    default:
      return <Heading>{title}</Heading>;
  }
});

/**
 * A pill for the module of each side of a row, which goes to that side's class, or to the item in
 * it when the row is a field or an enum member
 */
function ModulePills({ declarations, item }: { declarations: Declaration[]; item?: string }) {
  const { game } = useContext(DeclarationsContext);
  return (
    <>
      {declarations.map(({ module, name }) => {
        const to =
          item === undefined ? schemaPath(game, module, name) : fieldLink(game, module, name, item);
        return (
          <PillLink key={module} to={to} title={`${name} in ${moduleLabel(module)}`}>
            <ModuleIcon module={module} />
            <ModuleName>{moduleLabel(module)}</ModuleName>
          </PillLink>
        );
      })}
    </>
  );
}

/** A class or enum found by its name, or by what it has */
export const NameRowView = memo(function NameRowView({
  hit,
  paired,
  ...state
}: {
  hit: NameHit | FuzzyHit;
  paired?: NameHit;
} & RowState) {
  const { game, entityByClass } = useContext(DeclarationsContext);
  const { declaration } = hit;
  const { kind, module, name } = declaration;
  const entities = entityByClass.get(declarationKey(module, name));
  const why = hitWhy(hit);
  const isAbstract = declaration.kind === "class" && declaration.flags.includes("abstract");
  const declarations = rowDeclarations(declaration, paired?.declaration);

  return (
    <ItemRow {...rowState(state)}>
      <Line>
        <KindIcon kind={kind} />
        <NameText>
          <AnchorName
            to={schemaPath(game, module, name)}
            title={`${kind} in ${moduleLabel(module)}`}
          >
            <HighlightRanges text={name} ranges={matchedRanges(hit.nameWords, "name", name)} />
          </AnchorName>
        </NameText>
        <DesignNamePills entities={entities} matches={hit.nameWords} />
        {isAbstract && <Pill>abstract</Pill>}
        <NameEnd>
          {why.length > 0 && <Why title={why.join("\n")}>{why.join(" · ")}</Why>}
          <ModuleCell>
            <ModulePills declarations={declarations} />
          </ModuleCell>
        </NameEnd>
      </Line>
    </ItemRow>
  );
});

/** The value of an enum member in decimal, and in hex when the enum has the width for it */
function MemberValue({ member, alignment }: { member: SchemaEnumMember; alignment: string }) {
  const hex = formatEnumHex(member.value, alignment);
  return (
    <>
      <ColoredSyntax kind="literal">{String(member.value)}</ColoredSyntax>
      {hex && <Dim>{hex}</Dim>}
    </>
  );
}

/** A field or an enum member, in the columns of the fields table */
export const FieldRowView = memo(function FieldRowView({
  row,
  ...state
}: {
  row: SearchRow<FieldHit | MemberHit>;
} & RowState) {
  const { game } = useContext(DeclarationsContext);
  const { hit, paired } = row;
  const { declaration } = hit;
  const item = itemName(hit);
  const source = hit.kind === "field" ? "field" : "member";
  const why = hitWhy(hit);
  const designNames = hitDesignNames(hit);
  const offsets = formatRowOffsets(row);

  return (
    <ItemRow {...rowState(state)}>
      <FieldGrid>
        <FieldCell>
          <KindIcon kind={hit.kind === "field" ? "field" : "enum-member"} />
          <AnchorName to={fieldLink(game, declaration.module, declaration.name, item)}>
            <HighlightRanges text={item} ranges={matchedRanges(hit.fieldWords, source, item)} />
          </AnchorName>
        </FieldCell>
        <ClassCell>
          <KindIcon kind={declaration.kind} />
          <ClassLink
            to={schemaPath(game, declaration.module, declaration.name)}
            title={`${declaration.name}, ${declaration.kind} in ${moduleLabel(declaration.module)}`}
          >
            <HighlightRanges
              text={declaration.name}
              ranges={matchedRanges(hit.nameWords, "name", declaration.name)}
            />
          </ClassLink>
        </ClassCell>
        <TypeCell>
          {hit.kind === "field" ? (
            <SchemaTypeView type={hit.field.type} />
          ) : (
            <MemberValue member={hit.member} alignment={hit.declaration.alignment} />
          )}
          {offsets && <OffsetText title="Offset">{offsets}</OffsetText>}
        </TypeCell>
        <ModuleCell>
          <ModulePills
            declarations={rowDeclarations(declaration, paired?.declaration)}
            item={item}
          />
        </ModuleCell>
        {(designNames.length > 0 || why.length > 0) && (
          <Notes>
            {designNames.map((name) => (
              <DesignNamePill key={name} name={name} matches={hit.nameWords} />
            ))}
            {why.length > 0 && <span title={why.join("\n")}>{why.join(" · ")}</span>}
          </Notes>
        )}
      </FieldGrid>
    </ItemRow>
  );
});

/** A field that classes have from a base, in the columns of the fields table */
export const InheritedRowView = memo(function InheritedRowView({
  row,
  ...state
}: {
  row: SearchRow<InheritedSide>;
} & RowState) {
  const { game } = useContext(DeclarationsContext);
  const { hit, paired } = row;
  const { declaration: declaring, field } = hit;

  return (
    <ItemRow {...rowState(state)}>
      <FieldGrid>
        <FieldCell>
          <KindIcon kind="field" />
          <AnchorName to={fieldLink(game, declaring.module, declaring.name, field.name)}>
            <HighlightRanges
              text={field.name}
              ranges={matchedRanges(hit.fieldWords, "field", field.name)}
            />
          </AnchorName>
        </FieldCell>
        <ClassCell>
          <KindIcon kind="class" />
          <ClassLink
            to={schemaPath(game, declaring.module, declaring.name)}
            title={`${declaring.name}, class in ${moduleLabel(declaring.module)}`}
          >
            {declaring.name}
          </ClassLink>
        </ClassCell>
        <TypeCell>
          <SchemaTypeView type={field.type} />
        </TypeCell>
        <ModuleCell>
          <ModulePills
            declarations={rowDeclarations(declaring, paired?.declaration)}
            item={field.name}
          />
        </ModuleCell>
      </FieldGrid>
    </ItemRow>
  );
});

export const ShowAllRowView = memo(function ShowAllRowView({
  count,
  onShowAll,
  ...state
}: {
  count: number;
  onShowAll: () => void;
} & RowState) {
  return (
    <ItemRow {...rowState(state)}>
      <ShowAllButton count={count} onClick={onShowAll} />
    </ItemRow>
  );
});

const AllLink = styled(Link)`
  margin-left: auto;
  font-size: 14px;
  ${highlightLink}
`;

const Hint = styled.p`
  margin: 12px 0 0;
  text-align: center;
  font-size: 16px;

  a {
    ${highlightLink}
  }
`;

/** Heads the other section's better matches, with a link to all of its results */
export const OtherSectionHeading = memo(function OtherSectionHeading({
  total,
  shown,
}: {
  total: number;
  shown: number;
}) {
  const { section, to } = useContext(OtherSectionContext)!;
  const { icon, label } = SECTIONS[section];
  return (
    <Heading>
      <KindIcon kind={icon} />
      {label}
      {total > shown && <AllLink to={to}>All {total.toLocaleString("en-US")} results</AllLink>}
    </Heading>
  );
});

/** A link to the other section's results, when none of them are listed */
export const OtherSectionHint = memo(function OtherSectionHint({ total }: { total: number }) {
  const { section, to } = useContext(OtherSectionContext)!;
  return (
    <Hint>
      <Link to={to}>
        {total.toLocaleString("en-US")} result{total !== 1 && "s"} in {SECTIONS[section].label}
      </Link>
    </Hint>
  );
});

/** A convar or command, as the ConVars page lists it */
export const ConsoleResultRowView = memo(function ConsoleResultRowView({
  match,
  ...state
}: {
  match: ConsoleMatch;
} & RowState) {
  const { game } = useContext(DeclarationsContext);
  const { pageHref, onNavigate } = useConsoleRowLinks(game);
  return (
    <ConsoleFrame {...rowState(state)}>
      <ConsoleRow
        item={match.item}
        nameRanges={match.nameRanges}
        anchored={false}
        pageHref={pageHref}
        onNavigate={onNavigate}
      />
    </ConsoleFrame>
  );
});

export function EmptyRowView() {
  return <TextMessage>No results found</TextMessage>;
}
