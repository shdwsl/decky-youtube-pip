// Injected into the YouTube TV page. Everything the plugin does to the page
// lives here; main.py only calls tick() and run().
(() => {
    if (window.__ytpip) return;

    const STYLE = `
        html.ytpip-fill video {
            position: fixed !important;
            inset: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            object-fit: contain !important;
            background: #000;
            z-index: 2147483647 !important;
        }
    `;

    // The view is hidden while Steam menus are open, which must not stop playback.
    Object.defineProperty(document, 'hidden', { get: () => false });
    Object.defineProperty(document, 'visibilityState', { get: () => 'visible' });
    document.addEventListener('visibilitychange', e => e.stopImmediatePropagation(), true);

    const player = () => document.querySelector('.html5-video-player');
    const video = () => document.querySelector('video');

    const addStyle = () => {
        if (document.getElementById('ytpip-style') || !document.head) return;
        const style = document.createElement('style');
        style.id = 'ytpip-style';
        style.textContent = STYLE;
        document.head.appendChild(style);
    };

    const isWatching = () => location.hash.startsWith('#/watch');

    // YouTube picks quality from the player size, so a small window would get
    // 360p at best. Applied once per video: not every video has every quality.
    let qualityApplied = null;
    const applyQuality = (p, quality) => {
        const id = p.getVideoData?.()?.video_id;
        const key = `${id}:${quality}`;
        if (!id || qualityApplied === key || !p.getAvailableQualityLevels?.().length) return;
        qualityApplied = key;
        if (quality === 'auto') p.setPlaybackQualityRange?.('auto');
        else p.setPlaybackQualityRange?.(quality, quality);
    };

    // The TV player leaves title and author empty in its video data.
    const details = { id: null, title: '', author: '' };
    const loadDetails = id => {
        if (!id || details.id === id) return;
        Object.assign(details, { id, title: '', author: '' });
        fetch(`/oembed?format=json&url=${encodeURIComponent(`https://youtu.be/${id}`)}`)
            .then(response => response.json())
            .then(({ title, author_name }) => {
                if (details.id === id) Object.assign(details, { title, author: author_name });
            })
            .catch(() => {});
    };

    // The app ignores hash changes, navigation has to go through its own commands.
    const resolveCommand = command => {
        for (const value of Object.values(window._yttv ?? {})) {
            if (value?.instance?.resolveCommand) {
                value.instance.resolveCommand(command);
                return true;
            }
        }
        return false;
    };

    const STATES = { '-1': 'idle', 0: 'ended', 1: 'playing', 2: 'paused', 3: 'buffering', 5: 'idle' };

    const tick = ({ fill, quality }) => {
        addStyle();
        const p = player();
        const v = video();
        const hasPicture = !!v && v.videoWidth > 0;

        document.documentElement.classList.toggle('ytpip-fill', !!fill && hasPicture && isWatching());
        if (!p) return { player: false };

        applyQuality(p, quality);

        const data = p.getVideoData?.() ?? {};
        loadDetails(data.video_id);
        return {
            player: true,
            state: STATES[p.getPlayerState?.()] ?? 'idle',
            videoId: data.video_id ?? '',
            title: details.title,
            author: details.author,
            live: !!data.isLive,
            ad: p.classList.contains('ad-showing'),
            time: p.getCurrentTime?.() ?? 0,
            duration: p.getDuration?.() ?? 0,
            volume: p.getVolume?.() ?? 100,
            muted: !!p.isMuted?.(),
            height: v?.videoHeight ?? 0,
        };
    };

    const run = ({ action, value }) => {
        const p = player();
        if (action === 'open') return resolveCommand({ watchEndpoint: { videoId: value } });
        if (!p) return false;

        switch (action) {
            case 'toggle':
                if (p.getPlayerState() === 1) p.pauseVideo();
                else p.playVideo();
                break;
            case 'seek':
                p.seekTo(Math.max(0, p.getCurrentTime() + value), true);
                break;
            case 'seekTo':
                p.seekTo(value, true);
                break;
            case 'volume':
                p.unMute?.();
                p.setVolume(value);
                break;
            case 'volumeBy':
                p.unMute?.();
                p.setVolume(Math.min(100, Math.max(0, p.getVolume() + value)));
                break;
            default:
                return false;
        }
        return true;
    };

    window.__ytpip = { tick, run };
})();
