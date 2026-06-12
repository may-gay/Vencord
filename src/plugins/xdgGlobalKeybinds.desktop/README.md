# XDG Global Keybinds

Adds global mute and deafen shortcuts through the XDG GlobalShortcuts portal. This is useful on Wayland compositors such as Hyprland where Discord's normal global keybind path does not work.

## Hyprland

Add bindings like these to your Hyprland config:

```ini
bind = SUPERSHIFT, A, global, :toggle_mute
bind = SUPERSHIFT, D, global, :toggle_deafen
```

Available shortcut ids:

- `toggle_mute`
- `toggle_deafen`
