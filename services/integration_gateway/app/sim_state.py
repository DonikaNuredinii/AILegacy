from dataclasses import dataclass

@dataclass
class SimState:
    ai_fail: bool = False
    legacy_delay_ms: int = 0

STATE = SimState()