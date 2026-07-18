import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type {
	Action,
	Config,
	Entry,
	LeafEntry,
	RawLeafEntry,
	SubmenuEntry,
} from './types.js';

/**
 * Resolve the config file path.
 *
 * Search order:
 *   1. $TERMINAL_WHICH_KEY_CONFIG (explicit override)
 *   2. $ZELLIJ_WHICH_KEY_CONFIG (legacy override, still honored)
 *   3. $XDG_CONFIG_HOME/terminal-which-key/config.yaml
 *   4. ~/.config/terminal-which-key/config.yaml
 */
export function resolveConfigPath(): string {
	const override =
		process.env.TERMINAL_WHICH_KEY_CONFIG ||
		process.env.ZELLIJ_WHICH_KEY_CONFIG;
	if (override) return override;
	const xdg = process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
	return join(xdg, 'terminal-which-key', 'config.yaml');
}

export class ConfigError extends Error {
	constructor(message: string, public readonly path?: string) {
		super(message);
		this.name = 'ConfigError';
	}
}

export function loadConfig(path: string = resolveConfigPath()): Config {
	if (!existsSync(path)) {
		throw new ConfigError(`config file not found: ${path}`, path);
	}
	let raw: string;
	try {
		raw = readFileSync(path, 'utf8');
	} catch (err) {
		throw new ConfigError(
			`failed to read config: ${(err as Error).message}`,
			path,
		);
	}
	let data: unknown;
	try {
		data = parseYaml(raw);
	} catch (err) {
		throw new ConfigError(
			`failed to parse YAML: ${(err as Error).message}`,
			path,
		);
	}
	return normalizeConfig(data, path);
}

/* ------------------------------------------------------------ normalization */

function normalizeConfig(data: unknown, path: string): Config {
	if (!data || typeof data !== 'object') {
		throw new ConfigError('config must be a YAML mapping', path);
	}
	const cfg = data as Record<string, unknown>;
	if (!cfg.keys || typeof cfg.keys !== 'object') {
		throw new ConfigError('config must have a `keys` mapping', path);
	}
	return {
		title: typeof cfg.title === 'string' ? cfg.title : undefined,
		keys: normalizeKeys(
			cfg.keys as Record<string, unknown>,
			['keys'],
			path,
		),
	};
}

function normalizeKeys(
	keys: Record<string, unknown>,
	trail: string[],
	path: string,
): Record<string, Entry> {
	const out: Record<string, Entry> = {};
	for (const [k, raw] of Object.entries(keys)) {
		if (k.length === 0) {
			throw new ConfigError(`empty key at ${trail.join('.')}`, path);
		}
		out[k] = normalizeEntry(raw, [...trail, k], path);
	}
	return out;
}

function normalizeEntry(
	raw: unknown,
	trail: string[],
	path: string,
): Entry {
	if (!raw || typeof raw !== 'object') {
		throw new ConfigError(
			`entry at ${trail.join('.')} must be a mapping`,
			path,
		);
	}
	const r = raw as Record<string, unknown>;
	const isSubmenu = r.keys !== undefined;
	if (isSubmenu) {
		if (typeof r.keys !== 'object' || r.keys === null) {
			throw new ConfigError(
				`entry at ${trail.join('.')}.keys must be a mapping`,
				path,
			);
		}
		const sub: SubmenuEntry = {
			label: typeof r.label === 'string' ? r.label : undefined,
			desc: typeof r.desc === 'string' ? r.desc : undefined,
			keys: normalizeKeys(
				r.keys as Record<string, unknown>,
				[...trail, 'keys'],
				path,
			),
		};
		return sub;
	}
	// Leaf: must have exactly one action field.
	const action = normalizeAction(r as RawLeafEntry, trail, path);
	const leaf: LeafEntry = {
		label: typeof r.label === 'string' ? r.label : undefined,
		desc: typeof r.desc === 'string' ? r.desc : undefined,
		action,
	};
	return leaf;
}

function normalizeAction(
	r: RawLeafEntry,
	trail: string[],
	path: string,
): Action {
	const present: string[] = [];
	if (r.run !== undefined) present.push('run');
	if (r.pane !== undefined) present.push('pane');
	if (r.tab !== undefined) present.push('tab');
	if (r.herdr !== undefined) present.push('herdr');
	if (present.length === 0) {
		throw new ConfigError(
			`entry at ${trail.join('.')} needs an action ` +
				`(one of: run, pane, tab, herdr, keys)`,
			path,
		);
	}
	if (present.length > 1) {
		throw new ConfigError(
			`entry at ${trail.join('.')} has conflicting actions: ` +
				present.join(', '),
			path,
		);
	}

	if (r.run !== undefined) {
		if (typeof r.run !== 'string') {
			throw new ConfigError(
				`entry at ${trail.join('.')}.run must be a string`,
				path,
			);
		}
		return { kind: 'run', cmd: r.run, cwd: r.cwd };
	}

	if (r.pane !== undefined) {
		const p =
			typeof r.pane === 'string' ? { cmd: r.pane } : { ...r.pane };
		if (typeof p.cmd !== 'string') {
			throw new ConfigError(
				`entry at ${trail.join('.')}.pane needs a \`cmd\` string`,
				path,
			);
		}
		return { kind: 'pane', ...p } as Action;
	}

	if (r.tab !== undefined) {
		const t =
			typeof r.tab === 'string' ? { cmd: r.tab } : { ...r.tab };
		return { kind: 'tab', ...t } as Action;
	}

	if (r.herdr !== undefined) {
		const args = Array.isArray(r.herdr)
			? r.herdr
			: typeof r.herdr === 'string'
				? r.herdr.split(/\s+/).filter(Boolean)
				: null;
		if (!args || !args.every((a) => typeof a === 'string')) {
			throw new ConfigError(
				`entry at ${trail.join('.')}.herdr must be a string ` +
					`or list of strings`,
				path,
			);
		}
		return { kind: 'herdr', args };
	}

	// Unreachable.
	throw new ConfigError(`entry at ${trail.join('.')} is malformed`, path);
}
