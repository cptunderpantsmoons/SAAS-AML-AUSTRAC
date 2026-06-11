"""Monitoring & alerting infrastructure for the orchestration layer.

Provides CloudWatch Logs and Splunk HEC log handlers, plus an alert
dispatcher that fires when error-rate or latency thresholds are breached.
"""
