import type { IconKind } from "../kind-icon/KindIcon";

type FlagGroup = "workshop" | "cheat" | "devonly" | "restricted" | "network" | "saved" | "hidden";

// Flags that get a color, everything else is a neutral badge
const FLAG_GROUPS: Record<string, FlagGroup> = {
  workshop_whitelisted: "workshop",
  cheat: "cheat",
  developmentonly: "devonly",
  defensive: "devonly",
  protected: "restricted",
  sponly: "restricted",
  server_cannot_query: "restricted",
  commandline_enforced: "restricted",
  replicated: "network",
  notify: "network",
  userinfo: "network",
  server_can_execute: "network",
  client_can_execute: "network",
  clientcmd_can_execute: "network",
  archive: "saved",
  per_user: "saved",
  hidden: "hidden",
  reference: "hidden",
};

export function flagGroup(flag: string): FlagGroup | undefined {
  return FLAG_GROUPS[flag];
}

// Matches the --flag-* custom properties in global.css, "hidden" has no color of its own
const GROUP_ACCENTS: Partial<Record<FlagGroup, string>> = {
  workshop: "var(--flag-workshop)",
  cheat: "var(--flag-cheat)",
  devonly: "var(--flag-devonly)",
  restricted: "var(--flag-restricted)",
  network: "var(--flag-network)",
  saved: "var(--flag-saved)",
};

/** The accent color a flag's badge is drawn in, so other UI can match it */
export function flagAccent(flag: string): string | undefined {
  const group = flagGroup(flag);
  return group ? GROUP_ACCENTS[group] : undefined;
}

// The flags that need to stand out get an icon before their name
const FLAG_ICONS: Record<string, IconKind> = {
  workshop_whitelisted: "hammer",
  cheat: "lock",
  developmentonly: "code",
  defensive: "shield",
  replicated: "replicated",
  userinfo: "user",
};

export function flagIcon(flag: string): IconKind | undefined {
  return FLAG_ICONS[flag];
}

// Shown above the list while filtering by the flag
const FLAG_DESCRIPTIONS: Record<string, string> = {
  workshop_whitelisted:
    "Listed in the workshop cvar whitelist, so workshop maps are allowed to change it. Added by this site from workshop_cvar_whitelist.txt, it isn't one of the game's own flags.",
  cheat:
    "Only works with sv_cheats 1 or during demo playback. Goes back to its default when sv_cheats is turned off or when you join a remote server.",
  developmentonly:
    "Internal to Valve. Hidden from find, cvarlist and autocomplete, and the console can't find it by name, so it can't be used in the released game.",
  defensive:
    "Hidden automatically because it isn't marked for public use (release, archive, cheat and so on), which also makes it developmentonly. Unlike other developmentonly entries it can still be used by its exact name, unless the game sets DefensiveConCommands in gameinfo.gi, which CS2 and Deadlock do.",
  protected:
    "The value is secret, like a password. When the server announces a change, the value is shown as ***PROTECTED***.",
  sponly: "Clients can't run this on a multiplayer server.",
  server_cannot_query: "Servers can't ask your client for its value, like for passwords.",
  commandline_enforced:
    "Reset to its default every time a map loads, before server_default.cfg and server.cfg run. A value from launch options gets overwritten, so set it in one of those configs instead.",
  replicated:
    "Controlled by the server. The server's value is copied to every client, and you can't change it while connected to a server you aren't hosting.",
  notify:
    "The server announces every change to players and lists the value in the server log when a map loads.",
  userinfo:
    "Your value is sent to the server when you connect and every time you change it, so the server knows each player's setting.",
  server_can_execute: "The server is allowed to run this command on your client.",
  client_can_execute: "Players are allowed to send this command to the server, like say or kill.",
  clientcmd_can_execute:
    "The game's own code, like UI buttons, is allowed to run this command for you.",
  archive: "Saved to your config file, so it keeps its value between game launches.",
  per_user:
    "Has a separate value for each splitscreen player. In VConsole, name[slot] syntax works only for these.",
  hidden: "Doesn't show up in find, cvarlist or autocomplete, but still works if you type it.",
  reference:
    "A placeholder for a cvar owned by a module that wasn't loaded when this was dumped. The game treats it as if it doesn't exist.",
  release:
    "Available in the released game. Anything without this flag (or archive, userinfo, cheat or one of the can execute flags) is hidden automatically, see defensive.",
  gamedll:
    "Registered by the server code. If you type this command on a client, it is sent to the server.",
  clientdll: "Registered by the client code.",
  linked_concommand:
    "Several modules register a command with this name, and running it runs all of them.",
  menubar_item:
    "A toggle in the in-game ImGui debug menu bar. The help text is its path in the menu.",
  vconsole_fuzzy_matching:
    "Argument autocomplete for this command uses fuzzy matching, like entity names for ent_fire.",
  vconsole_set_focus:
    "Running this from VConsole brings the game window to the front, like map or quit.",
  execute_per_tick:
    "If it's run in the middle of a frame, it waits and runs on the next game tick.",
  execute_immediately:
    "Runs right away, even inside a batch of commands that would otherwise run together. Used by exec.",
  snapshot_ignored:
    "Left untouched when the game saves a set of cvar values and later restores them.",
  gameinfo_cannot_override: "The game's gameinfo.gi file can't change this cvar.",
  enum_value:
    "The value is an enum, written as names like SCENEOBJECT_VIS_NONE, or several names joined with | for flags.",
  demo: "Meant to be recorded into demos. Nothing checks it in current games.",
  dontrecord: "Meant to be left out of demo recordings. Nothing checks it in current games.",
  unlogged: "Meant to keep changes out of the server log. Nothing checks it in current games.",
  notconnected:
    "Meant to block changes while connected to a server. Nothing checks it in current games.",

  // Half-Life: Alyx still uses these Source 1 names, described by their Source 1 SDK meaning
  unregistered: "Source 1 flag: not added to the list of registered cvars.",
  printableonly: "Source 1 flag: the value can't contain unprintable characters.",
  never_as_string: "Source 1 flag: the value is never printed as a string.",
  ss: "Source 1 flag: splitscreen copies of this cvar (name2, name3, …) are created for the other splitscreen players.",
  ss_added: "Source 1 flag: one of the copies created for another splitscreen player.",
  reload_materials: "Source 1 flag: changing it reloads materials.",
  reload_textures: "Source 1 flag: changing it reloads textures.",
  material_system_thread: "Source 1 flag: read from the material system thread.",
  archive_xbox: "Source 1 flag: saved to the config file on Xbox.",
  accessible_from_threads:
    "Source 1 flag: may be read from other threads, used to debug material system thread cvars.",
};

export function flagDescription(flag: string): string | undefined {
  // The dumper writes flags without a name by bit number
  if (flag.startsWith("flag_")) {
    return "A flag without a known name, shown by its bit number.";
  }

  return FLAG_DESCRIPTIONS[flag];
}
