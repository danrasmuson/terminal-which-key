import { spawn, spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import type { Action, PaneAction, TabAction } from './types.js';

/**
 * Dispatch the chosen action. This is called *after* the Ink app has
 * unmounted and the terminal has been restored.
 *
 * Contract:
 *   - For `run`: spawn the command with stdio inherited. The current
 *     (popup) pane *becomes* the command. We exit with the child's exit
 *     code; herdr closes the temporary pane when the command exits
 *     (that's how `[[keys.command]] type = "pane"` popups work).
 *
 *   - For `pane`, `tab`, `herdr`: shell out to `herdr` to create the new
 *     pane/tab/perform the action, then exit 0. Our popup pane closes
 *     because this process itself exits.
 */
export function dispatch(action: Action): never {
	switch (action.kind) {
		case 'run':
			return execRun(action.cmd, action.cwd);
		case 'pane':
			return execPane(action);
		case 'tab':
			return execTab(action);
		case 'herdr':
			return execHerdr(action.args);
	}
}

/* -------------------------------------------------------------------- run */

function execRun(cmd: string, cwd?: string): never {
	const child = spawn('sh', ['-c', cmd], {
		stdio: 'inherit',
		cwd: cwd || homedir(),
		env: process.env,
	});
	child.on('exit', (code, signal) => {
		if (signal) process.kill(process.pid, signal);
		else process.exit(code ?? 0);
	});
	child.on('error', (err) => {
		console.error(`terminal-which-key: failed to spawn: ${err.message}`);
		process.exit(127);
	});
	// Block the event loop; child handlers will exit the process.
	return new Promise<never>(() => {}) as never;
}

/* ------------------------------------------------------------------ herdr */

function execHerdr(args: string[]): never {
	const result = spawnSync('herdr', args, {
		stdio: 'inherit',
		env: process.env,
	});
	if (result.error) {
		console.error(
			`terminal-which-key: failed to invoke herdr: ${result.error.message}`,
		);
		process.exit(127);
	}
	process.exit(result.status ?? 0);
}

function execPane(a: PaneAction): never {
	// herdr pane split doesn't accept a trailing command, so we split
	// (inheriting the current tab), capture the new pane id from the JSON
	// output, then `herdr pane run <id> <cmd>` to fire the command.
	//
	// The user's popup which-key pane is closing at the same moment, so we
	// target the split at the current pane (which lives on some tab); the
	// split lands in that tab and stays open even after our popup dies.
	const splitArgs = ['pane', 'split'];
	if (a.direction) splitArgs.push('--direction', a.direction);
	else splitArgs.push('--direction', 'down');
	if (a.cwd) splitArgs.push('--cwd', a.cwd);
	splitArgs.push('--focus');

	const split = spawnSync('herdr', splitArgs, {
		env: process.env,
		encoding: 'utf8',
	});
	if (split.status !== 0) {
		console.error(
			`terminal-which-key: herdr pane split failed: ${split.stderr?.trim() ?? ''}`,
		);
		process.exit(split.status ?? 1);
	}
	const paneId = extractId(split.stdout);
	if (!paneId) {
		console.error(
			`terminal-which-key: could not parse pane id from herdr pane split output`,
		);
		process.exit(1);
	}
	const run = spawnSync('herdr', ['pane', 'run', paneId, a.cmd], {
		stdio: 'inherit',
		env: process.env,
	});
	process.exit(run.status ?? 0);
}

function execTab(a: TabAction): never {
	const args = ['tab', 'create'];
	if (a.cwd) args.push('--cwd', a.cwd);
	if (a.name) args.push('--label', a.name);
	args.push('--focus');

	const tab = spawnSync('herdr', args, {
		env: process.env,
		encoding: 'utf8',
	});
	if (tab.status !== 0) {
		console.error(
			`terminal-which-key: herdr tab create failed: ${tab.stderr?.trim() ?? ''}`,
		);
		process.exit(tab.status ?? 1);
	}
	if (!a.cmd) process.exit(0);

	// After creating a tab, herdr focuses it; its default pane is the new
	// current pane. Run the command in that pane.
	const cur = spawnSync('herdr', ['pane', 'current'], {
		env: process.env,
		encoding: 'utf8',
	});
	const paneId = extractId(cur.stdout);
	if (!paneId) {
		console.error(
			`terminal-which-key: could not resolve new tab's pane id`,
		);
		process.exit(1);
	}
	const run = spawnSync('herdr', ['pane', 'run', paneId, a.cmd], {
		stdio: 'inherit',
		env: process.env,
	});
	process.exit(run.status ?? 0);
}

/** Pull an id/pane_id/tab_id out of herdr's JSON-ish CLI output. */
function extractId(out: string | undefined): string | null {
	if (!out) return null;
	// Try full JSON parse first.
	try {
		const j = JSON.parse(out);
		if (typeof j === 'string') return j;
		if (j && typeof j === 'object') {
			for (const k of ['pane_id', 'id', 'tab_id']) {
				const v = (j as Record<string, unknown>)[k];
				if (typeof v === 'string' && v.length > 0) return v;
			}
		}
	} catch {
		/* fall through */
	}
	// Fallback: regex sniff.
	const m = out.match(/"(?:pane_id|tab_id|id)"\s*:\s*"([^"]+)"/);
	if (m) return m[1];
	const trimmed = out.trim();
	if (/^[A-Za-z0-9._:-]+$/.test(trimmed)) return trimmed;
	return null;
}
