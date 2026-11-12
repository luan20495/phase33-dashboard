#!/bin/bash
# XWeb build/test lane: slot + admission guard + job record for a SECONDARY machine (16 GB class, possibly shared with other work).
# Generalised v1.1 of the script that ran on the first lane machine (logic unchanged; only machine-specific names removed from comments).
# Source of truth: docs/lane/gradle-slot-lane.sh in the dashboard repo. Install to $LANE/tools/gradle-slot-lane.sh (chmod 0755).
# What it does, all on purpose:
#   - ONE heavy slot (Gradle, Docker/Testcontainers, browser/Playwright, tsc of the whole repo, test:unit, mutation runs) and ONE light slot.
#   - Admission guard BEFORE a heavy job starts: 1-min load average, available RAM, free disk, STOP file. If the guard fails the job does NOT
#     start (rc 75) and nothing waits in a loop: the caller queues.
#   - Host-friendly priority: nice -n 15 and, when available, taskpolicy -b (background QoS). It never touches a process it did not start.
#   - Hard timeout per job (default 1500 s; JOB_TIMEOUT=seconds); kills the whole process group (macOS has no `timeout` binary).
#   - Every job gets a record directory $LANE/results/<UTC>-<label>-<sha12>/ with job.log + meta.txt + SHA256SUMS. Results are never deleted here.
#   - NEVER started by launchd/cron/login items/hooks: a human or the machine's own agent starts it, per task card.
# Env knobs (defaults are ESTIMATES, recalibrate after measuring on your machine): LANE_BASE (default $HOME/xweb-lane), LANE_MAX_LOAD (4.0),
#   LANE_MIN_FREE_RAM_MB (5000), LANE_MIN_FREE_DISK_GB (20), JOB_TIMEOUT (1500).
# Exit codes: 0 ok | 1 or 2 usage error (missing label / missing command / bad label) | 75 refused by guard or slot busy (retry later) | 124 timeout | other = the job's own rc.
# usage: gradle-slot-lane.sh <label> <command> [args...]      (run from the repo/worktree you want measured: the SHA is read from the current directory)
set -u
LANE="${LANE_BASE:-$HOME/xweb-lane}"; LABEL="${1:?label}"; shift
[ $# -gt 0 ] || { echo "usage: gradle-slot-lane.sh <label> <command...>"; exit 2; }
case "$LABEL" in *[!A-Za-z0-9._-]*) echo "[slot] label may only contain A-Za-z0-9._-"; exit 2;; esac
MAX_LOAD="${LANE_MAX_LOAD:-4.0}"        # 1-min load average above which a heavy job is refused (ESTIMATE: idle load of the first lane machine was about 1.7; tune after measuring)
MIN_FREE_RAM_MB="${LANE_MIN_FREE_RAM_MB:-5000}"   # free+inactive+speculative pages; ESTIMATE
MIN_FREE_DISK_GB="${LANE_MIN_FREE_DISK_GB:-20}"   # Owner floor: 20 GiB
mkdir -p "$LANE/locks" "$LANE/results" || exit 2
text="$*"; for a in "$@"; do [ -f "$a" ] && text="$text $(head -c 20000 "$a" 2>/dev/null)"; done
if echo "$text" | grep -qiE 'gradle|testcontainers|docker|colima|bootRun|playwright|chrome|harness-server|gate:frontend|gate-frontend|tsc|mutant|test:unit|browser'; then KIND=heavy; SLOT="$LANE/locks/heavy.lock"; else KIND=light; SLOT="$LANE/locks/light.lock"; fi

guard() {   # prints the reason and returns 1 when a job must not start
  [ -e "$LANE/STOP" ] && { echo "STOP file present ($LANE/STOP): lane is paused by the Owner or the machine operator"; return 1; }
  [ "$KIND" = light ] && return 0
  local load pg free_pages free_mb disk_gb
  load=$(sysctl -n vm.loadavg 2>/dev/null | awk '{print $2}')
  [ -n "$load" ] && awk -v l="$load" -v m="$MAX_LOAD" 'BEGIN{exit !(l>m)}' && { echo "load1=$load > $MAX_LOAD"; return 1; }
  pg=$(vm_stat 2>/dev/null | awk '/page size of/{gsub(/[^0-9]/,"",$8);print $8}'); pg=${pg:-16384}
  free_pages=$(vm_stat 2>/dev/null | awk '/Pages free|Pages inactive|Pages speculative/{gsub(/\./,"",$NF);s+=$NF} END{print s+0}')
  free_mb=$(( free_pages * pg / 1048576 ))
  [ "$free_mb" -lt "$MIN_FREE_RAM_MB" ] && { echo "available RAM ${free_mb} MB < $MIN_FREE_RAM_MB MB"; return 1; }
  disk_gb=$(df -g "$HOME" | awk 'NR==2{print $4}')
  [ "${disk_gb:-0}" -lt "$MIN_FREE_DISK_GB" ] && { echo "free disk ${disk_gb} GiB < $MIN_FREE_DISK_GB GiB"; return 1; }
  echo "guard ok: load1=${load:-?} availRAM=${free_mb}MB freeDisk=${disk_gb}GiB"; return 0
}
g=$(guard) || { echo "[slot] $LABEL ($KIND) REFUSED: $g (rc 75, nothing started)"; exit 75; }

if mkdir "$SLOT" 2>/dev/null; then :; else
  holder=$(cat "$SLOT/pid" 2>/dev/null || echo 0)
  if [ "$holder" != 0 ] && ! kill -0 "$holder" 2>/dev/null; then echo "[slot] removing stale lock of dead pid $holder"; rm -rf "$SLOT"; mkdir "$SLOT" 2>/dev/null || { echo "[slot] lost the race for $KIND slot"; exit 75; }
  else echo "[slot] $KIND slot busy: $(cat "$SLOT/label" 2>/dev/null) (pid $holder). Not waiting: heavy jobs are run one at a time and queued by the caller (rc 75)."; exit 75; fi
fi
echo $$ > "$SLOT/pid"; echo "$LABEL" > "$SLOT/label"
SHA=$(git rev-parse --short=12 HEAD 2>/dev/null || echo nogit)
JOB="$(date -u +%Y%m%dT%H%M%SZ)-$LABEL-$SHA"; OUT="$LANE/results/$JOB"; mkdir -p "$OUT"
trap 'rm -rf "$SLOT"' EXIT INT TERM
{ echo "job=$JOB"; echo "label=$LABEL"; echo "kind=$KIND"; echo "sha=$SHA"; echo "cwd=$(pwd)"; echo "start_utc=$(date -u +%FT%TZ)"; echo "start_ict=$(TZ=Asia/Ho_Chi_Minh date +%FT%T%z)"; echo "timeout_s=${JOB_TIMEOUT:-1500}"; echo "guard=$g"; echo "cmd=$*"; } > "$OUT/meta.txt"
echo "[slot] $LABEL ($KIND) runs, job $JOB, timeout ${JOB_TIMEOUT:-1500}s, $g"
PRI=(nice -n 15); command -v taskpolicy >/dev/null 2>&1 && PRI=(nice -n 15 taskpolicy -b)
# run in its own process group; on timeout kill the whole group (TERM, 20 s, KILL)
perl -e 'my $t=shift; my $pid=fork(); if(!$pid){ setpgrp(0,0); exec @ARGV or exit 127 } $SIG{ALRM}=sub{ kill "TERM",-$pid; sleep 20; kill "KILL",-$pid; exit 124 }; alarm $t; waitpid($pid,0); my $s=$?&127; exit($s ? 128+$s : $?>>8)' "${JOB_TIMEOUT:-1500}" "${PRI[@]}" "$@" 2>&1 | tee "$OUT/job.log"
rc=${PIPESTATUS[0]}
[ $rc = 124 ] && echo "[slot] $LABEL TIMED OUT after ${JOB_TIMEOUT:-1500}s (process group killed to free the slot)" | tee -a "$OUT/job.log"
{ echo "end_utc=$(date -u +%FT%TZ)"; echo "rc=$rc"; } >> "$OUT/meta.txt"
( cd "$OUT" && shasum -a 256 job.log meta.txt > SHA256SUMS )
echo "[slot] $LABEL done rc=$rc; results: $OUT ; sha256(SHA256SUMS)=$(shasum -a 256 "$OUT/SHA256SUMS" | cut -c1-64)"
exit $rc
