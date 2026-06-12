/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { IpcEvents } from "@shared/IpcEvents";
import { sessionBus, Variant } from "dbus-next";
import { BrowserWindow } from "electron";

const DESKTOP_BUS = "org.freedesktop.portal.Desktop";
const DESKTOP_PATH = "/org/freedesktop/portal/desktop";
const GLOBAL_SHORTCUTS_IFACE = "org.freedesktop.portal.GlobalShortcuts";
const REQUEST_IFACE = "org.freedesktop.portal.Request";
const SESSION_IFACE = "org.freedesktop.portal.Session";
const SHORTCUTS = [
    ["toggle_mute", { description: new Variant("s", "Toggle mute") }],
    ["toggle_deafen", { description: new Variant("s", "Toggle deafen") }],
] as const;

let bus: ReturnType<typeof sessionBus> | undefined;
let globalShortcuts: any;
let sessionHandle: string | undefined;
let startPromise: Promise<void> | undefined;
let onActivated: ((sessionHandle: string, shortcutId: string) => void) | undefined;

export function start() {
    if (startPromise) return startPromise;
    if (globalShortcuts && sessionHandle) return Promise.resolve();

    startPromise = connectGlobalShortcuts()
        .catch(error => {
            resetState();
            throw error;
        })
        .finally(() => {
            startPromise = undefined;
        });

    return startPromise;
}

export async function stop() {
    const currentBus = bus;
    const currentSessionHandle = sessionHandle;

    if (globalShortcuts && onActivated) {
        globalShortcuts.off?.("Activated", onActivated);
        globalShortcuts.removeListener?.("Activated", onActivated);
    }

    resetState();

    if (currentBus && currentSessionHandle) {
        try {
            const obj = await currentBus.getProxyObject(DESKTOP_BUS, currentSessionHandle);
            await obj.getInterface(SESSION_IFACE).Close();
        } catch (error) {
            console.warn("[XdgGlobalKeybinds] failed to close portal session", error);
        }
    }

    currentBus?.disconnect();
}

async function connectGlobalShortcuts() {
    const currentBus = bus = sessionBus();
    const obj = await currentBus.getProxyObject(DESKTOP_BUS, DESKTOP_PATH);
    const shortcuts = globalShortcuts = obj.getInterface(GLOBAL_SHORTCUTS_IFACE);
    const createSessionToken = makeToken("session");
    const createHandleToken = makeToken("create");

    const createRequestHandle: string = await shortcuts.CreateSession({
        handle_token: new Variant("s", createHandleToken),
        session_handle_token: new Variant("s", createSessionToken),
    });

    const response = await waitForRequestResponse(currentBus, createRequestHandle, 2000).catch(() => undefined);
    const responseSessionHandle = response?.session_handle;

    sessionHandle = typeof responseSessionHandle?.value === "string"
        ? responseSessionHandle.value
        : getSessionHandleFromRequestHandle(createRequestHandle, createSessionToken);

    if (!sessionHandle) throw new Error("could not create XDG global shortcuts session");

    onActivated = (_sessionHandle, shortcutId) => {
        if (_sessionHandle !== sessionHandle) return;
        broadcastShortcut(shortcutId);
    };

    shortcuts.on("Activated", onActivated);

    const bindRequestHandle: string = await shortcuts.BindShortcuts(
        sessionHandle,
        SHORTCUTS,
        "",
        { handle_token: new Variant("s", makeToken("bind")) },
    );

    waitForRequestResponse(currentBus, bindRequestHandle).catch(error => {
        console.warn("[XdgGlobalKeybinds] shortcut binding was not completed", error);
    });
}

async function waitForRequestResponse(currentBus: ReturnType<typeof sessionBus>, requestHandle: string, timeoutMs?: number) {
    const obj = await currentBus.getProxyObject(DESKTOP_BUS, requestHandle);
    const request = obj.getInterface(REQUEST_IFACE);

    return await new Promise<Record<string, Variant>>((resolve, reject) => {
        let timeout: ReturnType<typeof setTimeout> | undefined;

        const cleanup = () => {
            if (timeout) clearTimeout(timeout);
        };

        if (timeoutMs != null) {
            timeout = setTimeout(() => {
                cleanup();
                reject(new Error("timed out waiting for portal response"));
            }, timeoutMs);
        }

        request.once("Response", (response: number, results: Record<string, Variant>) => {
            cleanup();

            if (response !== 0) {
                reject(new Error(`portal request failed with response ${response}`));
                return;
            }

            resolve(results);
        });
    });
}

function broadcastShortcut(shortcutId: string) {
    for (const win of BrowserWindow.getAllWindows()) {
        if (win.isDestroyed() || win.webContents.isDestroyed()) continue;

        win.webContents.postMessage(IpcEvents.XDG_GLOBAL_KEYBIND_ACTIVATED, shortcutId);
    }
}

function makeToken(prefix: string) {
    const random = Math.random().toString(36).slice(2);
    return `vencord_xdg_global_keybinds_${prefix}_${Date.now().toString(36)}_${random}`;
}

function getSessionHandleFromRequestHandle(requestHandle: string, sessionToken: string) {
    const sender = requestHandle.match(/\/request\/([^/]+)\//)?.[1];
    if (!sender) return undefined;

    return `/org/freedesktop/portal/desktop/session/${sender}/${sessionToken}`;
}

function resetState() {
    bus = undefined;
    globalShortcuts = undefined;
    sessionHandle = undefined;
    onActivated = undefined;
}
