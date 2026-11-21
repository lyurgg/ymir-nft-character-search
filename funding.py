"""Evidence matching for a common native-WEMIX funder before NFT purchases."""
from datetime import datetime, timezone
from bisect import bisect_left
from decimal import Decimal
from marketplace import wallet_address

PURCHASE_EVENTS = {"Auction-Buy", "Offer-Bid-Buy", "Sale-Buy"}


def native_transfer(row):
    """Normalize a WEMIX Explorer native transaction; exclude failed/zero calls."""
    if str(row.get("tx_status")) != "1":
        return None
    sender, recipient = wallet_address(row.get("sender")), wallet_address(row.get("receiver"))
    try:
        amount = int(row["value"])
        at = datetime.fromisoformat(row["timestamp"].replace("Z", "+00:00")).timestamp()
        tx = row["transaction_hash"].lower()
        if amount <= 0 or not sender or not recipient or len(tx) != 66 or not tx.startswith("0x"):
            return None
        int(tx[2:], 16)
    except (KeyError, ValueError, TypeError):
        return None
    return {"from": sender, "to": recipient, "amount_wei": str(amount), "at": at,
            "tx_hash": tx, "asset": "WEMIX", "chain_id": 1111}


def scan_native_transfer(row):
    """Current CertiK WEMIX Scan schema, documented under /api/account/tx-list."""
    if row.get("transactionStatus") != "0x1":
        return None
    try:
        normalized = dict(sender=row["from"], receiver=row["to"], value=row["value"],
                          timestamp=datetime.fromtimestamp(int(row["timestamp"]), timezone.utc).isoformat(),
                          transaction_hash=row["hash"], tx_status="1")
    except (KeyError, ValueError, TypeError, OverflowError):
        return None
    transfer = native_transfer(normalized)
    if transfer:
        transfer.update(block_number=row.get("blockNumber"), transaction_index=row.get("transactionIndex"))
    return transfer


def purchase_records(history, nft_ids):
    purchases = []
    for nft_id in nft_ids:
        entry = history.get(str(nft_id), {})
        for event in entry.get("transfers", []):
            if event.get("event") not in PURCHASE_EVENTS or event.get("chain") != "mainnet" or not wallet_address(event.get("to")):
                continue
            purchases.append({"nft_id": int(nft_id), "buyer": event["to"].lower(),
                              "at": event["at"], "tx_hash": event["tx_hash"],
                              "price": event.get("price", ""), "currency": event.get("currency", "")})
    return purchases


def funding_branches(purchases, transfers, lookback_days=7, minimum_wemix="1", excluded=(),
                     max_depth=1, max_search_steps=20000, include_buyer_roots=False):
    if max_depth not in (1, 2, 3):
        raise ValueError("Maximum funding depth must be 1, 2, or 3")
    minimum = Decimal(minimum_wemix) * 10**18
    excluded = {address.lower() for address in excluded}
    incoming = {}
    for transfer in transfers:
        if transfer.get("asset") != "WEMIX" or transfer.get("chain_id") != 1111:
            continue
        if transfer["from"] in excluded or transfer["to"] in excluded or transfer["from"] == transfer["to"]:
            continue
        if Decimal(transfer["amount_wei"]) >= minimum:
            incoming.setdefault(transfer["to"], []).append(transfer)
    for rows in incoming.values():
        rows.sort(key=lambda row: row["at"])
    candidates, searched = {}, set()
    steps, truncated = 0, False
    for purchase in purchases:
        if purchase["buyer"] in excluded:
            continue
        if include_buyer_roots:
            key = (purchase["nft_id"], purchase.get("tx_hash"), purchase["at"])
            candidates.setdefault(purchase["buyer"], {})[key] = {"purchase": purchase, "funding": None, "path": [], "depth": 0}
        queue = [(purchase["buyer"], purchase["at"], [], {purchase["buyer"]})]
        for wallet, cutoff, downstream, visited in queue:
            searched.add(wallet)
            rows = incoming.get(wallet, [])
            start = bisect_left(rows, purchase["at"] - lookback_days * 86400, key=lambda row: row["at"])
            end = bisect_left(rows, cutoff, key=lambda row: row["at"])
            for transfer in rows[start:end]:
                steps += 1
                if steps > max_search_steps:
                    truncated = True
                    break
                if not purchase["at"] - lookback_days * 86400 <= transfer["at"] < cutoff or transfer["from"] in visited:
                    continue
                path = [transfer, *downstream]
                key = (purchase["nft_id"], purchase.get("tx_hash"), purchase["at"])
                prior = candidates.setdefault(transfer["from"], {}).get(key)
                if prior is None or len(path) < prior["depth"]:
                    candidates[transfer["from"]][key] = {"purchase": purchase, "funding": path[-1], "path": path, "depth": len(path)}
                if len(path) < max_depth:
                    queue.append((transfer["from"], transfer["at"], path, visited | {transfer["from"]}))
            if truncated:
                break
        if truncated:
            break
    return candidates, searched, truncated


def common_funders(purchases, transfers, lookback_days=7, minimum_wemix="1", excluded=(), max_depth=1, include_buyer_roots=False):
    """Shared upstream sources with strictly chronological, cycle-free branches."""
    candidates, _, _ = funding_branches(purchases, transfers, lookback_days, minimum_wemix, excluded, max_depth,
                                       include_buyer_roots=include_buyer_roots)
    return [{"source": source, "evidence": list(rows.values())} for source, rows in candidates.items()
            if len({row["purchase"]["nft_id"] for row in rows.values()}) >= 2
            and (len({row["purchase"]["buyer"] for row in rows.values()}) >= 2
                 or include_buyer_roots and all(row["depth"] == 0 for row in rows.values()))]
