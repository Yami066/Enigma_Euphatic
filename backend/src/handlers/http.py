"""HTTP API (payload v2) helpers shared by all API Lambdas. Never logs request bodies (PII)."""
from __future__ import annotations

import base64
import json
import logging
import time
from decimal import Decimal
from functools import wraps

from euphatics.app.service import ApiError

log = logging.getLogger("euphatics")
log.setLevel(logging.INFO)


def _default(o):
    if isinstance(o, Decimal):
        return int(o) if o == o.to_integral_value() else float(o)
    if isinstance(o, (set, tuple)):
        return list(o)
    return str(o)


def respond(status: int, body) -> dict:
    return {"statusCode": status, "headers": {"content-type": "application/json"},
            "body": json.dumps(body, default=_default, ensure_ascii=False)}


def email_of(event: dict) -> str:
    try:
        claims = event["requestContext"]["authorizer"]["jwt"]["claims"]
    except KeyError as e:
        raise ApiError(401, "Sign in again, please.", "unauthorized") from e
    email = (claims.get("email") or "").strip().lower()
    if not email:
        raise ApiError(401, "Your sign-in token has no email. Use the ID token.", "unauthorized")
    return email


def body_of(event: dict) -> dict:
    raw = event.get("body") or ""
    if event.get("isBase64Encoded") and raw:
        raw = base64.b64decode(raw).decode("utf-8")
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except ValueError as e:
        raise ApiError(400, "Body must be JSON.", "invalid") from e
    if not isinstance(data, dict):
        raise ApiError(400, "Body must be a JSON object.", "invalid")
    return data


def params(event: dict) -> dict:
    return event.get("pathParameters") or {}


def query(event: dict) -> dict:
    return event.get("queryStringParameters") or {}


def api(fn):
    @wraps(fn)
    def wrapper(event, context):
        started = time.time()
        route = event.get("routeKey", "?")
        try:
            status, body = fn(event, context)
            return respond(status, body)
        except ApiError as e:
            status = e.status
            return respond(e.status, {"error": e.code, "message": e.message})
        except Exception:  # noqa: BLE001
            status = 500
            log.exception("unhandled error on %s", route)
            return respond(500, {"error": "server_error", "message": "Something went wrong on our side. Please try again."})
        finally:
            log.info(json.dumps({"route": route, "ms": int((time.time() - started) * 1000)}))
    return wrapper
