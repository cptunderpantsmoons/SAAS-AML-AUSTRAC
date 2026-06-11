from __future__ import annotations

from typing import Any

from transaction_monitoring.models import Rule, RuleCondition, Transaction


def _evaluate_condition(condition: RuleCondition, transaction: Transaction) -> bool:
    """Evaluate a single condition against a transaction."""
    field_value: Any = getattr(transaction, condition.field, None)
    if field_value is None and condition.field in transaction.metadata:
        field_value = transaction.metadata[condition.field]

    op = condition.operator
    value = condition.value

    if op == "==":
        return bool(field_value == value)
    if op == "!=":
        return bool(field_value != value)
    if op == "<":
        return bool(field_value is not None and field_value < value)
    if op == ">":
        return bool(field_value is not None and field_value > value)
    if op == "<=":
        return bool(field_value is not None and field_value <= value)
    if op == ">=":
        return bool(field_value is not None and field_value >= value)
    if op == "in":
        return bool(field_value in value if isinstance(value, (list, tuple, set)) else False)
    if op == "not_in":
        return bool(field_value not in value if isinstance(value, (list, tuple, set)) else True)
    if op == "contains":
        return bool(str(field_value).find(str(value)) != -1)

    return False


def evaluate_rule(rule: Rule, transaction: Transaction) -> bool:
    """Evaluate all conditions in a rule against a transaction.

    All conditions must match (AND logic).
    """
    if not rule.enabled:
        return False
    return all(_evaluate_condition(cond, transaction) for cond in rule.conditions)


def evaluate_rules(rules: list[Rule], transaction: Transaction) -> list[Rule]:
    """Evaluate multiple rules; return those that match."""
    return [rule for rule in rules if evaluate_rule(rule, transaction)]
