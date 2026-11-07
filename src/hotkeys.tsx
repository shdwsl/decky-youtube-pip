import { StateManager } from "cotton-box";

import { control } from "./backend";
import { State } from "./globalState";
import { ViewMode } from "./util";

// Steam Deck button bits, same layout as SDL's controller_constants.h
const L5 = 0x00008000;
const R5 = 0x00010000;
const L4 = 0x00000200;
const R4 = 0x00000400;

const SEEK_SECONDS = 10;

const pressedGrips = (ulButtons: number, ulUpperButtons: number) => ({
    l4: !!(ulUpperButtons & L4),
    r4: !!(ulUpperButtons & R4),
    l5: !!(ulButtons & L5),
    r5: !!(ulButtons & R5),
});

// Only chords of the back grips are used: games rarely bind them, and these
// buttons never reach the window itself while a game has input focus.
export const registerHotkeys = (state: StateManager<State>) => {
    let held = '';

    const onChord = (chord: string) => {
        switch (chord) {
            case 'l4+r4': control('toggle'); break;
            case 'l4+l5': control('seek', -SEEK_SECONDS); break;
            case 'r4+r5': control('seek', SEEK_SECONDS); break;
            case 'l5+r5': {
                const current = state.get();
                state.set({ ...current, hidden: !current.hidden });
            } break;
        }
    };

    const registration = (window as any).SteamClient?.Input?.RegisterForControllerStateChanges?.((changes: any[]) => {
        const { hotkeys, viewMode } = state.get();

        if (!hotkeys || viewMode == ViewMode.Closed) {
            return;
        }

        for (const { ulButtons, ulUpperButtons } of changes) {
            const grips = pressedGrips(ulButtons, ulUpperButtons);
            const chord = Object.entries(grips)
                .filter(([, pressed]) => pressed)
                .map(([name]) => name)
                .join('+');

            if (chord != held) {
                held = chord;
                onChord(chord);
            }
        }
    });

    return () => registration?.unregister();
}
