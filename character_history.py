"""Durable observations keyed by NFT ID, never by mutable character name."""
import csv
import re
from pathlib import Path
from json_store import load_json, save_json

HISTORY_PATH = Path("character_history.json")


def clean_price(value):
    value = str(value or "").strip()
    return value if re.fullmatch(r"\d[\d,]*(?:\.\d+)?", value) else ""


def load_history(path=HISTORY_PATH, csv_path="characters.csv"):
    if Path(path).exists():
        return load_json(path)
    history = {}
    if Path(csv_path).exists():
        with open(csv_path, encoding="utf-8", newline="") as source:
            for row in csv.DictReader(source):
                history[row["nft_id"]] = {
                    "names": [{"name": row["character_name"], "first_seen": None,
                               "last_seen": None}],
                    "last_known_price": clean_price(row.get("starting_price")),
                    "last_known_price_at": None,
                    "last_known_price_source": "Legacy archive (date unknown)",
                    "character": {**row, "nft_id": int(row["nft_id"]),
                                  "starting_price": "", "market": {}},
                }
    return history


def observe(history, character, checked_at):
    entry = history.setdefault(str(character["nft_id"]), {"names": []})
    names = entry["names"]
    name = character["character_name"]
    if not names or names[-1]["name"] != name:
        names.append({"name": name, "first_seen": checked_at, "last_seen": checked_at})
    else:
        names[-1]["last_seen"] = checked_at
    market = character.get("market", {})
    previous = entry.get("character", {}).get("market", {})
    if market.get("error"):
        # Retain successful state with its original age and show the failed attempt.
        market = {**previous, "error": market["error"], "attempted_at": checked_at}
        character = {**character, "market": market, "starting_price": market.get("listed_price", "")}
    entry["last_scan"] = {"status": "ok", "attempted_at": checked_at}
    price = market.get("listed_price") or market.get("previous_price")
    if price and not market.get("error"):
        entry.update(last_known_price=price, last_known_price_at=checked_at,
                     last_known_price_source="Observed listing" if market.get("listed_price")
                     else "Marketplace previous price",
                     last_known_currency=market.get("listed_currency") if market.get("listed_price")
                     else market.get("previous_currency"))
    if not market.get("error") and market.get("checked_at"):
        prices = entry.setdefault("prices", [])
        for kind, amount, currency in [
            ("listing", market.get("listed_price", ""), market.get("listed_currency", "")),
            ("marketplace previous price", market.get("previous_price", ""), market.get("previous_currency", "")),
        ]:
            # Empty listing observations record a listing ending, never a zero price.
            if not amount and kind != "listing":
                continue
            prior = next((p for p in reversed(prices) if p["kind"] == kind), None)
            state = (amount, currency if amount else "", market.get("status") if kind == "listing" else None)
            if prior and (prior["price"], prior["currency"], prior.get("status")) == state:
                prior["last_seen"] = checked_at
            elif amount or prior:
                prices.append({"kind": kind, "price": amount, "currency": state[1],
                               "status": state[2], "first_seen": checked_at, "last_seen": checked_at})
        owner = market.get("owner")
        if owner:
            owners = entry.setdefault("owners", [])
            if not owners or owners[-1]["wallet"] != owner:
                owners.append({"wallet": owner, "first_seen": checked_at, "last_seen": checked_at})
            else:
                owners[-1]["last_seen"] = checked_at
    transfer_result = character.get("transfers")
    if transfer_result and not transfer_result.get("error"):
        existing = {transfer_key(event): event for event in entry.get("transfers", [])}
        for event in transfer_result.get("events", []):
            existing[transfer_key(event)] = event
        entry["transfers"] = sorted(existing.values(), key=lambda event: (event["at"], event["tx_hash"]))
        entry["transfer_check"] = {key: value for key, value in transfer_result.items() if key != "events"}
    elif transfer_result:
        entry["transfer_check"] = {**entry.get("transfer_check", {}),
                                   "error": transfer_result["error"], "attempted_at": checked_at}
    entry["character"] = {key: value for key, value in character.items() if key != "transfers"}


def transfer_key(event):
    return tuple(event.get(key) for key in ("chain", "tx_hash", "event", "from", "to"))


def record_scan_failure(history, nft_id, status, checked_at):
    if str(nft_id) in history:
        history[str(nft_id)]["last_scan"] = {"status": status, "attempted_at": checked_at}


def save_history(history, path=HISTORY_PATH):
    save_json(path, history)
