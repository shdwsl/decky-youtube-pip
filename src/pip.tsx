import {
    Router,
    getGamepadNavigationTrees,
} from "@decky/ui";
import { useEffect, useState } from "react";

import { setOptions, start, stop } from "./backend";
import { useGlobalState } from "./globalState";
import { intersectRectangles } from "./geometry";
import { UIComposition, useUIComposition } from "./useUIComposition";
import {
    ASPECT_RATIO,
    FALLBACK_SCREEN_HEIGHT,
    FALLBACK_SCREEN_WIDTH,
    Position,
    REMOTE_HINT_HEIGHT,
    TV_USER_AGENT,
    ViewMode,
    YOUTUBE_TV_URL
} from "./util";

interface BrowserProps {
    visible: boolean
    x: number
    y: number
    width: number
    height: number
}

const Browser = ({ visible, x, y, width, height }: BrowserProps) => {
    useUIComposition(UIComposition.Notification);

    const [{ browser, view }] = useState<{ browser: any, view: any }>(() => {
        const root: any = Router.WindowStore?.GamepadUIMainWindowInstance;
        const view = root.CreateBrowserView("youtube-pip", {
            strUserAgentOverride: TV_USER_AGENT
        });

        return {
            view,
            browser: view.GetBrowser()
        }
    });

    useEffect(() => {
        browser.SetVisible(visible);
    }, [visible]);

    useEffect(() => {
        browser.SetBounds(x, y, width, height);
    }, [x, y, width, height]);

    useEffect(() => {
        view.LoadURL(YOUTUBE_TV_URL);
        // Nobody can click inside the window during a game, so autoplay needs this.
        browser.NotifyUserActivation?.();
        start();

        return () => {
            stop();
            view.Destroy();
        };
    }, []);

    return null;
}

const getBounds = (document: any) => {
    return {
        x: document?.defaultView?.screenLeft,
        y: document?.defaultView?.screenTop,
        width: document?.defaultView?.outerWidth,
        height: document?.defaultView?.outerHeight,
    };
}

const getScreen = () => {
    const root: any = Router.WindowStore?.GamepadUIMainWindowInstance;

    return {
        width: root?.BrowserWindow?.innerWidth || FALLBACK_SCREEN_WIDTH,
        height: root?.BrowserWindow?.innerHeight || FALLBACK_SCREEN_HEIGHT
    };
}

const getDeckComponentBounds = () => {
    const trees = getGamepadNavigationTrees();
    const screen = getScreen();

    const nav = trees.find((tree: any) => tree?.id === 'MainNavMenuContainer')?.m_Root?.m_element?.ownerDocument.defaultView ?? null
    const navHidden = nav?.document.hidden;
    const navBounds = navHidden
        ? null
        : getBounds(nav?.document);

    const qam = trees.find((tree: any) => tree?.id === 'QuickAccess-NA')?.m_Root?.m_element?.ownerDocument.defaultView ?? null
    const qamHidden = qam?.document.hidden;
    const qamBounds = qamHidden
        ? null
        : getBounds(qam?.document);

    const virtualKeyboard = trees.find((tree: any) => tree?.id === 'virtual keyboard')?.m_Root?.m_element?.ownerDocument.defaultView ?? null
    const virtualKeyboardHidden = !virtualKeyboard;
    // this is a guess, gotta figure out how to inspect to keyboard DOM
    const virtualKeyboardBounds = virtualKeyboardHidden
        ? null
        : {
            x: 0,
            y: screen.height - 240,
            width: screen.width,
            height: 240
        };

    return {
        screen,
        nav: navBounds,
        qam: qamBounds,
        virtualKeyboard: virtualKeyboardBounds,
    }
}

const useDeckComponentBounds = () => {
    const [state, setState] = useState(getDeckComponentBounds());

    useEffect(() => {
        const interval = setInterval(() => {
            setState(current => {
                const next = getDeckComponentBounds();
                return JSON.stringify(next) === JSON.stringify(current)
                    ? current
                    : next;
            });
        }, 250);

        return () => clearInterval(interval);
    }, []);

    return state;
}

export const Pip = () => {
    const { screen, nav, qam, virtualKeyboard } = useDeckComponentBounds();
    const [{ viewMode, position, size, visible, hidden, quality, ...settings }] = useGlobalState();

    useEffect(() => {
        setOptions(viewMode == ViewMode.Picture, quality);
    }, [viewMode, quality]);

    const fullscreen = { x: 0, y: 0, width: screen.width, height: screen.height };

    if (viewMode == ViewMode.Remote) {
        return <Browser
            visible={visible}
            {...fullscreen}
            height={screen.height - REMOTE_HINT_HEIGHT} />;
    }

    const pictureWidth = screen.width * size;
    const pictureHeight = pictureWidth / ASPECT_RATIO;

    const availableBounds = [fullscreen];

    if (nav) {
        availableBounds.push({
            x: nav.width,
            y: 0,
            width: screen.width - nav.width,
            height: screen.height
        });
    }

    if (qam) {
        availableBounds.push({
            x: 0,
            y: 0,
            width: screen.width - qam.width,
            height: screen.height
        });
    }

    if (virtualKeyboard) {
        availableBounds.push({
            x: 0,
            y: 0,
            width: screen.width,
            height: screen.height - virtualKeyboard.height
        });
    }

    const bounds = intersectRectangles(availableBounds) ?? { ...fullscreen };

    const margin = viewMode == ViewMode.Expand
        ? 30
        : settings.margin;

    bounds.x += margin;
    bounds.y += margin;
    bounds.width -= margin * 2;
    bounds.height -= margin * 2;

    switch (viewMode) {
        case ViewMode.Expand: {
            // do nothing, screen is calculated initially to fullscreen
        } break;

        case ViewMode.Picture: {
            switch (position) {
                case Position.Top: {
                    bounds.x += bounds.width / 2 - pictureWidth / 2;
                } break;
                case Position.TopRight: {
                    bounds.x += bounds.width - pictureWidth;
                } break;
                case Position.Right: {
                    bounds.x += bounds.width - pictureWidth;
                    bounds.y += bounds.height / 2 - pictureHeight / 2;
                } break;
                case Position.BottomRight: {
                    bounds.x += bounds.width - pictureWidth;
                    bounds.y += bounds.height - pictureHeight;
                } break;
                case Position.Bottom: {
                    bounds.x += bounds.width / 2 - pictureWidth / 2;
                    bounds.y += bounds.height - pictureHeight;
                } break;
                case Position.BottomLeft: {
                    bounds.y += bounds.height - pictureHeight;
                } break;
                case Position.Left: {
                    bounds.y += bounds.height / 2 - pictureHeight / 2;
                } break;
                case Position.TopLeft: {
                    // do nothing, screen is calculated initially to top left
                } break;
            }

            bounds.width = pictureWidth;
            bounds.height = pictureHeight;
        } break;
    }

    return <Browser
        visible={visible && !hidden}
        {...bounds} />;
}

export const PipOuter = () => {
    const [{ viewMode }] = useGlobalState();

    if (viewMode == ViewMode.Closed) {
        return null;
    }

    return <Pip />;
}
