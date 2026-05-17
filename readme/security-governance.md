# Security & Governance

Enterprise environments cannot deploy autonomous agents without hard stops.

## Features
- **Policy Enforcement:** Strict limits on file system access, specific endpoints, and total LLM budget tokens allowed per workflow execution. 
- **Role-Based Access:** Worker agents inherently inherit sandboxed privileges compared to elevated `ManagerAgent` instances.
- **Circuit Breakers:** Built-in safeguards stop and freeze workflows immediately if execution loops occur.
