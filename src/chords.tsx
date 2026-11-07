// Steam Deck button bits, same layout as SDL's SDL_hidapi_steamdeck.c. Steam and
// QAM are left out because they open menus, touch sensors because resting a
// thumb on a stick or pad is not a press.
const LOW_BUTTONS: [string, number][] = [
    ['A', 0x00000080],
    ['B', 0x00000020],
    ['X', 0x00000040],
    ['Y', 0x00000010],
    ['L1', 0x00000008],
    ['R1', 0x00000004],
    ['L2', 0x00000002],
    ['R2', 0x00000001],
    ['Up', 0x00000100],
    ['Down', 0x00000800],
    ['Left', 0x00000400],
    ['Right', 0x00000200],
    ['View', 0x00001000],
    ['Menu', 0x00004000],
    ['L3', 0x00400000],
    ['R3', 0x04000000],
    ['L5', 0x00008000],
    ['R5', 0x00010000],
    ['Left Pad', 0x00020000],
    ['Right Pad', 0x00040000],
];

const HIGH_BUTTONS: [string, number][] = [
    ['L4', 0x00000200],
    ['R4', 0x00000400],
];

const ORDER = [...LOW_BUTTONS, ...HIGH_BUTTONS].map(([name]) => name);

export const NOT_BOUND = '';

export type Bindings = { [action: string]: string };

const toChord = (buttons: string[]) =>
    ORDER.filter(name => buttons.includes(name)).join(' + ');

export const pressedButtons = (ulButtons: number, ulUpperButtons: number) => [
    ...LOW_BUTTONS.filter(([, bit]) => ulButtons & bit),
    ...HIGH_BUTTONS.filter(([, bit]) => ulUpperButtons & bit),
].map(([name]) => name);

// Reports a chord only when a button goes down, so that letting go of L4 + R4
// one button at a time does not trigger whatever is bound to L4 alone.
export const chordDetector = () => {
    let held: string[] = [];

    return (pressed: string[]) => {
        const grew = pressed.some(button => !held.includes(button));
        held = pressed;

        return grew ? toChord(pressed) : null;
    };
}

// Waits for everything to be released first: the A press that opened the
// recorder must not end up in the chord. Finishes when all buttons are let go.
export const chordRecorder = () => {
    let armed = false;
    const seen = new Set<string>();

    return (pressed: string[]) => {
        if (!armed) {
            armed = pressed.length == 0;
            return null;
        }

        pressed.forEach(button => seen.add(button));

        return pressed.length == 0 && seen.size > 0
            ? toChord([...seen])
            : null;
    };
}

export const bindChord = (bindings: Bindings, action: string, chord: string) => {
    const next = Object.fromEntries(Object.entries(bindings).map(([other, current]) =>
        [other, current == chord ? NOT_BOUND : current]));

    return { ...next, [action]: chord };
}
