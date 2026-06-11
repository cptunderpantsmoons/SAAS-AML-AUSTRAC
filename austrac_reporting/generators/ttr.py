from __future__ import annotations

from lxml import etree

from austrac_reporting.xml_builder import ReportXMLBuilder


class TTRGenerator(ReportXMLBuilder):
    """Threshold Transaction Report XML generator."""

    THRESHOLD_AMOUNT = 10000.0

    def _build_transactions(self, parent: etree._Element) -> None:
        if not self._payload.transactions:
            return
        txs = etree.SubElement(parent, "Transactions")
        for tx in self._payload.transactions:
            tx_el = etree.SubElement(txs, "Transaction")
            self._add_text_child(tx_el, "TransactionId", tx.transaction_id)
            self._add_text_child(tx_el, "Date", tx.date)
            self._add_text_child(tx_el, "Amount", str(tx.amount))
            self._add_text_child(tx_el, "Currency", tx.currency)
            if tx.accounts:
                accts = etree.SubElement(tx_el, "Accounts")
                for account in tx.accounts:
                    self._add_text_child(accts, "Account", account)
            if tx.description:
                self._add_text_child(tx_el, "Description", tx.description)
            self._add_text_child(tx_el, "TransactionPurpose", tx.description or "Not provided")

    def build(self) -> str:
        root = etree.Element("ThresholdTransactionReport")
        self._add_text_child(root, "ReportId", str(self._payload.report_id))
        self._build_reporting_entity(root)
        total = sum(tx.amount for tx in self._payload.transactions)
        threshold_crossed = total >= self.THRESHOLD_AMOUNT
        self._add_text_child(root, "ThresholdCrossed", "true" if threshold_crossed else "false")
        self._build_transactions(root)
        self._build_source_hash(root)
        self._build_created_at(root)
        xml_bytes: bytes = etree.tostring(
            root,
            pretty_print=True,
            xml_declaration=True,
            encoding="UTF-8",
        )
        return xml_bytes.decode("utf-8")
