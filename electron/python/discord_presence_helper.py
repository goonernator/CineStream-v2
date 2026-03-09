import asyncio
import json
import sys
from typing import Any, Dict, Optional
import inspect
from datetime import datetime, timezone


def patch_protobuf_compat() -> None:
    """
    discord.py-self / discord-protos may call MessageToDict(..., including_default_value_fields=...)
    which is removed in newer protobuf versions (e.g. protobuf 6.x).
    This shim maps it to the new argument when available.
    """
    try:
        from google.protobuf import json_format  # type: ignore
    except Exception:
        return

    try:
        sig = inspect.signature(json_format.MessageToDict)
        if "including_default_value_fields" in sig.parameters:
            return  # old protobuf API already compatible
        if "always_print_fields_with_no_presence" not in sig.parameters:
            return  # unknown API shape, skip patch

        original = json_format.MessageToDict

        def compat_message_to_dict(*args: Any, **kwargs: Any):  # type: ignore
            if "including_default_value_fields" in kwargs and "always_print_fields_with_no_presence" not in kwargs:
                kwargs["always_print_fields_with_no_presence"] = kwargs.pop("including_default_value_fields")
            else:
                kwargs.pop("including_default_value_fields", None)
            return original(*args, **kwargs)

        json_format.MessageToDict = compat_message_to_dict  # type: ignore
        emit({"type": "status", "state": "starting", "message": "Applied protobuf compatibility shim"})
    except Exception:
        # Silently ignore patch failures; helper will surface actual errors later.
        return


def emit(obj: Dict[str, Any]) -> None:
    try:
        sys.stdout.write(json.dumps(obj) + "\n")
        sys.stdout.flush()
    except Exception:
        pass


def safe_error_message(err: Exception) -> str:
    text = str(err)
    if len(text) > 300:
      text = text[:300]
    return text


def format_time(seconds: Optional[float]) -> str:
    if seconds is None:
        return ""
    total = max(0, int(seconds))
    hours = total // 3600
    minutes = (total % 3600) // 60
    secs = total % 60
    if hours > 0:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"


class PresenceBridge:
    def __init__(self) -> None:
        self.discord = None
        self.client = None
        self.loop = asyncio.get_event_loop()
        self.started = False
        self.logged_in = False
        self.login_task: Optional[asyncio.Task] = None
        self.command_queue: "asyncio.Queue[Dict[str, Any]]" = asyncio.Queue()
        self.current_token: Optional[str] = None

    async def ensure_import(self) -> bool:
        if self.discord is not None:
            return True
        try:
            import discord  # type: ignore
            self.discord = discord
            return True
        except Exception as err:
            emit({"type": "status", "state": "helper_error", "message": f"discord.py-self import failed: {safe_error_message(err)}"})
            return False

    async def init_client(self, token: str) -> None:
        if not await self.ensure_import():
            return
        if self.client is not None and self.logged_in and token == self.current_token:
            return

        self.current_token = token
        self.logged_in = False
        emit({"type": "status", "state": "starting"})

        discord = self.discord
        assert discord is not None

        intents = getattr(discord, "Intents", None)
        client_kwargs = {}
        if intents is not None:
            try:
                client_kwargs["intents"] = intents.none()
            except Exception:
                pass

        outer = self

        class SelfClient(discord.Client):  # type: ignore
            async def on_ready(inner_self):  # noqa: N805
                outer.logged_in = True
                emit({"type": "status", "state": "connected"})

        self.client = SelfClient(**client_kwargs)

        async def _run() -> None:
            try:
                await self.client.start(token)  # type: ignore[arg-type]
            except Exception as err:
                message = safe_error_message(err)
                lowered = message.lower()
                state = "auth_failed" if ("token" in lowered or "401" in lowered or "login" in lowered) else "disconnected"
                emit({"type": "status", "state": state, "message": message})
            finally:
                self.logged_in = False

        self.login_task = self.loop.create_task(_run())

        async def _wait_until_ready() -> None:
            try:
                if hasattr(self.client, "wait_until_ready"):
                    await self.client.wait_until_ready()
                    self.logged_in = True
                    emit({"type": "status", "state": "connected"})
            except Exception:
                # on_ready path will handle connected in normal cases
                pass

        self.loop.create_task(_wait_until_ready())

    async def set_presence(self, payload: Dict[str, Any]) -> None:
        if not self.client or not self.logged_in:
            emit({"type": "ack", "command": "set_presence", "queued": False})
            return

        discord = self.discord
        if discord is None:
            return

        try:
            name = str(payload.get("name") or payload.get("title") or "Watching")
            details = str(payload.get("details") or "").strip()
            state_text = str(payload.get("stateText") or payload.get("playbackState") or "").strip()

            if payload.get("forceRawRich"):
                await self._apply_raw_gateway_presence(payload, name, details, state_text)
                emit({"type": "ack", "command": "set_presence", "raw": True})
                return

            # Build self presence activity. Exact supported fields vary by discord.py-self version.
            activity_kwargs: Dict[str, Any] = {
                "type": discord.ActivityType.watching,
                "name": name[:120],
            }
            if details:
                activity_kwargs["details"] = details[:120]
            if state_text:
                activity_kwargs["state"] = state_text[:120]

            # Rich timestamps (used for Discord progress bars on supported activity cards)
            start_ts_ms = payload.get("startTimestampMs")
            end_ts_ms = payload.get("endTimestampMs")
            if start_ts_ms is not None or end_ts_ms is not None:
                ts_payload: Dict[str, Any] = {}
                try:
                    if start_ts_ms is not None:
                        ts_payload["start"] = datetime.fromtimestamp(float(start_ts_ms) / 1000.0, tz=timezone.utc)
                    if end_ts_ms is not None:
                        ts_payload["end"] = datetime.fromtimestamp(float(end_ts_ms) / 1000.0, tz=timezone.utc)
                except Exception:
                    ts_payload = {}
                if ts_payload:
                    activity_kwargs["timestamps"] = ts_payload

            # Optional app-rich fields (requires a valid application_id/assets to render images)
            application_id = payload.get("applicationId")
            if application_id is not None and str(application_id).strip():
                try:
                    activity_kwargs["application_id"] = int(str(application_id).strip())
                except Exception:
                    pass

            assets_payload: Dict[str, Any] = {}
            if payload.get("largeImage"):
                assets_payload["large_image"] = str(payload.get("largeImage"))[:128]
            if payload.get("largeText"):
                assets_payload["large_text"] = str(payload.get("largeText"))[:128]
            if payload.get("smallImage"):
                assets_payload["small_image"] = str(payload.get("smallImage"))[:128]
            if payload.get("smallText"):
                assets_payload["small_text"] = str(payload.get("smallText"))[:128]
            if assets_payload:
                activity_kwargs["assets"] = assets_payload

            raw_buttons = payload.get("buttons")
            if isinstance(raw_buttons, list):
                buttons = []
                for item in raw_buttons[:2]:
                    if not isinstance(item, dict):
                        continue
                    label = str(item.get("label") or "").strip()
                    url = str(item.get("url") or "").strip()
                    if label and url and (url.startswith("http://") or url.startswith("https://")):
                        buttons.append({"label": label[:32], "url": url[:512]})
                if buttons:
                    activity_kwargs["buttons"] = buttons

            activity = discord.Activity(**activity_kwargs)
            await self._apply_presence_with_fallbacks(discord, activity)
            emit({"type": "ack", "command": "set_presence"})
        except Exception as err:
            # Fallback to a minimal watching activity if rich fields are rejected.
            try:
                discord = self.discord
                if discord is not None and self.client is not None and self.logged_in:
                    minimal = discord.Activity(
                        type=discord.ActivityType.watching,
                        name=str(payload.get("title") or payload.get("name") or "Watching")[:120],
                    )
                    await self._apply_presence_with_fallbacks(discord, minimal)
                    emit({"type": "ack", "command": "set_presence", "fallback": True})
                    return
            except Exception as fallback_err:
                emit({
                    "type": "error",
                    "message": "set_presence_failed",
                    "details": f"primary={safe_error_message(err)} | fallback={safe_error_message(fallback_err)}",
                })
                return
            emit({"type": "error", "message": "set_presence_failed", "details": safe_error_message(err)})

    async def _apply_raw_gateway_presence(self, payload: Dict[str, Any], name: str, details: str, state_text: str) -> None:
        if not self.client:
            raise RuntimeError("Client not initialized")
        ws = getattr(self.client, "ws", None)
        if ws is None:
            raise RuntimeError("Discord websocket not available")

        raw_activity_type = str(payload.get("rawActivityType") or "watching").strip().lower()
        activity_type_map = {
            "playing": 0,
            "streaming": 1,
            "listening": 2,
            "watching": 3,
            "custom": 4,
            "competing": 5,
        }
        activity_type = activity_type_map.get(raw_activity_type, 3)
        raw_activity: Dict[str, Any] = {
            "name": name[:120],
            "type": activity_type,
            "instance": True,
        }
        raw_activity["created_at"] = int(datetime.now(tz=timezone.utc).timestamp() * 1000)
        if details:
            raw_activity["details"] = details[:120]
        if state_text:
            raw_activity["state"] = state_text[:120]

        start_ts_ms = payload.get("startTimestampMs")
        end_ts_ms = payload.get("endTimestampMs")
        timestamps: Dict[str, int] = {}
        try:
            if start_ts_ms is not None:
                timestamps["start"] = int(float(start_ts_ms))
            if end_ts_ms is not None:
                timestamps["end"] = int(float(end_ts_ms))
        except Exception:
            timestamps = {}
        if timestamps:
            raw_activity["timestamps"] = timestamps

        application_id = payload.get("applicationId")
        if application_id is not None and str(application_id).strip():
            raw_activity["application_id"] = str(application_id).strip()
            # Mark as an instance-rich activity when app-backed; some clients render more fields this way.
            raw_activity["flags"] = 1

        assets_payload: Dict[str, str] = {}
        if payload.get("largeImage"):
            assets_payload["large_image"] = str(payload.get("largeImage"))[:128]
        if payload.get("largeText"):
            assets_payload["large_text"] = str(payload.get("largeText"))[:128]
        if payload.get("smallImage"):
            assets_payload["small_image"] = str(payload.get("smallImage"))[:128]
        if payload.get("smallText"):
            assets_payload["small_text"] = str(payload.get("smallText"))[:128]
        if assets_payload:
            raw_activity["assets"] = assets_payload

        raw_buttons = payload.get("buttons")
        if isinstance(raw_buttons, list):
            labels = []
            urls = []
            for item in raw_buttons[:2]:
                if not isinstance(item, dict):
                    continue
                label = str(item.get("label") or "").strip()
                url = str(item.get("url") or "").strip()
                if label and url and (url.startswith("http://") or url.startswith("https://")):
                    labels.append(label[:32])
                    urls.append(url[:512])
            if labels:
                raw_activity["buttons"] = labels
                raw_activity["metadata"] = {"button_urls": urls}

        presence_payload = {
            "op": 3,
            "d": {
                "since": None,
                "activities": [raw_activity],
                "status": "online",
                "afk": False,
            },
        }

        if hasattr(ws, "send_as_json"):
            await ws.send_as_json(presence_payload)  # type: ignore[attr-defined]
            return
        if hasattr(ws, "send_json"):
            await ws.send_json(presence_payload)  # type: ignore[attr-defined]
            return
        raise RuntimeError("No websocket JSON send method found")

    async def _apply_presence_with_fallbacks(self, discord: Any, activity: Any) -> None:
        last_error: Optional[Exception] = None
        attempts = [
            {"status": discord.Status.online, "activity": activity, "edit_settings": True},
            {"status": discord.Status.online, "activity": activity, "edit_settings": False},
            {"activity": activity, "edit_settings": True},
            {"activity": activity, "edit_settings": False},
            {"activities": [activity], "edit_settings": True},
            {"activities": [activity], "edit_settings": False},
            {"activity": activity},
            {"activities": [activity]},
        ]
        for kwargs in attempts:
            try:
                await self.client.change_presence(**kwargs)  # type: ignore[arg-type]
                return
            except Exception as err:
                last_error = err
        if last_error:
            raise last_error
        raise RuntimeError("No change_presence attempts were made")

    async def clear_presence(self) -> None:
        if not self.client or not self.logged_in:
            emit({"type": "ack", "command": "clear_presence"})
            return
        try:
            await self.client.change_presence(activity=None)  # type: ignore[arg-type]
            emit({"type": "ack", "command": "clear_presence"})
        except Exception as err:
            emit({"type": "error", "message": "clear_presence_failed", "details": safe_error_message(err)})

    async def shutdown(self) -> None:
        try:
            await self.clear_presence()
        except Exception:
            pass
        try:
            if self.client:
                await self.client.close()
        except Exception:
            pass
        if self.login_task:
            self.login_task.cancel()
        emit({"type": "status", "state": "disconnected", "message": "shutdown"})

    async def command_loop(self) -> None:
        while True:
            cmd = await self.command_queue.get()
            ctype = cmd.get("type")
            if ctype == "init":
                token = str(cmd.get("token") or "").strip()
                if not token:
                    emit({"type": "status", "state": "auth_failed", "message": "Missing token"})
                    continue
                await self.init_client(token)
            elif ctype == "set_presence":
                payload = cmd.get("payload") or {}
                await self.set_presence(payload)
            elif ctype == "clear_presence":
                await self.clear_presence()
            elif ctype == "ping":
                emit({"type": "pong"})
            elif ctype == "shutdown":
                await self.shutdown()
                return

    async def stdin_loop(self) -> None:
        while True:
            line = await asyncio.to_thread(sys.stdin.readline)
            if line == "":
                await self.shutdown()
                return
            line = line.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
                if not isinstance(msg, dict):
                    raise ValueError("Command must be an object")
                await self.command_queue.put(msg)
            except Exception as err:
                emit({"type": "error", "message": "invalid_command", "details": safe_error_message(err)})


async def main() -> None:
    emit({"type": "status", "state": "starting"})
    patch_protobuf_compat()
    bridge = PresenceBridge()
    await asyncio.gather(bridge.stdin_loop(), bridge.command_loop())


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
    except Exception as err:
        emit({"type": "status", "state": "helper_error", "message": safe_error_message(err)})
