"""Normalize wallet activity without merging internal traces into external transfers."""
import re
from datetime import datetime, timezone


def address(value):
    value = str(value or "").lower()
    return value if re.fullmatch(r"0x[0-9a-f]{40}", value) else ""


def normalize(row, kind):
    if kind not in ("regular", "internal"):
        raise ValueError("Unknown activity kind")
    if kind == "internal" and (row.get("top") in (True, 1, "1", "true") or str(row.get("addressTrace")) == "0"):
        return None  # WEMIX Scan repeats the regular/root call in its internal list.
    tx_hash = str(row.get("hash") if kind == "regular" else row.get("transactionHash", "")).lower()
    sender, recipient = address(row.get("from")), address(row.get("to"))
    trace = str(row.get("addressTrace") or row.get("transferIndex") or row.get("uuid") or "") if kind == "internal" else ""
    try:
        value, at = int(row["value"]), int(row["timestamp"])
        block = int(row["blockNumber"])
        if value < 0 or at <= 0 or block < 0 or not sender or not re.fullmatch(r"0x[0-9a-f]{64}", tx_hash) or kind == "internal" and not trace:
            return None
    except (KeyError, ValueError, TypeError):
        return None
    if kind == "regular":
        status = {"0x1": "success", "0x0": "failed"}.get(row.get("transactionStatus"), "unknown")
    else:
        status = "failed" if row.get("error") else "reported"
    fee = None
    if kind == "regular":
        try:
            gas, price = int(row["gasUsed"]), int(row.get("effectiveGasPrice") or row["gasPrice"])
            if gas >= 0 and price >= 0:
                fee = str(gas * price)
        except (KeyError, ValueError, TypeError):
            pass
    return dict(id=f"{kind}:{tx_hash}:{trace}", kind=kind, tx_hash=tx_hash, trace_id=trace,
                **{"from": sender, "to": recipient}, amount_wei=str(value if status != "failed" else 0),
                attempted_wei=str(value), fee_wei=fee, at=at, block_number=block, status=status, source="WEMIX Scan")


def apply_parent_status(rows):
    parents = {row["tx_hash"]: row["status"] for row in rows if row["kind"] == "regular"}
    for row in rows:
        if row["kind"] != "internal":
            continue
        parent = parents.get(row["tx_hash"])
        if parent == "failed":
            row.update(status="failed", amount_wei="0")
        elif parent == "success" and row["status"] == "reported":
            row["status"] = "success"
    return rows


def now():
    return datetime.now(timezone.utc).isoformat()
