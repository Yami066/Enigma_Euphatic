"""Compatibility redirect for afterloss -> euphatics."""
import sys
import euphatics

# Re-export all euphatics symbols
for k, v in list(euphatics.__dict__.items()):
    globals()[k] = v

# Ensure submodule lookups resolve to euphatics
import euphatics.app
import euphatics.aws
import euphatics.brand
import euphatics.discovery
import euphatics.forms
import euphatics.privacy
import euphatics.rules

sys.modules["afterloss"] = euphatics
sys.modules["afterloss.app"] = euphatics.app
sys.modules["afterloss.aws"] = euphatics.aws
sys.modules["afterloss.brand"] = euphatics.brand
sys.modules["afterloss.discovery"] = euphatics.discovery
sys.modules["afterloss.forms"] = euphatics.forms
sys.modules["afterloss.privacy"] = euphatics.privacy
sys.modules["afterloss.rules"] = euphatics.rules
