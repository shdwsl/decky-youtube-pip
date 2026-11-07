import { Focusable, GamepadEvent, ModalRoot, ModalRootProps } from "@decky/ui";
import { useEffect, useState } from "react";

import { bindChord } from "./chords";
import { useGlobalState } from "./globalState";
import { recordChord } from "./hotkeys";
import { modalWithState } from "./modal";

const RECORD_SECONDS = 10;

interface RecordModalProps extends ModalRootProps {
    action: string
    label: string
}

// There are no buttons on purpose: every gamepad button can be part of a chord.
export const RecordModal = ({ action, label, ...props }: RecordModalProps) => {
    const [, setGlobalState] = useGlobalState();
    const [seconds, setSeconds] = useState(RECORD_SECONDS);

    useEffect(() => {
        setGlobalState(state => ({ ...state, visible: false }));

        const stopRecording = recordChord(chord => {
            setGlobalState(state => ({ ...state, bindings: bindChord(state.bindings, action, chord) }));
            props.closeModal?.();
        });

        return () => {
            stopRecording();
            setGlobalState(state => ({ ...state, visible: true }));
        };
    }, []);

    useEffect(() => {
        if (seconds == 0) {
            props.closeModal?.();
            return;
        }

        const timeout = setTimeout(() => setSeconds(seconds - 1), 1000);
        return () => clearTimeout(timeout);
    }, [seconds]);

    const swallow = (evt: GamepadEvent) => evt.stopPropagation();

    return <ModalRoot {...props} bDisableBackgroundDismiss bHideCloseIcon>
        <Focusable
            autoFocus
            noFocusRing
            onOKButton={swallow}
            onCancelButton={swallow}
            onSecondaryButton={swallow}
            onOptionsButton={swallow}
            onMenuButton={swallow}>
            <h3>{label}</h3>
            <div>Hold the buttons you want, then let go of all of them.</div>
            <div style={{ opacity: 0.7, marginTop: 8 }}>Keeping the current binding in {seconds}s</div>
        </Focusable>
    </ModalRoot>;
}

export const RecordModalWithState = modalWithState(RecordModal);
