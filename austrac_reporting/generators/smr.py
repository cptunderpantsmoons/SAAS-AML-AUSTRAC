from __future__ import annotations

from lxml import etree

from austrac_reporting.xml_builder import ReportXMLBuilder


class SMRGenerator(ReportXMLBuilder):
    """Suspicious Matter Report XML generator."""

    def build(self, narrative: str | None = None) -> str:
        root = etree.Element("SuspiciousMatterReport")
        self._add_text_child(root, "ReportId", str(self._payload.report_id))
        self._build_reporting_entity(root)
        self._build_subject(root)

        susp = self._payload.suspicion
        susp_el = etree.SubElement(root, "SuspicionDetails")
        if narrative:
            self._add_text_child(susp_el, "Narrative", narrative)
        elif susp and susp.grounds:
            self._add_text_child(susp_el, "Narrative", "; ".join(susp.grounds))
        if susp and susp.grounds:
            grounds_el = etree.SubElement(susp_el, "Grounds")
            for ground in susp.grounds:
                self._add_text_child(grounds_el, "Ground", ground)

        self._build_transactions(root)
        self._build_source_hash(root)
        self._build_created_at(root)

        return etree.tostring(
            root,
            pretty_print=True,
            xml_declaration=True,
            encoding="UTF-8",
        ).decode("utf-8")
