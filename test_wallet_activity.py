import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock
from wallet_activity import normalize, apply_parent_status
from json_store import load_json, save_json

A, B = ["0x"+c*40 for c in "ab"]
TX = "0x"+"1"*64


def regular(**extra):
    return dict(hash=TX, transactionStatus="0x1", **{"from": A, "to": B},
                value="78639000000000000000001", timestamp="1793550000", blockNumber="123",
                gasUsed="21000", effectiveGasPrice="100000000001", **extra)


class WalletActivityTests(unittest.TestCase):
    def test_regular_values_fees_and_failures(self):
        raw = regular()
        row = normalize(raw, "regular")
        self.assertEqual(row["amount_wei"], raw["value"])
        self.assertEqual(row["fee_wei"], str(21000*100000000001))
        failed = normalize({**raw, "transactionStatus": "0x0"}, "regular")
        self.assertEqual(failed["amount_wei"], "0")
        self.assertEqual(failed["attempted_wei"], raw["value"])
        self.assertEqual(failed["fee_wei"], row["fee_wei"])

    def test_internal_root_duplicates_are_removed_but_distinct_traces_survive(self):
        raw = dict(transactionHash=TX, **{"from": B, "to": A}, value="1", timestamp="1793550000",
                   blockNumber="123", error="", addressTrace="0_0", top=0)
        row = normalize(raw, "internal")
        self.assertEqual(row["status"], "reported")
        self.assertIsNone(row["fee_wei"])
        self.assertIsNone(normalize({**raw, "top": 1}, "internal"))
        self.assertIsNone(normalize({**raw, "addressTrace": "0"}, "internal"))
        other = normalize({**raw, "addressTrace": "0_1"}, "internal")
        self.assertNotEqual(row["id"], other["id"])
        failed_parent = normalize({**regular(), "transactionStatus": "0x0"}, "regular")
        self.assertEqual(apply_parent_status([failed_parent,row])[1]["amount_wei"], "0")

    def test_collector_keeps_regular_and_internal_coverage_and_survives_query_failure(self):
        import collect_wallet_activity
        internal = dict(transactionHash=TX, **{"from": B, "to": A}, value="10", timestamp="1793550000",
                        blockNumber="123", error="", addressTrace="0_0", top=0)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            session = MagicMock()
            def get(url, **kwargs):
                response = MagicMock()
                response.json.return_value = dict(transactions=[internal] if url.endswith('tx-list-internal') else [regular()])
                return response
            session.get.side_effect = get
            with patch.object(collect_wallet_activity, "Path", side_effect=lambda name: root/name), \
                 patch.object(collect_wallet_activity.requests, "Session", return_value=session), \
                 patch.object(collect_wallet_activity.time, "sleep"):
                first = collect_wallet_activity.collect([A])
                self.assertEqual(len(first["transactions"]), 2)
                self.assertTrue(first["wallets"][A]["regular"]["complete"])
                self.assertTrue(first["wallets"][A]["internal"]["complete"])
                session.get.side_effect = collect_wallet_activity.requests.Timeout("unavailable")
                failed = collect_wallet_activity.collect([A])
                self.assertEqual(failed["transactions"], first["transactions"])
                self.assertTrue(failed["partial"])
                self.assertEqual(load_json(root/"wallet_activity.json"), failed)

    def test_static_export_has_on_demand_snapshots_and_transfer_only_cache(self):
        import os
        from generate_wallet import generate_wallet
        original = Path.cwd()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            save_json(root/"wallet_activity.json", dict(wallets={A:dict(regular=dict(complete=True),internal=dict(complete=False))},transactions=[normalize(regular(),"regular")]),list_field="transactions")
            save_json(root/"funding_history.json", dict(transfers=[dict(tx_hash=TX,**{"from":A,"to":B},amount_wei="1",at=1793550000)]),list_field="transfers")
            try:
                os.chdir(root)
                html = generate_wallet()
                self.assertIn("Internal transactions",html)
                self.assertNotIn('let fundingData=',html)
                index=json.loads((root/"wallet-data/index.json").read_text())
                snapshot=json.loads((root/"wallet-data"/index["snapshots"][A]).read_text())
                self.assertEqual(snapshot["transactions"][0]["amount_wei"],regular()["value"])
                cache=json.loads((root/"wallet-data/funding-bb.json").read_text())
                self.assertIsNone(cache[B][0]["fee_wei"])
            finally:
                os.chdir(original)

    def test_time_budget_stops_network_calls_and_retains_the_database(self):
        import collect_wallet_activity
        row = normalize(regular(), "regular")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            save_json(root/"wallet_activity.json", dict(schema_version=1,chain_id=1111,wallets={A:{}},transactions=[row]),list_field="transactions")
            session = MagicMock()
            with patch.object(collect_wallet_activity, "Path", side_effect=lambda name: root/name), \
                 patch.object(collect_wallet_activity.requests, "Session", return_value=session), \
                 patch.object(collect_wallet_activity.time, "monotonic", side_effect=[0,20]):
                result=collect_wallet_activity.collect([A],max_seconds=10)
            session.get.assert_not_called()
            self.assertTrue(result["partial"])
            self.assertTrue(result["time_limit_reached"])
            self.assertEqual(result["transactions"],[row])


if __name__ == "__main__":
    unittest.main()
