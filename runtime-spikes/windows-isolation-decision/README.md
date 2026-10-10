# Phase 0B-2A disposable decision spike

**NO SAFE LOCAL READ ARCHITECTURE DEMONSTRATED.**

Read DECISION.md before running. The native build succeeded, but Windows Application
Control blocked the final executable. Its full test matrix is unvalidated.
Do not bypass that policy or treat compilation as security acceptance.

The parent creates dummy fixtures only and starts its own fixed child executable
over inherited pipes. It does not expose a server, application route, arbitrary
command tool, or production Runtime API. AppContainer profiles, if a later approved
run can create them, are uniquely named and removed by their own lifecycle API.

fixture-support.hpp copies disposable fixture support from the original spike.
The original confinement.cpp/.hpp are compiled without modification. Their
experimental reader is used only to test the failed hypothesis under different
identities; the normal fail-closed entry point is not changed or enabled.

From the repository root:

~~~powershell
& '.\runtime-spikes\windows-isolation-decision\build.ps1'
& '.\runtime-spikes\windows-isolation-decision\run.ps1'
~~~

The host must independently permit execution. No allowlisting or policy-change
instructions are provided. Evidence includes the incomplete development run and a
separate host-block record; neither represents a passing architecture gate.
