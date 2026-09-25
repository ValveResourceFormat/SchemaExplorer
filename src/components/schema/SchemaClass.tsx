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
import { InheritedSwitch } from "./InheritedSwitch";
import { CollapsedInheritedRow, GitHubFileLink, SearchResultCard, TitledCard } from "./Cards";
import { RowIcon } from "./RowIcon";
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
  const { game, declarations, entityByClass } = useContext(DeclarationsContext);
  const entities = entityByClass.get(declarationKey(declaration.module, declaration.name));
  const declPath = schemaPath(game, declaration.module, declaration.name);
  const isAbstract = declaration.flags.includes("abstract");
  // Farthest first, search results only list the class's own matched fields
  const bases = useMemo(
    () => (isSearchResult ? [] : inheritedBases(declarations, declaration.parents)),
    [isSearchResult, declarations, declaration.parents],
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
        {declaration.fields.length > 0 && (
          <FieldTable declaration={declaration} declPath={declPath} bases={bases} />
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
          <KindIcon kind="class" size="big" />
          {declaration.name}
        </PageTitle>
        {entities && <EntityJumpPills entities={entities} />}
        {isAbstract && <AbstractPill />}
        <ClassLayout declaration={declaration} />
        <GitHubFileLink module={declaration.module} name={declaration.name} button />
      </PageHeader>
      <ClassDetails declaration={declaration} bases={bases} />
      <FieldTable declaration={declaration} declPath={declPath} bases={bases} inPage />
      {entities && <EntitySections entities={entities} anchorBase={declPath} />}
    </>
  );
};

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
                <KindIcon kind="inherited-class" size="small" />
                {parent.name}
                {offset !== 0 && <BaseOffsetText>at {formatHexOffset(offset)}</BaseOffsetText>}
              </Link>
            ))}
          </InlineList>
        </Detail>
      )}
      <ReferencedBy name={declaration.name} module={declaration.module} />
      <ComponentOf name={declaration.name} module={declaration.module} />
      <MetadataDetail metadata={declaration.metadata} game={game} module={declaration.module} />
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
  inPage,
}: {
  declaration: api.SchemaClass;
  declPath: string;
  bases: InheritedBase[];
  /** On the class page, with the card and column names */
  inPage?: boolean;
}) {
  const { game } = useContext(DeclarationsContext);
  const fieldParam = useFieldParam();
  const [showInherited, setShowInherited] = useState(false);

  const { own, all, bitfields, hasOffsets, inheritedRange, hexDigits } = useMemo(() => {
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

    return { own, all, bitfields, hasOffsets, inheritedRange, hexDigits };
  }, [declaration, bases]);

  if (all.length === 0) return null;

  const hasInherited = all.length > own.length;
  const rows = showInherited ? all : own;
  const cols = hasOffsets ? OFFSET_COLUMNS : COLUMNS;

  const table = (
    <Table style={{ "--cols": cols } as React.CSSProperties}>
      {inPage && rows.length > 0 && (
        <TableHead>
          <span>Name</span>
          <span>Type</span>
          {hasOffsets && <OffsetHead>Offset</OffsetHead>}
        </TableHead>
      )}
      {!showInherited && hasInherited && (
        <CollapsedInheritedRow
          label="Inherited fields"
          range={inheritedRange && <OffsetText>{inheritedRange}</OffsetText>}
          onShow={() => setShowInherited(true)}
        />
      )}
      {rows.map((entry, i) => {
        const previous = rows[i - 1];
        const newOwner =
          showInherited && (!previous || previous.owner !== entry.owner) && entry.owner;
        return (
          <React.Fragment
            key={`${entry.owner.module}/${entry.owner.name}/${entry.field.name}/${entry.offset}`}
          >
            {newOwner && <OwnerBand entry={entry} />}
            <FieldRow
              entry={entry}
              declPath={declPath}
              game={game}
              hasOffsets={hasOffsets}
              hexDigits={hexDigits}
              bitfield={bitfields.get(entry.field)}
              anchored={!entry.inherited && fieldParam === entry.field.name}
            />
          </React.Fragment>
        );
      })}
    </Table>
  );

  if (!inPage) return table;

  return (
    <TitledCard
      title="Fields"
      icon="field"
      actions={
        hasInherited && (
          <InheritedSwitch
            label="Fields"
            showInherited={showInherited}
            onChange={setShowInherited}
          />
        )
      }
    >
      {table}
    </TitledCard>
  );
}

function OwnerBand({ entry }: { entry: FieldEntry }) {
  const { game } = useContext(DeclarationsContext);
  const { owner, inherited, baseOffset } = entry;
  return (
    <Band>
      <KindIcon kind={inherited ? "inherited-class" : "class"} size={14} />
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

  @media (max-width: 768px) {
    align-items: flex-start;
    justify-self: start;
  }
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
  hasOffsets,
  hexDigits,
  bitfield,
  anchored,
}: {
  entry: FieldEntry;
  declPath: string;
  game: string;
  hasOffsets: boolean;
  hexDigits: number;
  bitfield?: BitfieldInfo;
  anchored: boolean;
}) {
  const { field, owner, offset, inherited } = entry;
  const rowRef = useAnchoredRef(anchored);
  const hex = offset != null ? formatHexOffset(offset) : undefined;
  const paddingBytes = bitfield ? Math.ceil(bitfield.totalBits / 8) : 0;

  return (
    <>
      <Row ref={rowRef as React.Ref<HTMLDivElement>} data-anchored={anchored || undefined}>
        <FieldName data-inherited={inherited || undefined}>
          <RowIcon kind="field" size="small" />
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
        {hasOffsets && (
          <OffsetCell>
            {hex != null && (
              <OffsetLink to={searchLink(game, `offset:${hex}`)} title="Fields at this offset">
                <span>{offset}</span>
                <span>{padHex(hex, hexDigits)}</span>
              </OffsetLink>
            )}
            {bitfield && (
              <BitRange>
                bit{bitfield.bitCount !== 1 ? "s" : ""} {bitfield.bitOffset}
                {bitfield.bitCount !== 1 ? `..${bitfield.bitOffset + bitfield.bitCount - 1}` : ""}
              </BitRange>
            )}
          </OffsetCell>
        )}
        {field.metadata.length > 0 && (
          <RowNotes>
            <MetadataTags metadata={field.metadata} game={game} module={owner.module} />
          </RowNotes>
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
