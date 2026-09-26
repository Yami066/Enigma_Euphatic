from __future__ import annotations

import os
from functools import lru_cache

import boto3
from botocore.config import Config

REGION = os.environ.get("AWS_REGION", os.environ.get("AWS_DEFAULT_REGION", "ap-south-1"))


@lru_cache(maxsize=None)
def client(name: str, region: str | None = None, read_timeout: int = 60):
    region = region or REGION
    if name == "s3":
        # Regional endpoint + SigV4: presigned URLs for new buckets otherwise hit a 307 redirect
        # from the global endpoint, which browsers won't follow for a signed PUT.
        return boto3.client(
            "s3",
            region_name=region,
            endpoint_url=f"https://s3.{region}.amazonaws.com",
            config=Config(signature_version="s3v4", s3={"addressing_style": "virtual"},
                          retries={"max_attempts": 3, "mode": "standard"}),
        )
    return boto3.client(
        name,
        region_name=region,
        config=Config(retries={"max_attempts": 3, "mode": "standard"}, read_timeout=read_timeout, connect_timeout=5),
    )


@lru_cache(maxsize=None)
def ddb_table(name: str):
    return boto3.resource("dynamodb", region_name=REGION).Table(name)
