// Configuration schema for terminal-which-key.
//
// The config is a tree of menus. Each node under `keys` is either a
// **submenu** (has nested `keys`) or a **leaf** (has exactly one action
// field: `run`, `pane`, `tab`, or `herdr`).
//
// Inspired by which-key.nvim's design: a leaf's rhs is a typed *action*
// rather than just "exec a string". This lets us spawn into a new pane,
// open a new tab, run arbitrary `herdr` CLI calls, etc., without
// coupling everything to "replace the current pane".

/* ---------------------------------------------------------------- actions */

/** Replace the current (floating) pane with the command. */
export interface RunAction {
	kind: 'run';
	cmd: string;
	cwd?: string;
}

/** Open the command in a new herdr pane, then close the which-key pane. */
export interface PaneAction {
	kind: 'pane';
	cmd: string;
	floating?: boolean;
	close_on_exit?: boolean;
	name?: string;
	cwd?: string;
	direction?: 'right' | 'down';
}

/** Open the command in a new herdr tab. */
export interface TabAction {
	kind: 'tab';
	cmd?: string;
	name?: string;
	cwd?: string;
	layout?: string;
}

/** Run an arbitrary `herdr <args>` command. */
export interface HerdrAction {
	kind: 'herdr';
	args: string[];
}

export type Action = RunAction | PaneAction | TabAction | HerdrAction;

/* ---------------------------------------------------------------- entries */

export interface LeafEntry {
	label?: string;
	desc?: string;
	action: Action;
}

export interface SubmenuEntry {
	label?: string;
	desc?: string;
	keys: Record<string, Entry>;
}

export type Entry = LeafEntry | SubmenuEntry;

export interface Config {
	title?: string;
	keys: Record<string, Entry>;
}

export function isSubmenu(entry: Entry): entry is SubmenuEntry {
	return (entry as SubmenuEntry).keys !== undefined;
}

export function isLeaf(entry: Entry): entry is LeafEntry {
	return (entry as LeafEntry).action !== undefined;
}

/* ---------------------------------------------------------------- raw input */

/**
 * Raw entry shape as it appears in YAML, before normalization. Each leaf
 * has exactly one of the action shorthand fields.
 */
export interface RawLeafEntry {
	label?: string;
	desc?: string;
	cwd?: string;

	/** Shorthand: `run: <cmd>` -> RunAction. */
	run?: string;

	/** `pane: <cmd>` or `pane: { cmd, floating?, ... }` -> PaneAction. */
	pane?: string | Omit<PaneAction, 'kind'>;

	/** `tab: <cmd>` or `tab: { cmd?, name?, ... }` -> TabAction. */
	tab?: string | Omit<TabAction, 'kind'>;

	/** `herdr: [args...]` -> HerdrAction. */
	herdr?: string[] | string;
}
