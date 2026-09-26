"""Step Functions: start a claim clock, and resume it when the family answers."""
from __future__ import annotations

import json
import os
import re
import time

from .clients import client


def start_clock(case_id: str, asset_id: str, payload: dict) -> str:
    name = re.sub(r"[^A-Za-z0-9_-]", "-", f"{case_id}-{asset_id}-{int(time.time())}")[:80]
    r = client("stepfunctions").start_execution(
        stateMachineArn=os.environ["STATE_MACHINE_ARN"], name=name, input=json.dumps(payload))
    return r["executionArn"]


def send_answer(task_token: str, output: dict) -> None:
    client("stepfunctions").send_task_success(taskToken=task_token, output=json.dumps(output))


def stop(execution_arn: str) -> None:
    try:
        client("stepfunctions").stop_execution(executionArn=execution_arn, cause="Stopped by family")
    except Exception:  # noqa: BLE001 - already finished is fine
        pass
