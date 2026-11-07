import asyncio
import glob
import json
import os
import re
import time
from typing import Any, Optional

import aiohttp
import decky

# Decky itself drives Steam's CEF through this port. It only listens locally.
CEF_ADDRESS = os.environ.get("YTPIP_CEF_ADDRESS", "http://localhost:8080")
TARGET_URL = "youtube.com/tv"
TV_USER_AGENT = (
    "Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/537.36 "
    "(KHTML, like Gecko) 85.0.4183.93/6.0 TV Safari/537.36"
)
TICK_SECONDS = 1

# windowsVirtualKeyCode and DOM key name for the keys the TV app listens to.
KEYS = {
    "up": (38, "ArrowUp"),
    "down": (40, "ArrowDown"),
    "left": (37, "ArrowLeft"),
    "right": (39, "ArrowRight"),
    "select": (13, "Enter"),
    "back": (27, "Escape"),
    "next": (176, "MediaTrackNext"),
    "previous": (177, "MediaTrackPrevious"),
}


# Steam stops delivering controller input to the frontend while a game has
# focus, so buttons are read passively from the Deck's own controller instead.
# Report layout and button bits follow SDL's SDL_hidapi_steamdeck.c.
DECK_CONTROLLER_ID = re.compile(r"^HID_ID=[0-9a-f]+:0*28de:0*1205$", re.M | re.I)
DECK_STATE_REPORT = 0x09
REPORT_SIZE = 64
# The buttons listed in src/chords.tsx: no touch sensors, Steam or QAM.
LOW_BUTTONS = 0x0447DFFF
HIGH_BUTTONS = 0x00000600
# Reports stream constantly. Silence means the device went away during sleep.
BUTTON_STALL_SECONDS = 5


def deck_controller_nodes() -> list[str]:
    nodes = []
    for device in glob.glob("/sys/class/hidraw/hidraw*"):
        try:
            with open(os.path.join(device, "device", "uevent"), encoding="utf-8") as file:
                if DECK_CONTROLLER_ID.search(file.read()):
                    nodes.append(os.path.join("/dev", os.path.basename(device)))
        except OSError:
            continue
    return nodes


class ButtonWatcher:
    """Publishes pressed buttons to the frontend. Button states are never logged."""

    def __init__(self):
        self.fds: list[int] = []
        self.buttons = (0, 0)
        self.last_report = 0.0
        self.opened = -1

    def _publish(self, low: int, high: int):
        if (low, high) != self.buttons:
            self.buttons = (low, high)
            asyncio.get_running_loop().create_task(decky.emit("buttons", low, high))

    def _on_readable(self, fd: int):
        try:
            data = os.read(fd, REPORT_SIZE)
        except BlockingIOError:
            return
        except OSError:
            data = b""

        if not data:
            self._drop(fd)
        elif len(data) >= 16 and data[0] == 0x01 and data[2] == DECK_STATE_REPORT:
            self.last_report = time.monotonic()
            buttons = int.from_bytes(data[8:16], "little")
            self._publish(buttons & LOW_BUTTONS, (buttons >> 32) & HIGH_BUTTONS)

    def _drop(self, fd: int):
        asyncio.get_running_loop().remove_reader(fd)
        os.close(fd)
        self.fds.remove(fd)

    def _close(self):
        for fd in list(self.fds):
            self._drop(fd)
        self._publish(0, 0)

    def _open(self):
        for node in deck_controller_nodes():
            try:
                fd = os.open(node, os.O_RDONLY | os.O_NONBLOCK | os.O_CLOEXEC)
            except OSError as error:
                decky.logger.warning(f"Cannot read {node}: {error!r}")
                continue
            self.fds.append(fd)
            asyncio.get_running_loop().add_reader(fd, self._on_readable, fd)

        if len(self.fds) != self.opened:
            self.opened = len(self.fds)
            decky.logger.info(f"Reading buttons from {self.opened} hidraw node(s)")

    async def run(self):
        try:
            while True:
                if time.monotonic() - self.last_report > BUTTON_STALL_SECONDS:
                    self._close()
                    self._open()
                await asyncio.sleep(BUTTON_STALL_SECONDS)
        finally:
            self._close()


class Cdp:
    """Minimal DevTools client for a single target."""

    def __init__(self, ws: aiohttp.ClientWebSocketResponse):
        self.ws = ws
        self.next_id = 0
        self.pending: dict[int, asyncio.Future[Any]] = {}
        self.reader = asyncio.create_task(self._read())

    async def _read(self):
        try:
            async for message in self.ws:
                if message.type != aiohttp.WSMsgType.TEXT:
                    continue
                data = json.loads(message.data)
                future = self.pending.pop(data.get("id"), None)
                if future and not future.done():
                    future.set_result(data)
        finally:
            for future in self.pending.values():
                if not future.done():
                    future.set_exception(ConnectionError("CEF target closed"))
            self.pending.clear()

    @property
    def closed(self) -> bool:
        return self.ws.closed or self.reader.done()

    async def call(self, method: str, **params: Any) -> dict[str, Any]:
        self.next_id += 1
        future = asyncio.get_running_loop().create_future()
        self.pending[self.next_id] = future
        await self.ws.send_json({"id": self.next_id, "method": method, "params": params})
        response = await asyncio.wait_for(future, 5)
        if "error" in response:
            raise RuntimeError(f"{method}: {response['error']}")
        return response.get("result", {})

    async def evaluate(self, expression: str) -> Any:
        result = await self.call("Runtime.evaluate", expression=expression, returnByValue=True)
        if "exceptionDetails" in result:
            raise RuntimeError(result["exceptionDetails"].get("text", "evaluate failed"))
        return result.get("result", {}).get("value")

    async def close(self):
        await self.ws.close()
        self.reader.cancel()


class Plugin:
    http: Optional[aiohttp.ClientSession] = None
    cdp: Optional[Cdp] = None
    loop_task: Optional[asyncio.Task[None]] = None
    buttons_task: Optional[asyncio.Task[None]] = None
    agent = ""
    options: dict[str, Any] = {"fill": True, "quality": "hd720"}
    status: dict[str, Any] = {"connected": False}

    async def _find_target(self) -> Optional[str]:
        assert self.http
        async with self.http.get(f"{CEF_ADDRESS}/json") as response:
            targets = await response.json(content_type=None)
        for target in targets:
            if target.get("type") == "page" and TARGET_URL in target.get("url", ""):
                return target.get("webSocketDebuggerUrl")
        return None

    async def _attach(self, ws_url: str):
        assert self.http
        cdp = Cdp(await self.http.ws_connect(ws_url, max_msg_size=0))
        await cdp.call("Page.enable")
        await cdp.call("Emulation.setFocusEmulationEnabled", enabled=True)
        await cdp.call("Page.addScriptToEvaluateOnNewDocument", source=self.agent)

        # The view asks for this user agent when it is created. If this Steam
        # build ignored it, YouTube served a stub page instead of the TV app.
        user_agent = await cdp.evaluate("navigator.userAgent")
        if user_agent != TV_USER_AGENT:
            decky.logger.warning(f"Unexpected user agent, overriding: {user_agent}")
            await cdp.call("Emulation.setUserAgentOverride", userAgent=TV_USER_AGENT)
            await cdp.call("Page.reload")
        else:
            await cdp.evaluate(self.agent)

        self.cdp = cdp
        decky.logger.info("Attached to YouTube view")

    async def _tick(self):
        if not self.cdp or self.cdp.closed:
            self.cdp = None
            ws_url = await self._find_target()
            if not ws_url:
                self.status = {"connected": False}
                return
            await self._attach(ws_url)

        assert self.cdp
        status = await self.cdp.evaluate(
            f"window.__ytpip && window.__ytpip.tick({json.dumps(self.options)})"
        )
        self.status = {"connected": True, **(status or {"player": False})}

    async def _loop(self):
        while True:
            try:
                await self._tick()
            except asyncio.CancelledError:
                raise
            except Exception as error:
                decky.logger.warning(f"Tick failed: {error!r}")
                self.status = {"connected": False}
                if self.cdp:
                    await self.cdp.close()
                    self.cdp = None
            await asyncio.sleep(TICK_SECONDS)

    async def start(self):
        if not self.loop_task:
            self.loop_task = asyncio.create_task(self._loop())
            self.buttons_task = asyncio.create_task(ButtonWatcher().run())

    async def stop(self):
        if self.loop_task:
            self.loop_task.cancel()
            self.loop_task = None
        if self.buttons_task:
            self.buttons_task.cancel()
            self.buttons_task = None
        if self.cdp:
            await self.cdp.close()
            self.cdp = None
        self.status = {"connected": False}

    async def get_status(self) -> dict[str, Any]:
        return self.status

    async def set_options(self, fill: bool, quality: str):
        self.options = {"fill": fill, "quality": quality}

    async def control(self, action: str, value: Any = None) -> bool:
        if not self.cdp or self.cdp.closed:
            return False
        command = json.dumps({"action": action, "value": value})
        return bool(await self.cdp.evaluate(f"window.__ytpip && window.__ytpip.run({command})"))

    async def press(self, key: str) -> bool:
        if not self.cdp or self.cdp.closed or key not in KEYS:
            return False
        code, name = KEYS[key]
        for event in ("rawKeyDown", "keyUp"):
            await self.cdp.call(
                "Input.dispatchKeyEvent",
                type=event,
                windowsVirtualKeyCode=code,
                nativeVirtualKeyCode=code,
                key=name,
                code=name,
            )
        return True

    async def _main(self):
        with open(os.path.join(decky.DECKY_PLUGIN_DIR, "agent.js"), encoding="utf-8") as file:
            self.agent = file.read()
        self.http = aiohttp.ClientSession()

    async def _unload(self):
        await self.stop()
        if self.http:
            await self.http.close()
            self.http = None
