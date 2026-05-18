import logging
import json
from dataclasses import dataclass, asdict
from typing import List, Dict, Any, Optional

@dataclass
class ExecutionTrace:
    task_id: str
    assigned_level: int
    actual_level: int
    cycles_used: int
    agents_invoked: List[str]
    rework_triggered: bool
    final_verdict: str
    duration_ms: float

class OrchestrationLogger:
    def __init__(self):
        self.logger = logging.getLogger("OrchestrationLogger")
        logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')

    def _json_log(self, event_type: str, data: Dict[str, Any]):
        log_obj = {"event": event_type, "data": data}
        self.logger.info(json.dumps(log_obj))

    def log_task_start(self, task_id: str, prompt: str):
        self._json_log("task_start", {"task_id": task_id, "prompt": prompt})

    def log_escalation_level(self, task_id: str, level: int, metrics: Dict[str, Any]):
        self._json_log("escalation_evaluation", {"task_id": task_id, "assigned_level": level, "metrics": metrics})

    def log_reclassification_check(self, task_id: str, reason: str):
        self._json_log("reclassification_forced", {"task_id": task_id, "reason": reason})

    def log_agent_cycle(self, task_id: str, cycle_num: int, agent_name: str):
        self._json_log("agent_cycle", {"task_id": task_id, "cycle": cycle_num, "agent": agent_name})

    def log_rework_trigger(self, task_id: str, issues: List[str]):
        self._json_log("rework_triggered", {"task_id": task_id, "issues": issues})

    def log_de_escalation(self, task_id: str, assigned_level: int, actual_level: int):
        self._json_log("de_escalation", {"task_id": task_id, "assigned_level": assigned_level, "actual_level": actual_level})

    def log_hard_stop(self, task_id: str, reason: str):
        self._json_log("hard_stop", {"task_id": task_id, "reason": reason})

    def log_task_complete(self, trace: ExecutionTrace):
        self._json_log("task_complete", asdict(trace))
