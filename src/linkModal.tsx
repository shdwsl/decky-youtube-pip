import {
    TextField,
    ConfirmModal,
    ModalRootProps
} from "@decky/ui";
import { useEffect, useState } from "react";

import { control } from "./backend";
import { modalWithState } from "./modal";
import { useGlobalState } from "./globalState";
import { parseVideoId } from "./util";

export const LinkModal = (props: ModalRootProps) => {
    const [, setGlobalState] = useGlobalState();
    const [field, setField] = useState('');
    const videoId = parseVideoId(field);

    useEffect(() => {
        setGlobalState(state => ({ ...state, visible: false }));

        return () => setGlobalState(state => ({ ...state, visible: true }));
    }, []);

    return <ConfirmModal
        {...props}
        strTitle='Open video'
        strDescription='Paste a YouTube link or video ID'
        bOKDisabled={!videoId}
        onOK={() => {
            if (videoId) {
                control('open', videoId);
            }
        }}>
        <TextField
            value={field}
            onChange={e => setField(e.target.value)} />
    </ConfirmModal>;
}

export const LinkModalWithState = modalWithState(LinkModal);
