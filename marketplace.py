"""Read the public WEMIX detail page's server-rendered NFT state."""
import json
import time
import re
import math
from decimal import Decimal, InvalidOperation, localcontext
from bs4 import BeautifulSoup

COLLECTION = "0x58f803dcd53edd804cece0d59166785fdd4735f9"
BASE_URL = f"https://wemixplay.com/nft/marketplace/detail/{COLLECTION}/"
# Verified against the rendered 1,200 price and raw 1200 * 10**18 amount.
TOKEN_DECIMALS = {"0x7d72b22a74a216af4a002a1095c8c707d6ec1c5f": 18}
API_URL = "https://api.wemixplay.com"
MARKET_SCHEMA_VERSION = 2


def wallet_address(value):
    value = str(value or "").lower()
    return value if re.fullmatch(r"0x[0-9a-f]{40}", value) and value != "0x" + "0" * 40 else ""


def parse_transfers(payload, nft_id):
    if not isinstance(payload, dict) or payload.get("result") != 0:
        raise ValueError("Marketplace ownership history request was unsuccessful")
    data = payload.get("data", {})
    rows = data.get("history")
    if not isinstance(rows, list) or not isinstance(data.get("totalCount"), int):
        raise ValueError("Marketplace ownership history schema changed")
    events = []
    for row in rows:
        if str(row.get("tid")) != str(nft_id):
            raise ValueError("Ownership history contains a different NFT")
        tx = str(row.get("txHash", "")).lower()
        if not re.fullmatch(r"0x[0-9a-f]{64}", tx) or not isinstance(row.get("date"), (int, float)):
            raise ValueError("Ownership history contains an invalid transaction")
        events.append({"tx_hash": tx, "event": str(row.get("event", "Unknown")),
                       "from": wallet_address(row.get("from")), "to": wallet_address(row.get("to")),
                       "at": row["date"], "chain": str(row.get("chainName", "")),
                       "price": token_price(row.get("value"), row.get("payment")),
                       "currency": row.get("payment", ""), "source": "WEMIX transfer history"})
    return {"events": events, "total_count": data["totalCount"],
            "all_returned": len(rows) == data["totalCount"]}


def fetch_transfers(session, nft_id):
    # Read-only query used by WEMIX's public NFT history table; no wallet login.
    response = session.post(API_URL + "/market/order/trade-history",
                            json={"address": COLLECTION, "tid": nft_id}, timeout=(10, 45))
    response.raise_for_status()
    return parse_transfers(response.json(), nft_id)


def token_price(price, currency):
    if not isinstance(price, dict) or price.get("valid") is not True:
        return ""
    decimals = TOKEN_DECIMALS.get(str(currency).lower())
    if decimals is None:
        return ""  # Do not guess the denomination of a new token.
    try:
        with localcontext() as ctx:
            ctx.prec = 100
            value = Decimal(price["amount"]) / Decimal(10) ** decimals
            if not value.is_finite() or value < 0:
                return ""
            return format(value, ",f").rstrip("0").rstrip(".") if "." in format(value, ",f") else format(value, ",f")
    except (InvalidOperation, KeyError, TypeError, ValueError):
        return ""


def parse_marketplace(html, nft_id, now=None):
    soup = BeautifulSoup(html, "html.parser")
    script = soup.find("script", id="__NEXT_DATA__")
    data = json.loads(script.string) if script else {}
    info = data.get("props", {}).get("pageProps", {}).get("nftInfo")
    return parse_market_info(info, nft_id, now)


def parse_market_info(info, nft_id, now=None):
    if not isinstance(info, dict) or str(info.get("tid")) != str(nft_id) or str(info.get("collectionAddress", "")).lower() != COLLECTION:
        raise ValueError("Marketplace NFT data missing or mismatched")
    flags = info.get("currentStatus") or info.get("nftConditionStatus") or {}
    blocked = any(info.get(key) is True for key in ("isHide", "isBlock", "isBurned"))
    auction = flags.get("isAuction") is True
    sale = flags.get("isSales") is True
    deadline = info.get("auctionEndTime")
    countdown = flags.get("isBidOngoing") is True or flags.get("isShowDetailBidCountDown") is True
    upcoming = flags.get("isBidSoon") is True
    # Before the first bid WEMIX can supply an old provisional auctionEndTime.
    # Its UI only uses that value when a bidding countdown is active.
    valid_deadline = isinstance(deadline, (int, float)) and math.isfinite(deadline) and deadline > 0
    ended = auction and countdown and not upcoming and valid_deadline and deadline <= (time.time() if now is None else now)
    order = info.get("order") or {}
    cancelled = bool(order.get("canceledTime"))
    sold = flags.get("isBidSuccess") is True or bool(order.get("concludedTime"))
    bid = flags.get("isBidOngoing") is True or flags.get("isBidding") is True
    offer = flags.get("isPossibleOffer")
    status = ("Unavailable" if blocked else "Listing cancelled" if cancelled else "Sold" if sold else "Auction upcoming" if auction and upcoming else "Auction ended" if ended else "Auction" if auction else "Listed" if sale
              else "Open to offers" if offer is True else "Not listed" if info.get("onSale") == 0 else "Unknown")
    closed = blocked or cancelled or sold or ended
    return {
        "schema_version": MARKET_SCHEMA_VERSION,
        "owner": wallet_address(info.get("owner")),
        "status": status,
        "listed_price": token_price(info.get("orderPrice") or order.get("price"), info.get("orderCurrency") or order.get("payment")) if (auction or sale) and not closed else "",
        "listed_currency": info.get("orderCurrency") or order.get("payment", ""),
        "previous_price": token_price(info.get("lastPrice"), info.get("lastCurrency")),
        "previous_currency": info.get("lastCurrency", ""),
        "can_bid": False if closed or upcoming else bid if "isBidOngoing" in flags or "isBidding" in flags else None,
        "can_offer": False if closed else offer if isinstance(offer, bool) else None,
        "auction_end": deadline if auction and countdown and not upcoming and valid_deadline else None,
        "auction_countdown_active": bool(auction and countdown and not upcoming and valid_deadline),
        "auction_phase": "upcoming" if upcoming else "ended" if ended else "bidding" if auction and countdown else "awaiting_bid" if auction and bid else None,
        "auction_start": order.get("startTime") if upcoming else None,
    }


def fetch_marketplace(session, nft_id):
    info = fetch_nft_data(session, nft_id)
    return parse_market_info(info, nft_id)


def fetch_nft_data(session, nft_id):
    response = session.get(API_URL + "/market/explore/v3/nft-detail",
                           params={"address": COLLECTION, "tid": nft_id}, timeout=(5, 20))
    response.raise_for_status()
    payload = response.json()
    if payload.get("result") == 203 and payload.get("data", {}).get("result") is None:
        return None
    if payload.get("result") != 0:
        raise ValueError("Marketplace NFT query failed")
    info = payload.get("data", {}).get("result")
    if not isinstance(info, dict):
        raise ValueError("Marketplace NFT schema changed")
    parse_market_info(info, nft_id)  # Validate identity before using metadata.
    return info
