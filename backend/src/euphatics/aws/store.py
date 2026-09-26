"""Single-table DynamoDB access (PK/SK + GSI1) and an in-memory twin for tests."""
from __future__ import annotations

import json
import os
from decimal import Decimal
from typing import Any

from boto3.dynamodb.conditions import Key


def to_ddb(obj: Any) -> Any:
    """Python → DynamoDB (floats become Decimal, empty strings kept)."""
    return json.loads(json.dumps(obj), parse_float=Decimal)


def to_py(obj: Any) -> Any:
    if isinstance(obj, list):
        return [to_py(v) for v in obj]
    if isinstance(obj, dict):
        return {k: to_py(v) for k, v in obj.items()}
    if isinstance(obj, Decimal):
        return int(obj) if obj == obj.to_integral_value() else float(obj)
    return obj


class Store:
    def __init__(self, table_name: str | None = None):
        from .clients import ddb_table

        self.table = ddb_table(table_name or os.environ["TABLE_NAME"])

    def get(self, pk: str, sk: str) -> dict | None:
        r = self.table.get_item(Key={"PK": pk, "SK": sk})
        return to_py(r.get("Item")) if r.get("Item") else None

    def put(self, item: dict) -> dict:
        self.table.put_item(Item=to_ddb(item))
        return item

    def update(self, pk: str, sk: str, fields: dict) -> dict:
        if not fields:
            return self.get(pk, sk) or {}
        names, values, sets = {}, {}, []
        for i, (k, v) in enumerate(fields.items()):
            names[f"#f{i}"] = k
            values[f":v{i}"] = to_ddb(v)
            sets.append(f"#f{i} = :v{i}")
        r = self.table.update_item(
            Key={"PK": pk, "SK": sk},
            UpdateExpression="SET " + ", ".join(sets),
            ExpressionAttributeNames=names,
            ExpressionAttributeValues=values,
            ReturnValues="ALL_NEW",
        )
        return to_py(r["Attributes"])

    def delete(self, pk: str, sk: str) -> None:
        self.table.delete_item(Key={"PK": pk, "SK": sk})

    def query_pk(self, pk: str, prefix: str | None = None) -> list[dict]:
        cond = Key("PK").eq(pk) & Key("SK").begins_with(prefix) if prefix else Key("PK").eq(pk)
        items, kwargs = [], {"KeyConditionExpression": cond}
        while True:
            r = self.table.query(**kwargs)
            items += r.get("Items", [])
            if "LastEvaluatedKey" not in r:
                break
            kwargs["ExclusiveStartKey"] = r["LastEvaluatedKey"]
        return to_py(items)

    def query_gsi1(self, gsi1pk: str) -> list[dict]:
        r = self.table.query(IndexName="GSI1", KeyConditionExpression=Key("GSI1PK").eq(gsi1pk))
        return to_py(r.get("Items", []))

    def add(self, pk: str, sk: str, field: str, amount: int) -> int:
        r = self.table.update_item(
            Key={"PK": pk, "SK": sk},
            UpdateExpression="ADD #f :a",
            ExpressionAttributeNames={"#f": field},
            ExpressionAttributeValues={":a": amount},
            ReturnValues="UPDATED_NEW",
        )
        return int(r["Attributes"][field])


class MemoryStore:
    """Same interface, in memory. Used by unit tests and local runs."""

    def __init__(self):
        self.items: dict[tuple[str, str], dict] = {}

    def get(self, pk, sk):
        it = self.items.get((pk, sk))
        return json.loads(json.dumps(it)) if it else None

    def put(self, item):
        self.items[(item["PK"], item["SK"])] = json.loads(json.dumps(item))
        return item

    def update(self, pk, sk, fields):
        it = self.items.get((pk, sk), {"PK": pk, "SK": sk})
        it.update(json.loads(json.dumps(fields)))
        self.items[(pk, sk)] = it
        return json.loads(json.dumps(it))

    def delete(self, pk, sk):
        self.items.pop((pk, sk), None)

    def query_pk(self, pk, prefix=None):
        return [json.loads(json.dumps(v)) for (p, s), v in sorted(self.items.items())
                if p == pk and (prefix is None or s.startswith(prefix))]

    def query_gsi1(self, gsi1pk):
        return [json.loads(json.dumps(v)) for v in self.items.values() if v.get("GSI1PK") == gsi1pk]

    def add(self, pk, sk, field, amount):
        it = self.items.setdefault((pk, sk), {"PK": pk, "SK": sk})
        it[field] = int(it.get(field, 0)) + amount
        return it[field]
