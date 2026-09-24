import type { Declaration, SchemaFieldType } from "../data/types";
import { INTRINSIC_MODULE } from "../data/intrinsics";

// Discord component embed, a custom link preview built from Components V2.
// https://discord.com/developers/docs/link-previews/component-embeds

// Discord rejects payloads over 3000 bytes, leave some headroom.
const MAX_PAYLOAD_BYTES = 2800;
// Keep the preview from taking over the chat
const MAX_MEMBERS = 15;
const ACCENT_COLOR = 0x63a1ff;
// The code is C++, but highlight.js only colors primitives there. Its Nim grammar treats every
// capitalized identifier as a type and knows int32, uint8, float32 and friends as builtins.
const CODE_LANGUAGE = "nim";

const COMPONENT_SECTION = 9;
const COMPONENT_TEXT_DISPLAY = 10;
const COMPONENT_THUMBNAIL = 11;
const COMPONENT_CONTAINER = 17;

export interface EmbedPage {
  siteName: string;
  gameName: string;
  url: string;
  imageUrl: string;
}

export function formatFieldType(type: SchemaFieldType): string {
  switch (type.category) {
    case "builtin":
    case "declared_class":
    case "declared_enum":
      return type.name;
    case "ptr":
      return `${formatFieldType(type.inner)}*`;
    case "fixed_array":
      return `${formatFieldType(type.inner)}[${type.count}]`;
    case "atomic": {
      const args = [type.inner, type.inner2].filter((t) => t != null).map(formatFieldType);
      if (type.count != null) args.push(String(type.count));
      return args.length > 0 ? `${type.name}< ${args.join(", ")} >` : type.name;
    }
    case "bitfield":
      return `bitfield:${type.count}`;
  }
}

function declarationHeader(d: Declaration): string {
  if (d.kind === "enum") {
    return `enum ${d.name}${d.alignment ? ` : ${d.alignment}` : ""}`;
  }
  const parents = d.parents.map((p) => `public ${p.name}`).join(", ");
  return `class ${d.name}${parents ? ` : ${parents}` : ""}`;
}

function* declarationLines(d: Declaration): Generator<string> {
  if (d.kind === "enum") {
    for (const m of d.members) yield `    ${m.name} = ${m.value},`;
  } else {
    for (const f of d.fields) {
      yield `    ${formatFieldType(f.type)} ${f.name};`;
    }
  }
}

function buildPayload(d: Declaration, page: EmbedPage, lines: string[]) {
  const total = d.kind === "enum" ? d.members.length : d.fields.length;
  const noun = d.kind === "enum" ? "value" : "field";
  const location = d.module === INTRINSIC_MODULE ? "intrinsic type" : `${d.module}.dll`;

  const code = [declarationHeader(d), "{", ...lines, "};"].join("\n");

  const title = `-# ${page.siteName}\n## [${d.name}](${page.url})\n-# ${d.kind} · ${location} · ${page.gameName}`;
  let content = `\`\`\`${CODE_LANGUAGE}\n${code}\n\`\`\``;

  if (lines.length < total) {
    const remaining = total - lines.length;
    content += `\n-# …and ${remaining} more ${noun}${remaining !== 1 ? "s" : ""}`;
  }

  return {
    component: {
      type: COMPONENT_CONTAINER,
      accent_color: ACCENT_COLOR,
      components: [
        {
          type: COMPONENT_SECTION,
          components: [{ type: COMPONENT_TEXT_DISPLAY, content: title }],
          accessory: { type: COMPONENT_THUMBNAIL, media: { url: page.imageUrl } },
        },
        { type: COMPONENT_TEXT_DISPLAY, content },
      ],
    },
  };
}

function serialize(value: unknown): string {
  // Escape "<" so field types like CUtlVector< T > can never close the script tag
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

const encoder = new TextEncoder();

function serializedBytes(value: unknown): number {
  return encoder.encode(serialize(value)).length;
}

/** Returns the JSON for a `discord:component-embed` script, showing the first members that fit the limits. */
export function buildComponentEmbed(d: Declaration, page: EmbedPage): string {
  // The payload without any members also reserves room for the longest "…and N more" suffix
  let budget = MAX_PAYLOAD_BYTES - serializedBytes(buildPayload(d, page, []));
  const lines: string[] = [];

  for (const line of declarationLines(d)) {
    if (lines.length >= MAX_MEMBERS) break;
    // The quotes around the serialized line weigh the same as its escaped newline
    budget -= serializedBytes(line);
    if (budget < 0) break;
    lines.push(line);
  }

  return serialize(buildPayload(d, page, lines));
}
