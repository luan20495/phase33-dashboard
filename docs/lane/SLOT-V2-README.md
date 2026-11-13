# Lane slot v2 (gradle-slot-v2.sh)

Hardened replacement for `gradle-slot-oxy.sh` v1 (sha256 `d087269831aa...`). Same CLI, same exit codes, same record layout. Built after review R6; every
finding was first reproduced (see `~/xweb-handoff/agents/IMPL-P38-SLOT-V2.md`). The live main-Mac script `~/xweb-handoff/p32/gradle-slot.sh` was not touched and
nothing here is installed anywhere. Install = copy one file and `chmod 0755`, after the Owner/hub operator has read it.

## Usage (unchanged)

    gradle-slot-v2.sh <label> <command> [args...]       # run from the repo you want measured (sha12 is read from cwd)
    gradle-slot-v2.sh --version | --selftest | --help
    gradle-slot-v2.sh --abort <heavy|light> [--token T] [--reason R]     # NEW, safe stop (see below)

Exit codes: job rc | 2 usage/config | 75 refused (guard or busy; nothing started, no record kept) | 124 timeout | 128+N killed by signal N (143 TERM, 130 INT, 129 HUP).
Record: `$LANE/results/<UTC>-<label>-<sha12>/{job.log,meta.txt,SHA256SUMS}` (a suffix `.2`, `.3` is added if the same name already exists; results are never deleted).

## What changed and why

| Area | v1 | v2 |
|---|---|---|
| Lock | `mkdir` + pid file (not atomic, pid based) | kernel `flock(2)` on `locks/<kind>.flock`, taken and held by the perl supervisor for the whole job. No stale lock after `kill -9`, no pid-reuse hole, no two holders. The dir `locks/<kind>.lock/{pid,label,token,lstart,supervisor_pid,job_pgid,...}` is only information, published atomically (tmp dir + rename) and removed only by its owner (token check). |
| Legacy coexistence | - | a still-running v1 holder (dir without `token`, pid alive, command line contains `gradle-slot`, process start time not later than the lock dir) keeps the lane busy (rc 75). A dead or reused pid is treated as stale. |
| Kill paths | trap does `rm -rf` and does not exit; TERM to slot deferred until the job ends; SIGKILL of slot or TERM of perl leaves an orphan | job is a process-group leader. The supervisor kills the group (TERM, `JOB_TERM_GRACE` s, KILL) on timeout, on TERM/INT/HUP to the slot **or** to the supervisor, and within 0.1 s when the slot script dies. A separate reaper process (own session) does the same if the supervisor is SIGKILLed and keeps the flock until the group is gone. |
| Output | `perl ... \| tee` (a pipe-holding grandchild hangs the slot) | child writes straight to `job.log` (O_APPEND, stdout+stderr in order); the supervisor follows the file for live output. Slot returns when the job ends. |
| Classification | grep on the command text, miss => light | `LANE_KIND=heavy\|light` explicit; unknown => **heavy**. `LANE_KIND=light` + obviously heavy text (gradle, docker, playwright, chrome, ...) is upgraded to heavy unless `LANE_KIND_FORCE=1`. Legacy `LANE_HEAVY` is not needed any more. |
| Timeout | `JOB_TIMEOUT=0`/garbage => no timeout; always +20 s sleep after TERM | integer 1..86400 else rc 2 (`LANE_ALLOW_NO_TIMEOUT=1` allows 0); KILL escalation only if the group survives `JOB_TERM_GRACE` (default 20) |
| Guard | fails open if a metric is unreadable; disk measured on `$HOME` | fails closed (`LANE_GUARD_FAILOPEN=1` = v1); disk measured on `$LANE`; load/RAM/disk fall back to `/proc` and `uptime` on Linux |
| Leftovers | silent | after the job leader exits, processes still in the job's group are terminated (`LANE_SWEEP`, default 1 for heavy, 0 for light = WARNING + `leftover_in_group=` in meta) |
| Gradle daemon | not enforced | heavy commands mentioning gradle get `GRADLE_OPTS+=-Dorg.gradle.daemon=false` (`LANE_NO_DAEMON=0` disables). BEST EFFORT and NOT verified against a real Gradle here (no Gradle was run); keep `--no-daemon` on the command line. |
| meta.txt | `cmd=$*` (newline injection possible, quoting lost) | `cmd=` is shell-quoted (`printf %q`), single line; adds `term_grace_s`, `sweep`, `slot_version`, `swept=`/`leftover_in_group=`, `abort_reason=`, `terminated_by=`, `slot_died=1` when they apply |
| Stop from outside | `kill $(cat locks/heavy.lock/pid)` (does NOT stop the job in v1) / runner `abort_group` | `kill -TERM <slot pid>` now ends the job group and exits 143. Better: `--abort heavy --token <T> --reason ABORTED_LOAD`: verifies lock token **and** the slot's pid + process start time (`ps lstart`) before signalling; exit 3 and nothing signalled if the lock now belongs to someone else. Never signals a group directly. |

## Stop semantics (what each signal does)

| Sent to | Result |
|---|---|
| slot script, TERM / INT / HUP | forwarded to the supervisor; job group gets TERM, then KILL after the grace; rc 143 / 130 / 129; record completed |
| supervisor (perl child) TERM/INT/HUP | same as above |
| slot script SIGKILL | supervisor sees the parent vanish (poll 0.1 s), kills the group, finishes `meta.txt` and `SHA256SUMS` itself (`slot_died=1`, rc 143) |
| supervisor SIGKILL (slot alive or not) | reaper sees EOF on its pipe, kills the group (TERM, grace, KILL), removes the lock dir if it is still ours, then exits; lock freed |
| job ignores TERM | KILL after `JOB_TERM_GRACE` |
| timeout | as TERM path, rc 124, line `[slot] <label> TIMED OUT ...` appended to `job.log` |

Ctrl-C from a terminal works. Note: a background job of a NON-interactive shell starts with SIGINT ignored (POSIX); bash cannot trap an inherited ignore, so INT sent to such a slot is
ignored, exactly as in v1. TERM/HUP always work.

## Honest limits (documented, tested where possible)

1. **SIGKILL of slot + supervisor + reaper at the same moment** (for example a `kill -9` of a whole session, OOM killer, kernel panic, power loss) cannot be handled in user space. The job (own process group) survives; the flock is not inherited by the job on purpose, so the lane looks free. Test `V11` shows it. Mitigation: the caller (runner) should check `ps` for stray heavy processes after any hard kill of the session; macOS has no `PR_SET_PDEATHSIG`, so the only fully robust fix would be a launchd-managed supervisor, which the lane rules forbid.
2. **Children that call `setsid()`/change process group** (daemons, `docker`/Testcontainers containers, detached browsers, Gradle daemons started with their own session) are outside the job group and are not killed by the group kill. They no longer hang the slot (pipe-free logging) but they are not tracked. Keep `--no-daemon`, `--max-workers=1`, and clean containers in the task.
3. Process-group reuse: signals are only sent while `kill(-pgid, 0)` says the group still has members; a group that became empty and whose number was recycled in the same millisecond is theoretically signalable. Not observed.
4. The supervisor needs `perl` (system perl on macOS; also standard on Linux). `flock(2)` needs a local filesystem under `$LANE` (not NFS).
5. A job reading from a terminal stdin is in a different process group and may get SIGTTIN (same as v1). Piped or redirected stdin works (test `G9`).
6. The guard is still an admission check before the start (load/RAM/disk), not a monitor. Mid-job watchdog stays with the caller; use `--abort ... --reason ABORTED_LOAD`.
7. `ABORTED_LOAD` is the caller's rule (runner); the real `runner6.sh` was not available to me. v2 only provides the safe stop and records `abort_reason=` in `meta.txt`.
8. Bash 3.2 compatible (checked on macOS bash 3.2.57); shellcheck is not installed on this Mac, so only `bash -n` and the full test suite were run.

## Tests

    SLOT_SCRIPT=/path/to/script  bash tests/run-all.sh /path/to/script     # claims + generic + P0 model (+ v2only when the script is v2)
    SLOT_SCRIPT=... bash tests/claims.sh [C1a C2 ...]                       # review claims; PASS = defect absent, FAIL = defect reproduced
    SLOT_SCRIPT=... bash tests/generic.sh                                   # behaviours identical in v1/v2 incl. 10-way concurrency stress
    SLOT_SCRIPT=... bash tests/v2only.sh                                    # v2 kill paths, --abort, sweep, coexistence with a live v1 holder
    ./gradle-slot-v2.sh --selftest                                          # 9 quick built-in checks (about 12 s)

Every test uses a private temp dir (`LANE_BASE` override, guard thresholds neutralised, a `taskpolicy` shim so a loaded dev machine does not starve the fake jobs) and kills only
processes whose command line contains its own temp path. Nothing touches `~/xweb-lane` or live locks. The tests clean up on exit.

## Files

- `gradle-slot-v2.sh` - the script (private default time zone `Asia/Ho_Chi_Minh` for the extra `start_local` meta line).
- `gradle-slot-lane-v2.sh` - sanitised generic copy for the dashboard docs (`make-public.sh` generates it and fails if a private token remains). NOT pushed.
- `tests/` - harness and fake jobs; `tests/out/` - logs of the last full runs on v1, v2 and the public copy.

## Decisions for the Owner (none taken here)

1. Default `LANE_SWEEP=1` for heavy jobs kills leftovers in the job's own group at the end. v1 left them running. Say if some caller relies on that.
2. Callers that start small light jobs must now pass `LANE_KIND=light` (otherwise they are heavy and pass the guard; this is the conservative reading of the directive).
3. Replace v1 on the second machine only after QA of v2 there (needs `perl`, same as v1). A live v1 holder is respected by v2, so the swap can be done between jobs.
