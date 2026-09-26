"""S3 document storage with short-lived presigned URLs (uploads go browser → S3 directly)."""
from __future__ import annotations

import os
import re

from .clients import client

TTL = 300  # 5 minutes


def bucket() -> str:
    return os.environ["DOCS_BUCKET"]


def safe_name(filename: str) -> str:
    base = re.sub(r"[^A-Za-z0-9._-]+", "_", filename or "file")[-80:]
    return base or "file"


def presign_put(key: str, content_type: str) -> str:
    return client("s3").generate_presigned_url(
        "put_object",
        Params={"Bucket": bucket(), "Key": key, "ContentType": content_type or "application/octet-stream"},
        ExpiresIn=TTL,
    )


def presign_get(key: str, filename: str | None = None, inline: bool = True) -> str:
    params = {"Bucket": bucket(), "Key": key}
    if filename:
        disp = "inline" if inline else "attachment"
        params["ResponseContentDisposition"] = f'{disp}; filename="{safe_name(filename)}"'
    return client("s3").generate_presigned_url("get_object", Params=params, ExpiresIn=TTL)


def get_bytes(key: str) -> bytes:
    return client("s3").get_object(Bucket=bucket(), Key=key)["Body"].read()


def put_bytes(key: str, data: bytes, content_type: str) -> None:
    client("s3").put_object(Bucket=bucket(), Key=key, Body=data, ContentType=content_type)


def delete_prefix(prefix: str) -> int:
    s3 = client("s3")
    n = 0
    token = None
    while True:
        kw = {"Bucket": bucket(), "Prefix": prefix}
        if token:
            kw["ContinuationToken"] = token
        r = s3.list_objects_v2(**kw)
        keys = [{"Key": o["Key"]} for o in r.get("Contents", [])]
        if keys:
            s3.delete_objects(Bucket=bucket(), Delete={"Objects": keys})
            n += len(keys)
        if not r.get("IsTruncated"):
            return n
        token = r.get("NextContinuationToken")
