#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import App from './App.js';
import { dispatch } from './actions.js';
import { loadConfig, resolveConfigPath, ConfigError } from './config.js';
import { renderDemo } from './demo.js';
import type { Action, Entry, SubmenuEntry } from './types.js';
import { isSubmenu } from './types.js';

process.on('unhandledRejection', (error) => {
	console.error('Unhandled promise rejection:', error);
	process.exit(1);
});

// A terminal multiplexer's server often inherits a thin PATH that misses
// user-local bin dirs (e.g. ~/.local/share/pnpm). Make sure the dirs we
// care about are visible so leaf commands can be resolved.
function extendPath(): void {
	const home = homedir();
	const extra = [
		join(home, '.local/bin'),
		join(home, '.local/share/pnpm'),
		join(home, '.local/share/omarchy/bin'),
		join(home, '.local/share/mise/installs/node/latest/bin'),
		join(home, '.cargo/bin'),
		join(home, 'bin'),
	];
	const current = (process.env.PATH || '').split(delimiter);
	const seen = new Set(current);
	const toAdd = extra.filter((d) => existsSync(d) && !seen.has(d));
	if (toAdd.length > 0) {
		process.env.PATH = [...toAdd, ...current].join(delimiter);
	}
}
extendPath();

function printHelp(): void {
	console.log(`terminal-which-key — leader-key launcher for terminal multiplexers (herdr)

Usage:
  terminal-which-key [--config PATH] [--demo PATH]

Options:
  --config PATH   Path to YAML config (default: $XDG_CONFIG_HOME/terminal-which-key/config.yaml)
  --demo PATH     Print the menu at PATH (e.g. "" for root, "o" for the
                  "open" submenu) as ANSI to stdout and exit. Used by the
                  screenshot script.
  --path PATH     Start the interactive launcher already descended into the
                  submenu at PATH (e.g. "w" opens the "workspace" submenu).
  -h, --help      Show this help

Env:
  TERMINAL_WHICH_KEY_CONFIG   Same as --config (ZELLIJ_WHICH_KEY_CONFIG still honored)

Config format: see README.
`);
}

interface Args {
	configPath?: string;
	demoPath?: string[];
	startPath?: string[];
}

function parseArgs(argv: string[]): Args {
	const out: Args = {};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '-h' || a === '--help') {
			printHelp();
			process.exit(0);
		} else if (a === '--config') {
			out.configPath = argv[++i];
		} else if (a.startsWith('--config=')) {
			out.configPath = a.slice('--config='.length);
		} else if (a === '--demo') {
			out.demoPath = (argv[++i] ?? '').split('').filter(Boolean);
		} else if (a.startsWith('--demo=')) {
			out.demoPath = a.slice('--demo='.length).split('').filter(Boolean);
		} else if (a === '--path') {
			out.startPath = (argv[++i] ?? '').split('').filter(Boolean);
		} else if (a.startsWith('--path=')) {
			out.startPath = a.slice('--path='.length).split('').filter(Boolean);
		} else {
			console.error(`unknown argument: ${a}`);
			process.exit(2);
		}
	}
	return out;
}

/** Validate that `path` descends only through submenus in `config`. */
function validateSubmenuPath(
	config: { keys: Record<string, Entry> },
	path: string[],
): string | null {
	let menu: SubmenuEntry = { keys: config.keys };
	for (let i = 0; i < path.length; i++) {
		const k = path[i];
		const entry = menu.keys[k];
		if (!entry) return `no entry for key ${JSON.stringify(k)} at path ${JSON.stringify(path.slice(0, i + 1).join(''))}`;
		if (!isSubmenu(entry)) return `entry at ${JSON.stringify(path.slice(0, i + 1).join(''))} is a leaf, not a submenu`;
		menu = entry;
	}
	return null;
}

async function main() {
	const { configPath, demoPath, startPath } = parseArgs(process.argv.slice(2));

	let config;
	try {
		config = loadConfig(configPath ?? resolveConfigPath());
	} catch (err) {
		if (err instanceof ConfigError) {
			console.error(`terminal-which-key: ${err.message}`);
			if (err.path) console.error(`  path: ${err.path}`);
			process.exit(1);
		}
		throw err;
	}

	if (demoPath !== undefined) {
		process.stdout.write(renderDemo(config, demoPath));
		process.exit(0);
	}

	if (startPath && startPath.length > 0) {
		const err = validateSubmenuPath(config, startPath);
		if (err) {
			console.error(`terminal-which-key: --path invalid: ${err}`);
			process.exit(2);
		}
	}

	let chosen: { action: Action; path: string[] } | null = null;

	const app = render(
		<App
			config={config}
			initialPath={startPath}
			onSelect={(leaf) => {
				chosen = leaf;
			}}
		/>,
		{ exitOnCtrlC: false },
	);

	await app.waitUntilExit();
	// Clear the terminal so the leader UI doesn't bleed into the launched
	// command's first frame.
	process.stdout.write('\x1b[2J\x1b[H');

	if (!chosen) {
		// Cancelled.
		process.exit(0);
	}

	dispatch((chosen as { action: Action }).action);
}

main();
