import asyncio
import json
import os
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

    async def stop(self):
        if self.loop_task:
            self.loop_task.cancel()
            self.loop_task = None
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
