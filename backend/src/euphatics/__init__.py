"""Euphatics core package: rules, discovery, forms, privacy and AWS adapters.

Everything under euphatics.rules, euphatics.discovery, euphatics.forms and
euphatics.privacy is plain Python with no AWS calls, so it runs in unit tests
and in the local (Build It) mode. AWS access lives in euphatics.aws.
"""

__version__ = "0.1.0"
