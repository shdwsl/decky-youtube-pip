import { FaYoutube } from "react-icons/fa";
import { StateManager } from "cotton-box";
import { quickAccessMenuClasses } from "@decky/ui";
import { definePlugin, routerHook, } from "@decky/api";

import { PipOuter } from "./pip";
import { Remote } from "./remote";
import { Settings } from "./settings";
import { DEFAULT_BINDINGS, registerHotkeys } from "./hotkeys";
import { Position, REMOTE_ROUTE, ViewMode } from "./util";
import { State, GlobalContext } from "./globalState";

export default definePlugin(() => {
    const saved = JSON.parse(localStorage.getItem('youtube-pip') ?? '{}');

    const state = new StateManager<State>({
        viewMode: ViewMode.Closed,
        visible: true,
        hidden: false,
        position: Position.TopRight,
        margin: 30,
        size: 0.4,
        quality: 'hd720',
        hotkeys: true,
        ...saved,
        bindings: { ...DEFAULT_BINDINGS, ...saved.bindings }
    });

    state.watch(({ position, margin, size, quality, hotkeys, bindings }) =>
        localStorage.setItem('youtube-pip', JSON.stringify({ position, margin, size, quality, hotkeys, bindings })));

    routerHook.addGlobalComponent("YouTubePiP", () => {
        return <GlobalContext.Provider value={state}>
            <PipOuter />
        </GlobalContext.Provider>
    });

    routerHook.addRoute(REMOTE_ROUTE, () => {
        return <GlobalContext.Provider value={state}>
            <Remote />
        </GlobalContext.Provider>
    });

    const unregisterHotkeys = registerHotkeys(state);

    return {
        name: "YouTube PiP",
        titleView: <div className={quickAccessMenuClasses.Title}>YouTube PiP</div>,
        icon: <FaYoutube />,
        content:
            <GlobalContext.Provider value={state}>
                <Settings />
            </GlobalContext.Provider>,
        onDismount() {
            unregisterHotkeys();
            routerHook.removeRoute(REMOTE_ROUTE);
            routerHook.removeGlobalComponent("YouTubePiP");
        },
    };
});
