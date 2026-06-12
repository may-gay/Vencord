/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import definePlugin, { PluginNative } from "@utils/types";
import { findByPropsLazy } from "@webpack";

const Native = VencordNative.pluginHelpers.XdgGlobalKeybinds as PluginNative<typeof import("./native")>;
const VoiceActions = findByPropsLazy("toggleSelfMute", "toggleSelfDeaf");

const shortcutActions = new Map<string, () => void>([
    ["toggle_mute", toggleMute],
    ["toggle_deafen", toggleDeafen],
]);

function onShortcutActivated(shortcutId: string) {
    const action = shortcutActions.get(shortcutId);

    if (!action) {
        console.warn(`[XdgGlobalKeybinds] no action defined for shortcut ${shortcutId}`);
        return;
    }

    action();
}

export default definePlugin({
    name: "XdgGlobalKeybinds",
    description: "Adds XDG portal global shortcuts for Linux compositors like Hyprland.",
    tags: ["Shortcuts", "Voice"],
    authors: [Devs.khald0r],

    start() {
        VencordNative.xdgGlobalKeybinds.addActivateListener(onShortcutActivated);
        Native.start().catch(error => console.error("[XdgGlobalKeybinds] failed to start", error));
    },

    stop() {
        VencordNative.xdgGlobalKeybinds.removeActivateListener(onShortcutActivated);
        Native.stop().catch(error => console.error("[XdgGlobalKeybinds] failed to stop", error));
    },
});

function toggleMute() {
    try {
        VoiceActions.toggleSelfMute();
        return;
    } catch (error) {
        console.warn("[XdgGlobalKeybinds] falling back to mute button click", error);
    }

    clickVoiceButton("Mute");
}

function toggleDeafen() {
    try {
        VoiceActions.toggleSelfDeaf();
        return;
    } catch (error) {
        console.warn("[XdgGlobalKeybinds] falling back to deafen button click", error);
    }

    clickVoiceButton("Deafen");
}

function clickVoiceButton(label: string) {
    document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"][role="switch"]`)?.click();
}
