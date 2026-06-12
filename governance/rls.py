from __future__ import annotations


class RoleContext:
    """Represents a user's role context for RLS enforcement."""

    def __init__(self, role: str, user_id: str = "") -> None:
        self.role = role
        self.user_id = user_id

    def set_session_sql(self) -> str:
        return f"SET LOCAL app.current_user_role = '{self.role}';"


def build_rls_policy_sql(table: str, role: str) -> str:
    """Return a RLS policy SQL snippet for a given role on a table.

    For the compliance_officer role on the alerts table: all rows visible.
    For client_staff: rows where smr_status IS NULL (tipping-off prevention).
    For board_member: read-only access to risk metrics (view, not DML).
    """
    if role == "compliance_officer":
        return f"CREATE POLICY {role}_{table}_all ON {table} FOR ALL TO {role} USING (true);"
    if role == "client_staff":
        return (
            f"CREATE POLICY {role}_{table}_limited ON {table} "
            f"FOR SELECT TO {role} USING (smr_status IS NULL);"
        )
    if role == "board_member":
        return f"CREATE POLICY {role}_{table}_readonly ON {table} FOR SELECT TO {role} USING (true);"
    return f"CREATE POLICY {role}_{table}_default ON {table} FOR SELECT TO {role} USING (false);"
