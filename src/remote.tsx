import { Focusable, GamepadButton, GamepadEvent, Navigation } from "@decky/ui";
import { useEffect } from "react";

import { control, press, RemoteKey } from "./backend";
import { useGlobalState } from "./globalState";
import { REMOTE_HINT_HEIGHT, ViewMode } from "./util";

const DIRECTIONS: { [button: number]: RemoteKey } = {
    [GamepadButton.DIR_UP]: 'up',
    [GamepadButton.DIR_DOWN]: 'down',
    [GamepadButton.DIR_LEFT]: 'left',
    [GamepadButton.DIR_RIGHT]: 'right',
};

// Steam keeps gamepad focus here, the TV app receives the buttons as key presses.
export const Remote = () => {
    const [, setGlobalState] = useGlobalState();

    useEffect(() => {
        setGlobalState(state => ({ ...state, viewMode: ViewMode.Remote, hidden: false }));

        return () => setGlobalState(state => ({
            ...state,
            viewMode: state.viewMode == ViewMode.Remote
                ? ViewMode.Picture
                : state.viewMode
        }));
    }, []);

    const handled = (evt: GamepadEvent, action: () => void) => {
        evt.stopPropagation();
        action();
    };

    return <Focusable
        autoFocus
        noFocusRing
        style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'flex-end',
            background: '#000'
        }}
        onGamepadDirection={evt => handled(evt, () => {
            const key = DIRECTIONS[evt.detail.button];
            if (key) {
                press(key);
            }
        })}
        onOKButton={evt => handled(evt, () => press('select'))}
        onCancelButton={evt => handled(evt, () => press('back'))}
        onSecondaryButton={evt => handled(evt, () => control('toggle'))}
        onOptionsButton={evt => handled(evt, () => Navigation.NavigateBack())}
        onMenuButton={evt => handled(evt, () => Navigation.NavigateBack())}>
        <div style={{
            width: '100%',
            height: REMOTE_HINT_HEIGHT,
            lineHeight: `${REMOTE_HINT_HEIGHT}px`,
            textAlign: 'center',
            fontSize: 14
        }}>
            D-pad navigate · A select · B back · X play/pause · Y exit
        </div>
    </Focusable>;
}
