import { addEventListener, removeEventListener } from "@decky/api";
import { StateManager } from "cotton-box";

import { control, press } from "./backend";
import { Bindings, chordDetector, chordRecorder, pressedButtons } from "./chords";
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

export const DEFAULT_BINDINGS: Bindings = {};

type Recorder = ReturnType<typeof chordRecorder>;

let pressed: string[] = [];
let recording: { recorder: Recorder, onDone: (chord: string) => void } | null = null;

export const recordChord = (onDone: (chord: string) => void) => {
    const current = { recorder: chordRecorder(pressed), onDone };
    recording = current;

    return () => {
        if (recording == current) {
            recording = null;
        }
    };
}

export const registerHotkeys = (state: StateManager<State>) => {
    const detect = chordDetector();

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

    const listener = addEventListener<[low: number, high: number]>("buttons", (low, high) => {
        pressed = pressedButtons(low, high);
        const chord = detect(pressed);

        if (recording) {
            const { recorder, onDone } = recording;
            const recorded = recorder(pressed);

            if (recorded) {
                recording = null;
                onDone(recorded);
            }
            return;
        }

        const { bindings, hotkeys, viewMode } = state.get();

        if (chord && hotkeys && viewMode != ViewMode.Remote) {
            const action = Object.keys(bindings).find(action => bindings[action] == chord);
            if (action) {
                actions[action]?.();
            }
        }
    });

    return () => removeEventListener("buttons", listener);
}
