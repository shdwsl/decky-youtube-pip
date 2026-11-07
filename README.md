# YouTube PiP

Watch YouTube in a picture-in-picture window while you game on Steam Deck. A [Decky Loader](https://decky.xyz) plugin, based on [decky-pip](https://github.com/rossimo/decky-pip).

![Preview](assets/preview.png)

- **TV interface.** Runs YouTube's TV app in Steam's built-in browser, so the layout scales with the window instead of collapsing.
- **Sign in with a code.** Pair at `yt.be/activate` from your phone. No password on the Deck.
- **Sharp at any size.** Quality is set by you, not by the window size.
- **Controls during games.** Playback lives in the Quick Access Menu, plus hotkeys you can bind.

## Controls

Hotkeys are empty by default. To bind one, select an action in the plugin panel and press your buttons:

- Play / pause
- Back or forward 10 seconds
- Next video, restart
- Volume up or down
- Hide / show window

Hotkeys work on the Deck's built-in controls, not on external gamepads, and games receive the same buttons.

**Browse YouTube** in the plugin panel turns the gamepad into a remote: D-pad to navigate, A select, B back, X play/pause, Y exit.

## Install

In Decky's settings, enable Developer Mode, then open **Developer → Install Plugin from URL** and paste:

```
https://github.com/shdwsl/decky-youtube-pip/releases/latest/download/youtube-pip.zip
```

The same link always gives the latest version. To update, install it again.

To build the zip yourself:

```sh
pnpm install
pnpm package   # out/youtube-pip.zip
```

## How it works

The frontend opens a Steam browser view with a TV user agent. The Python backend talks to that view over the local CEF debugging port that Decky already uses, and injects [`defaults/agent.js`](defaults/agent.js) to control the player.

## Notes

- Tested on Steam Deck.
- Not affiliated with YouTube or Google. Using the TV app from a non-TV device is unofficial and may stop working.
- Preview image: Big Buck Bunny, (c) Blender Foundation, CC BY 3.0.

## License

[MIT](LICENSE). Portions derived from [decky-pip](https://github.com/rossimo/decky-pip) remain under [BSD 3-Clause](LICENSE.decky-pip).
