import {
    PanelSection,
    PanelSectionRow,
    DialogButton,
    DropdownItem,
    Focusable,
    Navigation,
    SliderField,
    showModal,
    ButtonItem,
    ToggleField
} from "@decky/ui";
import { ReactNode, useEffect, useState } from "react";
import { FaBackward, FaForward, FaPause, FaPlay, FaStepBackward, FaStepForward } from "react-icons/fa";

import { control, getStatus, press, Status } from "./backend";
import { bindChord, NOT_BOUND } from "./chords";
import { useGlobalState } from "./globalState";
import { DEFAULT_BINDINGS, HOTKEY_ACTIONS } from "./hotkeys";
import { LinkModalWithState } from "./linkModal";
import { RecordModalWithState } from "./recordModal";
import { formatTime, Position, REMOTE_ROUTE, ViewMode } from "./util";

const SEEK_SECONDS = 10;

const useStatus = () => {
    const [status, setStatus] = useState<Status>({ connected: false });

    useEffect(() => {
        const refresh = () => getStatus().then(setStatus);
        refresh();

        const interval = setInterval(refresh, 1000);
        return () => clearInterval(interval);
    }, []);

    return status;
}

const ControlButton = ({ onClick, children }: { onClick: () => void, children: ReactNode }) =>
    <DialogButton
        style={{ minWidth: 0, flex: 1, height: 40, padding: 0 }}
        onClick={onClick}>
        {children}
    </DialogButton>;

const NowPlaying = ({ status }: { status: Status }) => {
    if (!status.connected) {
        return <div>Connecting to player…</div>;
    }

    if (!status.title && !status.duration) {
        return <div>Nothing playing. Use Browse YouTube to pick a video.</div>;
    }

    return <div style={{ fontSize: 12, lineHeight: '16px' }}>
        <div style={{ fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {status.ad ? 'Ad' : status.title}
        </div>
        <div style={{ opacity: 0.7 }}>
            {status.live
                ? 'Live'
                : `${formatTime(status.time ?? 0)} / ${formatTime(status.duration ?? 0)}`}
            {!!status.height && ` · ${status.height}p`}
        </div>
    </div>;
}

export const Settings = () => {
    const [{ viewMode, position, margin, size, quality, hidden, hotkeys, bindings }, setGlobalState, stateContext] = useGlobalState();
    const status = useStatus();

    const positionOptions = [
        { label: 'Top Left', data: Position.TopLeft },
        { label: 'Top', data: Position.Top },
        { label: 'Top Right', data: Position.TopRight },
        { label: 'Right', data: Position.Right },
        { label: 'Bottom Right', data: Position.BottomRight },
        { label: 'Bottom', data: Position.Bottom },
        { label: 'Bottom Left', data: Position.BottomLeft },
        { label: 'Left', data: Position.Left },
    ];

    const qualityOptions = [
        { label: 'Auto', data: 'auto' },
        { label: '480p', data: 'large' },
        { label: '720p', data: 'hd720' },
        { label: '1080p', data: 'hd1080' },
    ];

    const hideDuringMenu = () => setGlobalState(state => ({ ...state, visible: false }));

    if (viewMode == ViewMode.Closed) {
        return <PanelSection>
            <PanelSectionRow>
                <ButtonItem
                    bottomSeparator="none"
                    layout="below"
                    onClick={() => setGlobalState(state => ({
                        ...state,
                        hidden: false,
                        viewMode: ViewMode.Picture
                    }))}>
                    Open YouTube
                </ButtonItem>
            </PanelSectionRow>
        </PanelSection>;
    }

    return <>
        <PanelSection title="Playback">
            <PanelSectionRow>
                <ButtonItem
                    layout="below"
                    onClick={() => setGlobalState(state => ({
                        ...state,
                        viewMode: ViewMode.Closed
                    }))}>
                    Close
                </ButtonItem>
            </PanelSectionRow>
            <PanelSectionRow>
                <NowPlaying status={status} />
            </PanelSectionRow>
            <PanelSectionRow>
                <Focusable style={{ display: 'flex', gap: 4 }} flow-children="horizontal">
                    <ControlButton onClick={() => press('previous')}><FaStepBackward /></ControlButton>
                    <ControlButton onClick={() => control('seek', -SEEK_SECONDS)}><FaBackward /></ControlButton>
                    <ControlButton onClick={() => control('toggle')}>
                        {status.state == 'playing' ? <FaPause /> : <FaPlay />}
                    </ControlButton>
                    <ControlButton onClick={() => control('seek', SEEK_SECONDS)}><FaForward /></ControlButton>
                    <ControlButton onClick={() => press('next')}><FaStepForward /></ControlButton>
                </Focusable>
            </PanelSectionRow>
            <PanelSectionRow>
                <SliderField
                    label='Volume'
                    value={status.volume ?? 100}
                    min={0}
                    max={100}
                    step={5}
                    onChange={volume => control('volume', volume)} />
            </PanelSectionRow>
            <PanelSectionRow>
                <ButtonItem layout="below" disabled={viewMode == ViewMode.Remote} onClick={() => {
                    Navigation.Navigate(REMOTE_ROUTE);
                    Navigation.CloseSideMenus();
                }}>
                    Browse YouTube
                </ButtonItem>
            </PanelSectionRow>
            <PanelSectionRow>
                <ButtonItem layout="below" onClick={() => showModal(<LinkModalWithState value={stateContext} />)}>
                    Open Link
                </ButtonItem>
            </PanelSectionRow>
        </PanelSection>
        <PanelSection title="Window">
            <PanelSectionRow>
                <ToggleField
                    label='Hide Window'
                    description='Keeps the sound playing'
                    checked={hidden}
                    onChange={hidden => setGlobalState(state => ({ ...state, hidden }))} />
            </PanelSectionRow>
            <PanelSectionRow>
                <ToggleField
                    label='Expand'
                    checked={viewMode == ViewMode.Expand}
                    onChange={checked => setGlobalState(state => ({
                        ...state,
                        viewMode: checked
                            ? ViewMode.Expand
                            : ViewMode.Picture
                    }))} />
            </PanelSectionRow>
            {viewMode == ViewMode.Picture && <>
                <PanelSectionRow>
                    <DropdownItem
                        label='Position'
                        selectedOption={position}
                        rgOptions={positionOptions}
                        onMenuOpened={hideDuringMenu}
                        onChange={option => setGlobalState(state => ({
                            ...state,
                            visible: true,
                            position: option.data
                        }))} />
                </PanelSectionRow>
                <PanelSectionRow>
                    <SliderField
                        label='Size'
                        value={size}
                        onChange={size => setGlobalState(state => ({ ...state, size }))}
                        min={0.3}
                        max={0.6}
                        step={0.1}
                        notchCount={4}
                        notchTicksVisible={true}
                        notchLabels={[
                            { label: "S", notchIndex: 0, value: 0.3 },
                            { label: "M", notchIndex: 1, value: 0.4 },
                            { label: "L", notchIndex: 2, value: 0.5 },
                            { label: "XL", notchIndex: 3, value: 0.6 }
                        ]} />
                </PanelSectionRow>
                <PanelSectionRow>
                    <SliderField
                        label='Margin'
                        value={margin}
                        onChange={margin => setGlobalState(state => ({ ...state, margin }))}
                        min={0}
                        max={60}
                        step={15}
                        notchCount={3}
                        notchTicksVisible={true}
                        notchLabels={[
                            { label: "S", notchIndex: 0, value: 0 },
                            { label: "M", notchIndex: 1, value: 30 },
                            { label: "L", notchIndex: 2, value: 60 },
                        ]} />
                </PanelSectionRow>
            </>}
            <PanelSectionRow>
                <DropdownItem
                    label='Quality'
                    selectedOption={quality}
                    rgOptions={qualityOptions}
                    onMenuOpened={hideDuringMenu}
                    onChange={option => setGlobalState(state => ({
                        ...state,
                        visible: true,
                        quality: option.data
                    }))} />
            </PanelSectionRow>
        </PanelSection>
        <PanelSection title="Hotkeys">
            <PanelSectionRow>
                <ToggleField
                    label='Enable Hotkeys'
                    description='Games also receive these buttons. Press X on a hotkey to clear it.'
                    checked={hotkeys}
                    onChange={hotkeys => setGlobalState(state => ({ ...state, hotkeys }))} />
            </PanelSectionRow>
            {hotkeys && <>
                {HOTKEY_ACTIONS.map(({ id, label }) =>
                    <PanelSectionRow key={id}>
                        <Focusable
                            onSecondaryActionDescription='Clear'
                            onSecondaryButton={() => setGlobalState(state => ({
                                ...state,
                                bindings: bindChord(state.bindings, id, NOT_BOUND)
                            }))}>
                            <ButtonItem
                                label={label}
                                layout="below"
                                onClick={() => showModal(<RecordModalWithState value={stateContext} action={id} label={label} />)}>
                                {bindings[id] || 'Not set'}
                            </ButtonItem>
                        </Focusable>
                    </PanelSectionRow>)}
                <PanelSectionRow>
                    <ButtonItem
                        bottomSeparator="none"
                        layout="below"
                        onClick={() => setGlobalState(state => ({ ...state, bindings: DEFAULT_BINDINGS }))}>
                        Clear All Hotkeys
                    </ButtonItem>
                </PanelSectionRow>
            </>}
        </PanelSection>
    </>;
};
