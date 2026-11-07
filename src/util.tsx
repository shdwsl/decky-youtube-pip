export const FALLBACK_SCREEN_WIDTH = 854;
export const FALLBACK_SCREEN_HEIGHT = 534;
export const ASPECT_RATIO = 16 / 9;
export const REMOTE_HINT_HEIGHT = 40;

export const YOUTUBE_TV_URL = "https://www.youtube.com/tv";
export const REMOTE_ROUTE = "/youtube-pip/remote";

// Must match TV_USER_AGENT in main.py. YouTube only serves the TV app to TVs.
export const TV_USER_AGENT = "Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) 85.0.4183.93/6.0 TV Safari/537.36";

export enum ViewMode {
    Expand = 1,
    Picture = 2,
    Closed = 3,
    Remote = 4
}

export enum Position {
    Top,
    TopRight,
    Right,
    BottomRight,
    Bottom,
    BottomLeft,
    Left,
    TopLeft
}

export const formatTime = (seconds: number) => {
    const total = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor(total / 60) % 60;
    const rest = String(total % 60).padStart(2, '0');

    return hours > 0
        ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}`
        : `${minutes}:${rest}`;
}

export const parseVideoId = (input: string) => {
    const text = input.trim();
    const match = text.match(/(?:[?&]v=|youtu\.be\/|\/(?:shorts|live|embed)\/)([\w-]{11})/);

    if (match) {
        return match[1];
    }

    return /^[\w-]{11}$/.test(text) ? text : null;
}
