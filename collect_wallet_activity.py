"""Collect regular transactions and internal traces for a bounded wallet watchlist."""
import argparse
import os
import time
from pathlib import Path
import requests
from json_store import load_json, save_json
from wallet_activity import address, normalize, apply_parent_status, now


def collect(wallets=(), *, page_limit=3, wallet_limit=5, max_seconds=180):
    if not 1 <= page_limit <= 10 or wallet_limit < 1 or max_seconds <= 0:
        raise ValueError("Pages must be 1–10; wallet and time limits must be positive")
    requested = [address(wallet) for wallet in wallets]
    if not all(requested):
        raise ValueError("Enter a full 0x wallet address")
    path = Path("wallet_activity.json")
    old = load_json(path) if path.exists() else {}
    if old and (old.get("schema_version") != 1 or old.get("chain_id") != 1111):
        raise ValueError("Unsupported wallet activity database")
    coverage = old.get("wallets", {})
    records = {row["id"]: row for row in old.get("transactions", [])}
    result = dict(schema_version=1, chain_id=1111, asset="WEMIX", checked_at=now(),
                  source="WEMIX Scan", wallets=coverage, transactions=[], partial=False,
                  time_limit_reached=False, wallets_checked=0)
    priority = sorted(dict.fromkeys(requested), key=lambda wallet: (coverage.get(wallet, {}).get("attempted_at", ""), wallet))
    remaining = sorted(set(coverage) - set(priority), key=lambda wallet: (coverage[wallet].get("attempted_at", ""), wallet))
    pending = priority + remaining
    processed = set()
    deadline, session = time.monotonic() + max_seconds, requests.Session()

    def save():
        result["transactions"] = apply_parent_status(list(records.values()))
        result["checked_at"] = now()
        result["wallets_checked"] = len(processed)
        result["partial"] = bool(set(pending)-processed) or result["time_limit_reached"] or any(not item.get(kind, {}).get("complete") or item.get(kind, {}).get("error")
                                for item in coverage.values() for kind in ("regular", "internal"))
        save_json(path, result, list_field="transactions")

    for wallet in pending[:wallet_limit]:
        if deadline - time.monotonic() < 1:
            result["time_limit_reached"] = True
            break
        prior = coverage.get(wallet, {})
        current = {**prior, "attempted_at": now()}
        coverage[wallet] = current
        for kind, endpoint in (("regular", "tx-list"), ("internal", "tx-list-internal")):
            if deadline - time.monotonic() < 1:
                result["time_limit_reached"] = True
                current[kind] = {**prior.get(kind, {}), "complete": False, "error": "Refresh time limit reached"}
                continue
            previous = prior.get(kind, {})
            known = {row["id"] for row in records.values() if row["kind"] == kind and wallet in (row["from"], row["to"])}
            state = dict(complete=False, records_checked=0, checked_at=previous.get("checked_at"), attempted_at=now())
            current[kind] = state
            try:
                for page in range(1, page_limit + 1):
                    if deadline - time.monotonic() < 1:
                        result["time_limit_reached"] = True
                        state["error"] = "Refresh time limit reached"
                        break
                    time.sleep(.55)
                    available = deadline - time.monotonic()
                    if available <= 0:
                        result["time_limit_reached"] = True
                        state["error"] = "Refresh time limit reached"
                        break
                    response = session.get(f"https://scan.wemix.com/api/account/{wallet}/{endpoint}",
                                           params=dict(chain="wemix", page=page, offset=1000, sort="desc"),
                                           timeout=(min(5, available / 3), min(20, available * 2 / 3)))
                    response.raise_for_status()
                    rows = response.json().get("transactions")
                    if not isinstance(rows, list):
                        raise ValueError("Wallet API response schema changed")
                    state["records_checked"] += len(rows)
                    overlap = False
                    for raw in rows:
                        row = normalize(raw, kind)
                        if row is not None and wallet in (row["from"], row["to"]):
                            overlap |= row["id"] in known
                            records[row["id"]] = row
                    state["checked_at"] = now()
                    if len(rows) < 1000 or previous.get("complete") and not previous.get("error") and overlap:
                        state["complete"] = True
                        break
            except (requests.RequestException, KeyError, TypeError, ValueError) as error:
                state["error"] = str(error)
            print(f"Wallet activity: {wallet} | {kind} | {state['records_checked']} records | {'complete' if state['complete'] else 'partial'}", flush=True)
        processed.add(wallet)
        save()
    save()
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--wallet", action="append", default=[])
    parser.add_argument("--config", default="wallet_activity_config.json")
    args = parser.parse_args()
    config = load_json(args.config)
    manual = os.environ.get("REQUESTED_WALLET", "").strip()
    wallets = args.wallet or ([manual] if manual else config.pop("wallets"))
    config.pop("wallets", None)
    result = collect(wallets, **config)
    print(f"Saved {len(result['transactions'])} activity records; {'partial' if result['partial'] else 'complete'} coverage")
