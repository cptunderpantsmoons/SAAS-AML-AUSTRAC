from __future__ import annotations

from typing import ClassVar

from lxml import etree

from austrac_reporting.models import ReportPayload


class XMLBuildError(Exception):
    """Raised when XML construction fails."""


class ReportXMLBuilder:
    """Base XML builder for AUSTRAC reports."""

    NAMESPACE = "http://www.austrac.gov.au/reporting"
    NSMAP: ClassVar[dict[str, str]] = {"au": NAMESPACE}

    def __init__(self, payload: ReportPayload) -> None:
        self._payload = payload

    def _add_text_child(self, parent: etree._Element, tag: str, text: str) -> etree._Element:
        child = etree.SubElement(parent, tag)
        child.text = text
        return child

    def _build_reporting_entity(self, parent: etree._Element) -> None:
        re = self._payload.reporting_entity
        entity = etree.SubElement(parent, "ReportingEntity")
        self._add_text_child(entity, "Name", re.name)
        self._add_text_child(entity, "ABN", re.abn)
        self._add_text_child(entity, "Sector", re.sector)
        self._add_text_child(entity, "ContactEmail", re.contact_email)
        self._add_text_child(entity, "ContactPhone", re.contact_phone)

    def _build_subject(self, parent: etree._Element) -> None:
        subj = self._payload.subject
        subject = etree.SubElement(parent, "Subject")
        self._add_text_child(subject, "SubjectType", subj.subject_type.value)
        self._add_text_child(subject, "FullName", subj.full_name)
        if subj.date_of_birth:
            self._add_text_child(subject, "DateOfBirth", subj.date_of_birth)
        if subj.identifiers:
            ids = etree.SubElement(subject, "Identifiers")
            for identifier_dict in subj.identifiers:
                for key, value in identifier_dict.items():
                    self._add_text_child(ids, "Identifier", f"{key}:{value}")

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

    def _build_source_hash(self, parent: etree._Element) -> None:
        self._add_text_child(parent, "SourceDataHash", self._payload.source_data_hash)

    def _build_created_at(self, parent: etree._Element) -> None:
        self._add_text_child(parent, "CreatedAt", self._payload.created_at.isoformat())

    def build(self) -> str:
        """Build XML string. Must be overridden by subclasses."""
        raise NotImplementedError
