import { callable } from "@decky/api";

export interface Status {
    connected: boolean
    player?: boolean
    state?: 'idle' | 'ended' | 'playing' | 'paused' | 'buffering'
    videoId?: string
    title?: string
    author?: string
    live?: boolean
    ad?: boolean
    time?: number
    duration?: number
    volume?: number
    muted?: boolean
    height?: number
}

export type RemoteKey = 'up' | 'down' | 'left' | 'right' | 'select' | 'back' | 'next' | 'previous';

export const start = callable<[], void>("start");
export const stop = callable<[], void>("stop");
export const getStatus = callable<[], Status>("get_status");
export const setOptions = callable<[fill: boolean, quality: string], void>("set_options");
export const control = callable<[action: string, value?: number | string], boolean>("control");
export const press = callable<[key: RemoteKey], boolean>("press");
