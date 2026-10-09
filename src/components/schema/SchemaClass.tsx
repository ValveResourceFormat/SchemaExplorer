import React, { memo, useContext, useMemo, useState } from "react";
import { Link } from "../Link";
import { styled } from "@linaria/react";
import * as api from "../../data/types";
import { SchemaTypeView, MetadataDetail, MetadataTags } from "./SchemaType";
import { ReferencedBy } from "./ReferencedBy";
import { CrossGameDetail } from "./CrossGameRefs";
import { KindIcon } from "../kind-icon/KindIcon";
import { DeclarationsContext, declarationKey, fieldLink, schemaPath } from "./DeclarationsContext";
import { inheritedBases, type InheritedBase } from "../../data/derived";
import { componentOverrides, fieldSending, type FieldSending } from "../../data/network";
import { searchLink, useFieldParam } from "../../utils/filtering";
import { formatHexOffset, padHex, plural } from "../../utils/format";
import { computeBitfieldInfo, type BitfieldInfo } from "../../utils/bitfields";
import { useAnchoredRef } from "./useAnchoredRow";
import {
  ComponentOf,
  DesignNamePills,
  EntityJumpPills,
  EntityMatches,
  EntitySections,
} from "./EntitySections";
import {
  AnchorName,
  Band,
  BandGroup,
  InlineList,
  PageHeader,
  PageTitle,
  Pill,
  Row,
  RowNotes,
  Table,
  TableHead,
} from "./styles";
import { Detail, DetailsCard } from "./Detail";
import { FilterToggle, InheritedSwitch } from "./InheritedSwitch";
import { CollapsedInheritedRow, GitHubFileLink, SearchResultCard, TitledCard } from "./Cards";
import { RowIcon } from "./RowIcon";
import {
  ClassNetworkDetail,
  ClassNetworkMatch,
  FieldNetworkLine,
  fieldNetworkAttrs,
  NetworkedMark,
} from "./NetworkInfo";
import { tip } from "../Tooltip";

const SizeText = styled.span`
  font-size: 14px;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
`;

const AbstractPill = () => (
  <Pill {...tip("Abstract class, only derived classes are instantiated.")}>abstract</Pill>
);

// -- Class --

export const SchemaClassView: React.FC<{
  declaration: api.SchemaClass;
  isSearchResult?: boolean;
}> = ({ declaration, isSearchResult }) => {
  const context = useContext(DeclarationsContext);
  const { game, declarations, entityByClass } = context;
  const entities = entityByClass.get(declarationKey(declaration.module, declaration.name));
  const declPath = schemaPath(game, declaration.module, declaration.name);
  const isAbstract = declaration.flags.includes("abstract");
  // Farthest first
  const bases = useMemo(
    () => inheritedBases(declarations, declaration.parents),
    [declarations, declaration.parents],
  );
  // Search results only have their matched fields, the serializer needs every one
  const full = declarations.get(declaration.module)?.get(declaration.name);
  const whole = full?.kind === "class" ? full : declaration;
  const showsFields = !isSearchResult || declaration.fields.length > 0;
  const sending = useMemo(
    () =>
      showsFields
        ? fieldSending(declarations, whole, componentOverrides(context, declarations, whole))
        : NO_SENDING,
    [context, declarations, whole, showsFields],
  );

  if (isSearchResult) {
    return (
      <SearchResultCard
        declaration={declaration}
        pills={
          <>
            <DesignNamePills entities={entities} />
            {isAbstract && <AbstractPill />}
            {declaration.size != null && <SizeText>{plural(declaration.size, "byte")}</SizeText>}
          </>
        }
      >
        <ClassNetworkMatch declaration={declaration} whole={whole} bases={bases} />
        {declaration.fields.length > 0 && (
          // Only the class's own matched fields
          <FieldTable
            declaration={declaration}
            declPath={declPath}
            bases={NO_BASES}
            sending={sending}
          />
        )}
        {declaration.entityMatches && (
          <EntityMatches
            matches={declaration.entityMatches}
            module={declaration.module}
            anchorBase={declPath}
          />
        )}
      </SearchResultCard>
    );
  }

  return (
    <>
      <PageHeader>
        <PageTitle>
          <KindIcon kind="class" size={24} />
          {declaration.name}
        </PageTitle>
        {entities && <EntityJumpPills entities={entities} />}
        {isAbstract && <AbstractPill />}
        <ClassLayout declaration={declaration} />
        <GitHubFileLink module={declaration.module} name={declaration.name} button />
      </PageHeader>
      <ClassDetails declaration={declaration} bases={bases} />
      <FieldTable
        declaration={declaration}
        declPath={declPath}
        bases={bases}
        sending={sending}
        inPage
      />
      {entities && <EntitySections entities={entities} anchorBase={declPath} />}
    </>
  );
};

const NO_BASES: InheritedBase[] = [];
const NO_SENDING = new Map<api.SchemaField, FieldSending>();

const BaseOffsetText = styled.span`
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
`;

/** Size and alignment, like 1248 bytes (0x04E0), align 8 */
function ClassLayout({ declaration }: { declaration: api.SchemaClass }) {
  const { size, alignment } = declaration;
  if (size == null) return null;
  return (
    <SizeText>
      {plural(size, "byte")} ({formatHexOffset(size)}){alignment != null && `, align ${alignment}`}
    </SizeText>
  );
}

/** Bases, references, metadata and other games, the card hides when there is none */
function ClassDetails({
  declaration,
  bases,
}: {
  declaration: api.SchemaClass;
  bases: InheritedBase[];
}) {
  const { game } = useContext(DeclarationsContext);

  return (
    <DetailsCard>
      {bases.length > 0 && (
        <Detail label="Inherits">
          <InlineList>
            {/* Nearest first, like reading up the inheritance */}
            {bases.toReversed().map(({ parent, offset }) => (
              <Link
                key={`${parent.module}/${parent.name}`}
                to={schemaPath(game, parent.module, parent.name)}
                title={`class in ${parent.module}`}
              >
                <KindIcon kind="inherited-class" />
                {parent.name}
                {offset !== 0 && <BaseOffsetText>at {formatHexOffset(offset)}</BaseOffsetText>}
              </Link>
            ))}
          </InlineList>
        </Detail>
      )}
      <ReferencedBy name={declaration.name} module={declaration.module} />
      <ComponentOf name={declaration.name} module={declaration.module} />
      <MetadataDetail metadata={declaration.metadata} game={game} />
      <ClassNetworkDetail declaration={declaration} bases={bases} />
      <CrossGameDetail declaration={declaration} />
    </DetailsCard>
  );
}

// -- Fields --

interface FieldEntry {
  field: api.SchemaField;
  /** The class declaring the field */
  owner: { name: string; module: string };
  /** Offset in this class, base offset included */
  offset?: number;
  inherited: boolean;
  /** Where the owner starts in this class, for its band */
  baseOffset: number;
}

const OFFSET_COLUMNS = "fit-content(22em) minmax(0, 1fr) max-content";
const COLUMNS = "fit-content(22em) minmax(0, 1fr)";

/**
 * The fields of a class, and with inherited ones every field sorted by offset, so a base
 * placed after the class's own fields shows up where it is
 */
function FieldTable({
  declaration,
  declPath,
  bases,
  sending,
  inPage,
}: {
  declaration: api.SchemaClass;
  declPath: string;
  /** The bases whose fields it can show */
  bases: InheritedBase[];
  /** Whether the class sends its and its bases' networked fields, from fieldSending */
  sending: Map<api.SchemaField, FieldSending>;
  /** On the class page, with the card and column names */
  inPage?: boolean;
}) {
  const { game } = useContext(DeclarationsContext);
  const fieldParam = useFieldParam();
  const [showInherited, setShowInherited] = useState(false);
  const [networkedOnly, setNetworkedOnly] = useState(false);

  const { own, all, bitfields, hasOffsets, hasNetworked, inheritedRange, hexDigits } =
    useMemo(() => {
      const bitfields = new Map<api.SchemaField, BitfieldInfo>(
        computeBitfieldInfo(declaration.fields),
      );
      const inherited: FieldEntry[] = [];
      for (const base of bases) {
        for (const [field, info] of computeBitfieldInfo(base.fields)) bitfields.set(field, info);
        for (const field of base.fields) {
          inherited.push({
            field,
            owner: base.parent,
            offset: field.offset != null ? base.offset + field.offset : undefined,
            inherited: true,
            baseOffset: base.offset,
          });
        }
      }
      const own: FieldEntry[] = declaration.fields.map((field) => ({
        field,
        owner: declaration,
        offset: field.offset,
        inherited: false,
        baseOffset: 0,
      }));

      const all = [...inherited, ...own];
      const hasOffsets = all.some((e) => e.offset != null);
      const hasNetworked = all.some((e) => e.field.network);
      // Dumps without offsets keep the declaration order, bases first
      if (all.every((e) => e.offset != null)) all.sort((a, b) => a.offset! - b.offset!);

      // Every offset in the table as wide as the largest, so the column lines up
      const largest = Math.max(declaration.size ?? 0, ...all.map((e) => e.offset ?? 0));
      const hexDigits = formatHexOffset(largest).length - 2;

      // The hidden fields stand in one row, with their range when they all come first
      const firstOwn = own.find((e) => e.offset != null)?.offset ?? declaration.size;
      const lastInherited = Math.max(...inherited.map((e) => e.offset ?? Infinity));
      const inheritedRange =
        inherited.length > 0 && firstOwn != null && firstOwn > 0 && lastInherited < firstOwn
          ? `${padHex("0x0", hexDigits)} – ${padHex(formatHexOffset(firstOwn - 1), hexDigits)}`
          : null;

      return { own, all, bitfields, hasOffsets, hasNetworked, inheritedRange, hexDigits };
    }, [declaration, bases]);

  if (all.length === 0) return null;

  const hasInherited = all.length > own.length;
  const shown = showInherited ? all : own;
  // The filter goes away while none of the shown fields are networked
  const canFilter = shown.some((e) => e.field.network);
  const rows = networkedOnly && canFilter ? shown.filter((e) => e.field.network) : shown;
  // The networked mark goes next to the offset
  const endColumn = hasOffsets || hasNetworked;
  const cols = endColumn ? OFFSET_COLUMNS : COLUMNS;

  const renderRow = (entry: FieldEntry) => (
    <FieldRow
      key={entryKey(entry)}
      entry={entry}
      declPath={declPath}
      game={game}
      endColumn={endColumn}
      hexDigits={hexDigits}
      bitfield={bitfields.get(entry.field)}
      sending={sending.get(entry.field)}
      anchored={!entry.inherited && fieldParam === entry.field.name}
    />
  );

  const table = (
    <Table style={{ "--cols": cols } as React.CSSProperties}>
      {inPage && rows.length > 0 && (
        <TableHead>
          <span>Name</span>
          <span>Type</span>
          {endColumn && <OffsetHead>{hasOffsets && "Offset"}</OffsetHead>}
        </TableHead>
      )}
      {!showInherited && hasInherited && (
        <CollapsedInheritedRow
          label="Inherited fields"
          range={inheritedRange && <OffsetText data-end>{inheritedRange}</OffsetText>}
          onShow={() => setShowInherited(true)}
        />
      )}
      {showInherited
        ? ownerRuns(rows).map((run, i) => (
            // By class and position, so filtering out a run's first field keeps its rows
            <BandGroup key={`${run[0].owner.module}/${run[0].owner.name}/${i}`}>
              <OwnerBand entry={run[0]} />
              {run.map(renderRow)}
            </BandGroup>
          ))
        : rows.map(renderRow)}
    </Table>
  );

  if (!inPage) return table;

  return (
    <TitledCard
      title="Fields"
      icon="field"
      actions={
        (canFilter || hasInherited) && (
          <>
            {canFilter && (
              <FilterToggle
                pressed={networkedOnly}
                onChange={setNetworkedOnly}
                icon="meta-broadcast"
              >
                Networked
              </FilterToggle>
            )}
            {hasInherited && (
              <InheritedSwitch
                label="Fields"
                showInherited={showInherited}
                onChange={setShowInherited}
              />
            )}
          </>
        )
      }
    >
      {table}
    </TitledCard>
  );
}

function entryKey(entry: FieldEntry) {
  return `${entry.owner.module}/${entry.owner.name}/${entry.field.name}/${entry.offset}`;
}

/**
 * Consecutive fields of the same class, each run goes under its own band. A class whose fields
 * are split by another's has a run for each part
 */
function ownerRuns(rows: FieldEntry[]) {
  const runs: FieldEntry[][] = [];
  for (const entry of rows) {
    const run = runs.at(-1);
    if (run?.[0].owner === entry.owner) run.push(entry);
    else runs.push([entry]);
  }
  return runs;
}

function OwnerBand({ entry }: { entry: FieldEntry }) {
  const { game } = useContext(DeclarationsContext);
  const { owner, inherited, baseOffset } = entry;
  return (
    <Band>
      <KindIcon kind={inherited ? "inherited-class" : "class"} />
      {inherited ? (
        <Link to={schemaPath(game, owner.module, owner.name)}>{owner.name}</Link>
      ) : (
        <strong>{owner.name}</strong>
      )}
      {baseOffset !== 0 && <span>at {formatHexOffset(baseOffset)}</span>}
    </Band>
  );
}

const OffsetHead = styled.span`
  justify-self: end;
`;

const OffsetText = styled.span`
  justify-self: end;
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
`;

/** Right-aligned like the old offsets, the bit range of a bitfield below */
const OffsetCell = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-self: end;
`;

/** The networked mark left of the offset, so the marks line up */
const OffsetLine = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const OffsetLink = styled(Link)`
  display: inline-flex;
  gap: 10px;
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  text-decoration: none;

  > span:first-child {
    min-width: 5ch;
    text-align: right;
    opacity: 0.65;
  }

  &:hover {
    color: var(--highlight);
    text-decoration: underline;
  }
`;

const BitRange = styled.span`
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
`;

const FieldName = styled.div`
  font-weight: 600;
  word-break: break-all;

  &[data-inherited] {
    font-weight: 500;
  }
`;

const FieldType = styled.div`
  min-width: 0;
  overflow-wrap: anywhere;

  /* After the offset, which is on the line of the name */
  @media (max-width: 768px) {
    order: 1;
  }
`;

/** After the type, which comes after the offset on phones */
const FieldNotes = styled(RowNotes)`
  @media (max-width: 768px) {
    order: 1;
  }
`;

const DefaultValue = styled.span`
  font-size: 14px;
  color: var(--text-dim);
  font-weight: 400;
  white-space: pre-wrap;
`;

const PaddingNote = styled(Row)`
  font-size: 13px;
  font-style: italic;
  color: var(--text-dim);

  > span {
    grid-column: 1 / -1;
  }

  &:hover {
    background: none;
  }
`;

/** Memoized, an anchor click re-renders only the rows it changes, not a whole pawn's fields */
const FieldRow = memo(function FieldRow({
  entry,
  declPath,
  game,
  endColumn,
  hexDigits,
  bitfield,
  sending,
  anchored,
}: {
  entry: FieldEntry;
  declPath: string;
  game: string;
  /** The offset and the networked mark */
  endColumn: boolean;
  hexDigits: number;
  bitfield?: BitfieldInfo;
  sending?: FieldSending;
  anchored: boolean;
}) {
  const { field, owner, offset, inherited } = entry;
  const rowRef = useAnchoredRef(anchored);
  const hex = offset != null ? formatHexOffset(offset) : undefined;
  const paddingBytes = bitfield ? Math.ceil(bitfield.totalBits / 8) : 0;
  const networkAttrs = fieldNetworkAttrs(field, owner.module);

  return (
    <>
      <Row ref={rowRef as React.Ref<HTMLDivElement>} data-anchored={anchored || undefined}>
        {/* On phones the offset goes on the line of the name */}
        <FieldName data-inline data-inherited={inherited || undefined}>
          <RowIcon kind="field" />
          {inherited ? (
            // Inherited fields belong to their base's page
            <AnchorName
              to={fieldLink(game, owner.module, owner.name, field.name)}
              title={`${owner.name}::${field.name}`}
            >
              {field.name}
            </AnchorName>
          ) : (
            <AnchorName
              to={{ pathname: declPath, hash: `field=${encodeURIComponent(field.name)}` }}
              replace
              preventScrollReset
            >
              {field.name}
            </AnchorName>
          )}
        </FieldName>
        <FieldType>
          <SchemaTypeView type={field.type} />
          {field.defaultValue != null && <DefaultValue> = {field.defaultValue}</DefaultValue>}
        </FieldType>
        {endColumn && (
          <OffsetCell data-end>
            <OffsetLine>
              {field.network && <NetworkedMark sending={sending} />}
              {hex != null && (
                <OffsetLink to={searchLink(game, `offset:${hex}`)} title="Fields at this offset">
                  <span>{offset}</span>
                  <span>{padHex(hex, hexDigits)}</span>
                </OffsetLink>
              )}
            </OffsetLine>
            {bitfield && (
              <BitRange>
                bit{bitfield.bitCount !== 1 ? "s" : ""} {bitfield.bitOffset}
                {bitfield.bitCount !== 1 ? `..${bitfield.bitOffset + bitfield.bitCount - 1}` : ""}
              </BitRange>
            )}
          </OffsetCell>
        )}
        {(networkAttrs.length > 0 || field.metadata.length > 0) && (
          <FieldNotes>
            {networkAttrs.length > 0 && <FieldNetworkLine attrs={networkAttrs} />}
            <MetadataTags metadata={field.metadata} game={game} />
          </FieldNotes>
        )}
      </Row>
      {bitfield && bitfield.totalBits > 0 && (
        <PaddingNote>
          <span>
            {plural(paddingBytes, "byte")} ({plural(bitfield.totalBits, "bit")}
            {bitfield.padding > 0 ? ` + ${bitfield.padding} padding` : ""})
          </span>
        </PaddingNote>
      )}
    </>
  );
});
