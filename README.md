# terminal-which-key

A small which-key style leader-key launcher for terminal multiplexers,
rendered with [Ink](https://github.com/vadimdemedes/ink). Currently
targets [herdr](https://herdr.dev) as its backing multiplexer.

- YAML config, one entry per key.
- Typed leaf actions: `run` (replace the current pane), `pane` (open a
  new pane), `tab` (open a new tab), `herdr` (arbitrary `herdr` CLI
  call).
- Submenus via a nested `keys:` map. Backspace pops, Esc/Ctrl+C
  cancels.

It's meant to be launched inside a **temporary popup pane** bound to a
leader chord (e.g. `Ctrl+Space`) via herdr's `[[keys.command]]`
mechanism. When you pick a leaf, that popup pane becomes the target
command (or it dispatches to `herdr` and then exits, which closes the
popup).

> Historical note: this project used to be `zellij-which-key`. The
> `ZELLIJ_WHICH_KEY_CONFIG` env var is still honored for legacy configs.

## Install

```bash
git clone https://github.com/danrasmuson/terminal-which-key
cd terminal-which-key
pnpm install
pnpm build
pnpm link --global       # exposes `terminal-which-key` on PATH
```

## Config

Drop a YAML config at `~/.config/terminal-which-key/config.yaml`:

```yaml
title: Leader

keys:
  o:
    label: open
    keys:
      c:
        label: calendar
        run: calendar-tui
      l:
        label: lazygit
        pane:
          cmd: lazygit
          direction: down
```

Every leaf must have **exactly one** action field:

| field   | value                                | behavior                                                                  |
| ------- | ------------------------------------ | ------------------------------------------------------------------------- |
| `run`   | string                               | replace the popup pane with the command                                   |
| `pane`  | string \| `{ cmd, direction?, ... }` | split a new herdr pane in the current tab via `herdr pane split`          |
| `tab`   | string \| `{ cmd?, name?, ... }`     | open a new herdr tab via `herdr tab create`                               |
| `herdr` | list of strings                      | run `herdr <args...>` directly (session detach, tab focus, etc.)          |

Submenus have a nested `keys:` map. Each entry may set `label` and
`desc` for the palette UI.

See `config.example.yaml` for a fuller example.

The config path can be overridden with `--config PATH` or
`$TERMINAL_WHICH_KEY_CONFIG` (or the legacy `$ZELLIJ_WHICH_KEY_CONFIG`).

## Wire it into herdr

In `~/.config/herdr/config.toml`:

```toml
[[keys.command]]
key = "ctrl+space"
type = "pane"
command = "terminal-which-key"
```

`type = "pane"` opens a temporary pane and closes it when the command
exits — perfect popup behavior for a leader launcher.

If you also want a normal prefix chord (e.g. `prefix+Space`), add a
second `[[keys.command]]` with `key = "prefix+space"`.

## Screenshots

`./scripts/screenshot.sh` regenerates `assets/demo-*.png` from the
output of `terminal-which-key --demo <path>` (a non-interactive ANSI
dump of a given menu path). Requires
[freeze](https://github.com/charmbracelet/freeze) and a current build.

## Status

Small and works for my daily use. Bindings are re-read every launch
(no rebuild needed after config edits). Actions supported: `run`,
`pane`, `tab`, `herdr`.
