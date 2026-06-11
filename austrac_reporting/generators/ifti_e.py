from __future__ import annotations

from lxml import etree

from austrac_reporting.xml_builder import ReportXMLBuilder


class IFTIEGenerator(ReportXMLBuilder):
    """International Funds Transfer Instruction XML generator."""

    def build(self) -> str:
        root = etree.Element("InternationalFundsTransferInstruction")
        self._add_text_child(root, "ReportId", str(self._payload.report_id))
        self._build_reporting_entity(root)

        if self._payload.transactions:
            tx = self._payload.transactions[0]
            transfer = etree.SubElement(root, "TransferDetails")
            self._add_text_child(transfer, "Amount", str(tx.amount))
            self._add_text_child(transfer, "Currency", tx.currency)
            ordering_country = self._payload.metadata.get("ordering_country", "AU")
            destination_country = self._payload.metadata.get("destination_country", "")
            transfer_date = tx.date
            self._add_text_child(transfer, "OrderingCountry", ordering_country)
            self._add_text_child(transfer, "DestinationCountry", destination_country)
            self._add_text_child(transfer, "TransferDate", transfer_date)
            self._add_text_child(transfer, "TransactionPurpose", tx.description or "Not provided")

            ordering = self._payload.metadata.get("ordering_customer", {})
            if ordering:
                cust = etree.SubElement(root, "OrderingCustomer")
                self._add_text_child(cust, "FullName", ordering.get("full_name", self._payload.subject.full_name))
                if "address" in ordering:
                    self._add_text_child(cust, "Address", ordering["address"])
                if "account_number" in ordering:
                    self._add_text_child(cust, "AccountNumber", ordering["account_number"])

            beneficiary = self._payload.metadata.get("beneficiary_customer", {})
            if beneficiary:
                cust = etree.SubElement(root, "BeneficiaryCustomer")
                self._add_text_child(cust, "FullName", beneficiary.get("full_name", "Unknown"))
                if "address" in beneficiary:
                    self._add_text_child(cust, "Address", beneficiary["address"])
                if "account_number" in beneficiary:
                    self._add_text_child(cust, "AccountNumber", beneficiary["account_number"])

        self._build_source_hash(root)
        self._build_created_at(root)
        xml_bytes: bytes = etree.tostring(
            root,
            pretty_print=True,
            xml_declaration=True,
            encoding="UTF-8",
        )
        return xml_bytes.decode("utf-8")
