import { StateManager } from "cotton-box";

import { control, press } from "./backend";
import { Bindings, chordDetector, chordRecorder, NOT_BOUND, pressedButtons } from "./chords";
import { State } from "./globalState";
import { ViewMode } from "./util";

const SEEK_SECONDS = 10;
const VOLUME_STEP = 10;

export const HOTKEY_ACTIONS = [
    { id: 'toggle', label: 'Play / Pause' },
    { id: 'seekBack', label: 'Back 10s' },
    { id: 'seekForward', label: 'Forward 10s' },
    { id: 'next', label: 'Next Video' },
    { id: 'restart', label: 'Restart Video' },
    { id: 'volumeUp', label: 'Volume Up' },
    { id: 'volumeDown', label: 'Volume Down' },
    { id: 'hide', label: 'Hide Window' },
];

// Back grips only: games rarely bind them.
export const DEFAULT_BINDINGS: Bindings = {
    toggle: 'L4 + R4',
    seekBack: 'L5 + L4',
    seekForward: 'R5 + R4',
    next: NOT_BOUND,
    restart: NOT_BOUND,
    volumeUp: NOT_BOUND,
    volumeDown: NOT_BOUND,
    hide: 'L5 + R5',
};

interface Recording {
    recorders: { [controller: number]: ReturnType<typeof chordRecorder> }
    onDone: (chord: string) => void
}

let recording: Recording | null = null;

export const recordChord = (onDone: (chord: string) => void) => {
    const current = { recorders: {}, onDone };
    recording = current;

    return () => {
        if (recording == current) {
            recording = null;
        }
    };
}

const record = ({ recorders, onDone }: Recording, controller: number, pressed: string[]) => {
    recorders[controller] ??= chordRecorder();
    const chord = recorders[controller](pressed);

    if (chord) {
        recording = null;
        onDone(chord);
    }
}

export const registerHotkeys = (state: StateManager<State>) => {
    const detectors: { [controller: number]: ReturnType<typeof chordDetector> } = {};

    const actions: { [action: string]: () => void } = {
        toggle: () => control('toggle'),
        seekBack: () => control('seek', -SEEK_SECONDS),
        seekForward: () => control('seek', SEEK_SECONDS),
        next: () => press('next'),
        restart: () => press('previous'),
        volumeUp: () => control('volumeBy', VOLUME_STEP),
        volumeDown: () => control('volumeBy', -VOLUME_STEP),
        hide: () => {
            const current = state.get();
            state.set({ ...current, hidden: !current.hidden });
        },
    };

    const registration = (window as any).SteamClient?.Input?.RegisterForControllerStateChanges?.((changes: any[]) => {
        const { bindings, hotkeys, viewMode } = state.get();

        for (const { unControllerIndex, ulButtons, ulUpperButtons } of changes) {
            const pressed = pressedButtons(ulButtons, ulUpperButtons);

            detectors[unControllerIndex] ??= chordDetector();
            const chord = detectors[unControllerIndex](pressed);

            if (recording) {
                record(recording, unControllerIndex, pressed);
            } else if (chord && hotkeys && viewMode != ViewMode.Closed && viewMode != ViewMode.Remote) {
                const action = Object.keys(bindings).find(action => bindings[action] == chord);
                if (action) {
                    actions[action]?.();
                }
            }
        }
    });

    return () => registration?.unregister();
}
