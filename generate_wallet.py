"""Build the wallet page and same-origin activity assets for static Pages hosting."""
import json
from collections import defaultdict
from pathlib import Path
from json_store import load_json
from wallet_activity import address


def generate_wallet():
    root, assets = Path(__file__).parent, Path("wallet-data")
    assets.mkdir(exist_ok=True)
    wallet_path, funding_path = Path("wallet_activity.json"), Path("funding_history.json")
    activity = load_json(wallet_path) if wallet_path.exists() else {"wallets": {}, "transactions": []}
    funding = load_json(funding_path) if funding_path.exists() else {"transfers": []}
    index = dict(schema_version=1, snapshots={}, funding_checked_at=funding.get("checked_at"))
    native = defaultdict(list)
    for transfer in funding["transfers"]:
        row = dict(id="regular:"+transfer["tx_hash"]+":", kind="regular", tx_hash=transfer["tx_hash"],
                   trace_id="", **{"from": transfer["from"], "to": transfer["to"]}, amount_wei=transfer["amount_wei"],
                   fee_wei=None, at=transfer["at"], block_number=transfer.get("block_number"), status="success", source="Funding transfer cache")
        for wallet in {row["from"], row["to"]}:
            native[wallet].append(row)
    by_wallet = defaultdict(list)
    for row in activity["transactions"]:
        for wallet in {row["from"], row["to"]} & activity["wallets"].keys():
            by_wallet[wallet].append(row)
    for wallet, coverage in activity["wallets"].items():
        if address(wallet) != wallet:
            raise ValueError("Invalid wallet address in the activity database")
        rows = {row["id"]: row for row in native.get(wallet, [])}
        rows.update({row["id"]: row for row in by_wallet[wallet]})
        filename = "snapshot-"+wallet+".json"
        payload = dict(schema_version=1, wallet=wallet, coverage=coverage, transactions=list(rows.values()), source="WEMIX Scan wallet snapshot")
        (assets / filename).write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        index["snapshots"][wallet] = filename
    buckets = defaultdict(dict)
    for wallet, rows in native.items():
        buckets[wallet[2:4]][wallet] = rows
    for prefix in (format(i, "02x") for i in range(256)):
        (assets / ("funding-"+prefix+".json")).write_text(json.dumps(buckets[prefix], separators=(",", ":")), encoding="utf-8")
    (assets / "index.json").write_text(json.dumps(index, separators=(",", ":")), encoding="utf-8")
    html = (root / "wallet-template.html").read_text(encoding="utf-8")
    html = html.replace("__THEME_CSS__", (root / "theme.css").read_text(encoding="utf-8"))
    html = html.replace("__WALLET_CSS__", (root / "wallet.css").read_text(encoding="utf-8"))
    script = "\n".join((root / file).read_text(encoding="utf-8") for file in ("wallet-core.js", "wallet.js"))
    return html.replace("__WALLET_SCRIPT__", script)
