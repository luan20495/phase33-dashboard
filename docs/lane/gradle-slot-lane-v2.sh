#!/bin/bash
# Build/test lane slot v2.0.0 (hardened, generic: install to $LANE/tools/gradle-slot-lane-v2.sh, chmod 0755). Replaces v1 of the lane slot script (gradle-slot-lane.sh). Portable to macOS bash 3.2 + system perl (no flock(1) needed).
# Same CLI and exit codes as v1:  gradle-slot-lane-v2.sh <label> <command> [args...]
#   rc 0..n = the job's own rc | 2 usage/config error | 75 refused (guard or slot busy, nothing started) | 124 timeout | 128+N killed by signal N
# What is new (each item answers one finding of review R6 / the reproduction in IMPL-P38-SLOT-V2.md):
#   - Lock = kernel flock(2) held by a small perl supervisor for the WHOLE life of the job (no pid file is trusted): atomic, no stale lock after kill -9, no pid-reuse hole,
#     two acquirers can never both hold it. The human-readable lock dir <locks>/<kind>.lock/{pid,label,token,lstart,...} is published atomically (tmp dir + rename) and
#     is only informational + used by --abort (pid AND process start time AND token must match). The supervisor removes it only if the token is its own.
#   - The job runs in its own process group. The supervisor kills the whole group on timeout, on TERM/INT/HUP sent to the slot script or to the supervisor, and when the slot script dies
#     (parent-death polling every 0.1 s). A separate reaper process (own session) does the same if the supervisor itself is SIGKILLed. Limits: see README (SIGKILL of BOTH supervisor
#     and reaper, and children that call setsid(), can still escape; a kernel panic/power loss drops everything).
#   - The job log is written by redirection to job.log (no tee/pipe), the supervisor follows the file for live output; a daemonised grandchild can no longer hang the slot.
#   - Classification: LANE_KIND=heavy|light explicit; unknown => heavy (guard applies). LANE_KIND=light with an obviously heavy command is upgraded to heavy (LANE_KIND_FORCE=1 to insist).
#   - JOB_TIMEOUT default 1500 s, must be an integer 1..86400 (0 / non-numeric => rc 2; LANE_ALLOW_NO_TIMEOUT=1 permits 0). JOB_TERM_GRACE (default 20 s) = TERM -> KILL delay.
#   - Heavy gradle commands get GRADLE_OPTS+=-Dorg.gradle.daemon=false (LANE_NO_DAEMON=0 to disable; BEST EFFORT, not verified against a real Gradle here). LANE_SWEEP (default 1 for heavy, 0 for light)
#     terminates processes left in the job's own group after the job leader exited.
#   - Guard (heavy only; STOP file applies to both): load1, available RAM, free disk of $LANE; fails CLOSED when a metric cannot be read (LANE_GUARD_FAILOPEN=1 restores v1).
#   - Extra modes: --version | --selftest | --abort <heavy|light> [--token T] [--reason R] | --help
# Never start this from launchd/cron/login items. Results are never deleted (only the empty results dir of a REFUSED start is removed).
# Env: LANE_BASE (default $HOME/xweb-lane) LANE_MAX_LOAD (4.0) LANE_MIN_FREE_RAM_MB (5000) LANE_MIN_FREE_DISK_GB (20) JOB_TIMEOUT JOB_TERM_GRACE LANE_KIND LANE_KIND_FORCE LANE_SWEEP
#      LANE_NO_DAEMON LANE_ALLOW_NO_TIMEOUT LANE_GUARD_FAILOPEN LANE_LOCAL_TZ (for the start_local meta line)
SLOT_VERSION="2.0.0"
SELF="$0"
set -u

usage() { echo "usage: gradle-slot-lane-v2.sh <label> <command...>   |   --version | --selftest | --abort <heavy|light> [--token T] [--reason R]"; }

# ---------------------------------------------------------------- modes
lstart_of() { ps -o lstart= -p "$1" 2>/dev/null | sed -e 's/^ *//' -e 's/ *$//'; }

do_abort() {   # safe replacement for "kill $(cat heavy.lock/pid)": verifies pid + process start time + token before signalling the SLOT SCRIPT (never a group)
  local kind="${1:-}"; shift; local want_tok="" reason="ABORTED"
  while [ $# -gt 0 ]; do case "$1" in --token) want_tok="${2:-}"; shift 2;; --reason) reason="${2:-ABORTED}"; shift 2;; *) usage; return 2;; esac; done
  case "$kind" in heavy|light) ;; *) usage; return 2;; esac
  local LANE="${LANE_BASE:-$HOME/xweb-lane}" d pid ls tok now_ls
  d="$LANE/locks/$kind.lock"
  [ -d "$d" ] || { echo "[slot] abort: no $kind lock present, nothing signalled"; return 3; }
  pid=$(cat "$d/pid" 2>/dev/null); ls=$(cat "$d/lstart" 2>/dev/null); tok=$(cat "$d/token" 2>/dev/null)
  case "$pid" in ''|*[!0-9]*) echo "[slot] abort: lock has no valid pid, nothing signalled"; return 3;; esac
  [ -n "$tok" ] || { echo "[slot] abort: lock is not a v2 lock (no token), nothing signalled"; return 3; }
  [ -z "$want_tok" ] || [ "$want_tok" = "$tok" ] || { echo "[slot] abort: token mismatch (lock now belongs to another job), nothing signalled"; return 3; }
  kill -0 "$pid" 2>/dev/null || { echo "[slot] abort: pid $pid not alive, nothing signalled"; return 3; }
  now_ls=$(lstart_of "$pid")
  [ -n "$ls" ] && [ "$ls" = "$now_ls" ] || { echo "[slot] abort: pid $pid start time differs from the lock (pid reused?), nothing signalled"; return 3; }
  echo "$reason" > "$d/abort_reason" 2>/dev/null
  kill -TERM "$pid" 2>/dev/null && { echo "[slot] abort: TERM sent to slot pid $pid (token $tok, reason $reason); it terminates the job's process group"; return 0; }
  echo "[slot] abort: kill failed"; return 3
}

selftest() {
  local T fails=0 rc t0 el mark="slotselftest$$"
  T=$(mktemp -d "${TMPDIR:-/tmp}/slotst.XXXXXX") || return 1
  export LANE_BASE="$T/lane" LANE_MAX_LOAD=100000 LANE_MIN_FREE_RAM_MB=0 LANE_MIN_FREE_DISK_GB=0 JOB_TERM_GRACE=2 LANE_KIND=light LANE_SELFTEST=1
  chk() { if [ "$2" = "$3" ]; then echo "  PASS $1"; else echo "  FAIL $1 (got '$2' want '$3')"; fails=$((fails+1)); fi; }
  echo "[selftest] v$SLOT_VERSION in $T"
  "$SELF" st-ok true >/dev/null 2>&1; rc=$?; chk "rc 0 propagates" "$rc" 0
  chk "SHA256SUMS written" "$(ls "$LANE_BASE"/results/*st-ok*/SHA256SUMS 2>/dev/null | wc -l | tr -d ' ')" 1
  "$SELF" st-rc sh -c 'exit 7' >/dev/null 2>&1; rc=$?; chk "rc 7 propagates" "$rc" 7
  ( "$SELF" st-hold sleep 4 >/dev/null 2>&1 ) & local h=$!; sleep 1
  "$SELF" st-busy true >/dev/null 2>&1; rc=$?; chk "second acquirer refused with 75" "$rc" 75
  wait $h
  JOB_TIMEOUT=2 "$SELF" st-to sh -c "sleep 4247 & sleep 4247; : $mark" >/dev/null 2>&1; rc=$?; chk "timeout rc 124" "$rc" 124
  chk "timeout killed the group (no sleep 4247 left)" "$(ps -axo command= | grep '[s]leep 4247' | grep -vc 'perl -e')" 0
  ( "$SELF" st-k9 sh -c 'sleep 4248 & sleep 4248' >/dev/null 2>&1 ) & h=$!; disown $h 2>/dev/null
  local i=0 slot; while [ $i -lt 100 ] && ! { [ -s "$LANE_BASE/locks/light.lock/job_pgid" ] && ps -axo command= | grep -q '[s]leep 4248'; }; do sleep 0.1; i=$((i+1)); done
  slot=$(cat "$LANE_BASE/locks/light.lock/pid" 2>/dev/null)
  case "$slot" in ''|*[!0-9]*|0|1) echo "  FAIL could not find the holder pid"; fails=$((fails+1));; *) kill -9 "$slot" 2>/dev/null; i=0; while [ $i -lt 80 ] && ps -axo command= | grep '[s]leep 4248' | grep -vq 'perl -e'; do sleep 0.1; i=$((i+1)); done;; esac
  chk "kill -9 of slot script: job group terminated" "$(ps -axo command= | grep '[s]leep 4248' | grep -vc 'perl -e')" 0
  # the lock is released by the kernel when the supervisor dies, but the reaper may still be finishing: allow up to ~10 s of rc 75 before calling it stuck
  local tries=0; rc=75; while [ "$rc" -eq 75 ] && [ $tries -lt 20 ]; do "$SELF" st-after true >/dev/null 2>&1; rc=$?; [ "$rc" -eq 75 ] && sleep 0.5; tries=$((tries+1)); done; chk "no stuck lock after kill -9" "$rc" 0
  rm -rf "$T"
  if [ $fails -eq 0 ]; then echo "[selftest] ALL PASS"; return 0; else echo "[selftest] $fails FAILED"; return 1; fi
}

case "${1:-}" in
  --version|-V) echo "gradle-slot-lane-v2 $SLOT_VERSION"; exit 0;;
  --help|-h) usage; exit 0;;
  --selftest) command -v perl >/dev/null 2>&1 || { echo "perl missing"; exit 2; }; selftest; exit $?;;
  --abort) shift; do_abort "$@"; exit $?;;
esac

# ---------------------------------------------------------------- arguments, config
LABEL="${1:?label}"; shift
[ $# -gt 0 ] || { usage; exit 2; }
case "$LABEL" in *[!A-Za-z0-9._-]*) echo "[slot] label may only contain A-Za-z0-9._-"; exit 2;; esac
command -v perl >/dev/null 2>&1 || { echo "[slot] perl is required (supervisor)"; exit 2; }
LANE="${LANE_BASE:-$HOME/xweb-lane}"
MAX_LOAD="${LANE_MAX_LOAD:-4.0}"; MIN_FREE_RAM_MB="${LANE_MIN_FREE_RAM_MB:-5000}"; MIN_FREE_DISK_GB="${LANE_MIN_FREE_DISK_GB:-20}"
LOCAL_TZ="${LANE_LOCAL_TZ:-UTC}"
TMO="${JOB_TIMEOUT:-1500}"; GRACE="${JOB_TERM_GRACE:-20}"
case "$TMO" in ''|*[!0-9]*) echo "[slot] invalid JOB_TIMEOUT '$TMO' (integer seconds 1..86400 required) rc 2"; exit 2;; esac
case "$GRACE" in ''|*[!0-9]*) echo "[slot] invalid JOB_TERM_GRACE '$GRACE' (integer seconds)"; exit 2;; esac
TMO=$((10#$TMO)); GRACE=$((10#$GRACE))
if [ "$TMO" -eq 0 ]; then [ "${LANE_ALLOW_NO_TIMEOUT:-0}" = 1 ] || { echo "[slot] JOB_TIMEOUT=0 (no timeout) refused; set LANE_ALLOW_NO_TIMEOUT=1 to allow"; exit 2; }
elif [ "$TMO" -gt 86400 ]; then echo "[slot] JOB_TIMEOUT above 86400 s refused"; exit 2; fi
mkdir -p "$LANE/locks" "$LANE/results" || exit 2

# ---------------------------------------------------------------- classification: unknown => heavy
case "${LANE_KIND:-}" in ''|heavy|light) ;; *) echo "[slot] LANE_KIND must be heavy or light (got '${LANE_KIND}')"; exit 2;; esac
KIND=heavy
if [ "${LANE_KIND:-}" = light ]; then
  KIND=light
  text="$*"; for a in "$@"; do [ -f "$a" ] && text="$text $(head -c 20000 "$a" 2>/dev/null)"; done
  if [ "${LANE_KIND_FORCE:-0}" != 1 ] && echo "$text" | grep -qiE 'gradle|testcontainers|docker|colima|bootrun|playwright|chrome|harness-server|gate:frontend|gate-frontend|mutant|browser'; then
    echo "[slot] LANE_KIND=light contradicts a heavy-looking command: running as HEAVY (LANE_KIND_FORCE=1 to insist)"; KIND=heavy
  fi
fi
SWEEP="${LANE_SWEEP:-}"; [ -n "$SWEEP" ] || { [ "$KIND" = heavy ] && SWEEP=1 || SWEEP=0; }

# ---------------------------------------------------------------- guard (heavy only; STOP applies to both). Fails closed when a metric is unreadable.
metric_load() {
  local l; l=$(sysctl -n vm.loadavg 2>/dev/null | awk '{print $2}')
  [ -n "$l" ] || l=$(awk '{print $1}' /proc/loadavg 2>/dev/null)
  [ -n "$l" ] || l=$(uptime 2>/dev/null | sed -e 's/.*load averages*: *//' -e 's/[, ].*//' | tr ',' '.')
  echo "$l"
}
metric_ram_mb() {
  if command -v vm_stat >/dev/null 2>&1; then
    local pg fp; pg=$(vm_stat 2>/dev/null | awk '/page size of/{gsub(/[^0-9]/,"",$8);print $8}'); pg=${pg:-16384}
    fp=$(vm_stat 2>/dev/null | awk '/Pages free|Pages inactive|Pages speculative/{gsub(/\./,"",$NF);s+=$NF} END{print s+0}')
    echo $(( fp * pg / 1048576 ))
  elif [ -r /proc/meminfo ]; then awk '/MemAvailable/{print int($2/1024)}' /proc/meminfo; fi
}
metric_disk_gb() { df -Pk "$LANE" 2>/dev/null | awk 'NR==2{print int($4/1048576)}'; }
guard() {   # prints the reason and returns 1 when a job must not start
  [ -e "$LANE/STOP" ] && { echo "STOP file present ($LANE/STOP): lane is paused by the machine operator"; return 1; }
  [ "$KIND" = light ] && return 0
  local load free_mb disk_gb failopen="${LANE_GUARD_FAILOPEN:-0}"
  load=$(metric_load)
  if [ -n "$load" ]; then awk -v l="$load" -v m="$MAX_LOAD" 'BEGIN{exit !(l>m)}' && { echo "load1=$load > $MAX_LOAD"; return 1; }
  elif [ "$failopen" != 1 ]; then echo "load average unreadable (guard fails closed)"; return 1; fi
  free_mb=$(metric_ram_mb)
  if [ -n "$free_mb" ]; then [ "$free_mb" -lt "$MIN_FREE_RAM_MB" ] && { echo "available RAM ${free_mb} MB < $MIN_FREE_RAM_MB MB"; return 1; }
  elif [ "$failopen" != 1 ]; then echo "available RAM unreadable (guard fails closed)"; return 1; fi
  disk_gb=$(metric_disk_gb)
  if [ -n "$disk_gb" ]; then [ "$disk_gb" -lt "$MIN_FREE_DISK_GB" ] && { echo "free disk ${disk_gb} GiB < $MIN_FREE_DISK_GB GiB"; return 1; }
  elif [ "$failopen" != 1 ]; then echo "free disk unreadable (guard fails closed)"; return 1; fi
  echo "guard ok: load1=${load:-?} availRAM=${free_mb:-?}MB freeDisk=${disk_gb:-?}GiB"; return 0
}
g=$(guard) || { echo "[slot] $LABEL ($KIND) REFUSED: $g (rc 75, nothing started)"; exit 75; }

# ---------------------------------------------------------------- job record dir (unique; removed again only if the start is refused)
SHA=$(git rev-parse --short=12 HEAD 2>/dev/null || echo nogit)
JOB="$(date -u +%Y%m%dT%H%M%SZ)-$LABEL-$SHA"; OUT="$LANE/results/$JOB"; n=1
until mkdir "$OUT" 2>/dev/null; do n=$((n+1)); [ $n -gt 99 ] && { echo "[slot] cannot create a unique results dir"; exit 2; }; OUT="$LANE/results/$JOB.$n"; done
PRI=(nice -n 15); command -v taskpolicy >/dev/null 2>&1 && PRI=(nice -n 15 taskpolicy -b)
CMDQ=""; for a in "$@"; do CMDQ="$CMDQ$(printf '%q' "$a") "; done; CMDQ=$(printf '%s' "$CMDQ" | tr '\n\r' '  ')
SLOT_LSTART=$(lstart_of $$)
{ echo "job=$(basename "$OUT")"; echo "label=$LABEL"; echo "kind=$KIND"; echo "sha=$SHA"; echo "cwd=$(pwd | tr '\n\r' '  ')"; echo "start_utc=$(date -u +%FT%TZ)"; echo "start_local=$(TZ=$LOCAL_TZ date +%FT%T%z) ($LOCAL_TZ)"
  echo "timeout_s=$TMO"; echo "term_grace_s=$GRACE"; echo "sweep=$SWEEP"; echo "slot_version=$SLOT_VERSION"; echo "guard=$(printf '%s' "$g" | tr '\n\r' '  ')"; echo "cmd=${CMDQ% }"; } > "$OUT/meta.txt"

if [ "$KIND" = heavy ] && [ "${LANE_NO_DAEMON:-1}" = 1 ] && printf '%s' "$*" | grep -qi gradle; then
  export GRADLE_OPTS="${GRADLE_OPTS:-} -Dorg.gradle.daemon=false"   # best effort; --no-daemon on the command line is still the reliable way
fi
export LANE_JOB_OUT="$OUT"

# ---------------------------------------------------------------- supervisor (perl): flock + own process group + group kill + reaper + live log follow
IFS= read -r -d '' SUP_PL <<'PERLEOF'
use strict; use warnings;
use POSIX qw(:sys_wait_h);
use Fcntl qw(:flock);
use File::Path qw(remove_tree);
use Time::HiRes ();
my $MONO = eval { Time::HiRes::clock_gettime(Time::HiRes::CLOCK_MONOTONIC()); 1 };
sub now { $MONO ? Time::HiRes::clock_gettime(Time::HiRes::CLOCK_MONOTONIC()) : Time::HiRes::time() }
sub nap { Time::HiRes::sleep($_[0]) }
sub slurp { my $f = shift; open(my $h, '<', $f) or return undef; local $/; my $c = <$h>; close $h; $c =~ s/\s+\z// if defined $c; return $c }
sub spew { my ($f, $c) = @_; open(my $h, '>', $f) or return 0; print $h $c, "\n"; close $h; return 1 }
sub spew_atomic { my ($f, $c) = @_; spew("$f.tmp$$", $c) and rename("$f.tmp$$", $f) }
sub psfield { my ($f, $p) = @_; my $o = `ps -o $f= -p $p 2>/dev/null`; $o = '' unless defined $o; $o =~ s/^\s+|\s+$//g; return $o }
sub lstart_epoch { my $s = shift; my %M = (Jan=>0,Feb=>1,Mar=>2,Apr=>3,May=>4,Jun=>5,Jul=>6,Aug=>7,Sep=>8,Oct=>9,Nov=>10,Dec=>11);
  $s =~ /^\w+\s+(\w+)\s+(\d+)\s+(\d+):(\d+):(\d+)\s+(\d+)$/ or return undef; return POSIX::mktime($5, $4, $3, $2, $M{$1}, $6 - 1900) }

my %E; for my $k (qw(LOCKS KIND SLOTPID LABEL OUT TIMEOUT GRACE SWEEP BANNER LSTART)) { $E{$k} = $ENV{"XS_$k"}; delete $ENV{"XS_$k"} }
my @cmd = @ARGV; $| = 1; $SIG{PIPE} = 'IGNORE';
my ($got_sig, $sigval) = ('', 0);
for my $s (qw(INT TERM HUP)) { $SIG{$s} = sub { $got_sig ||= $s } }

my $lockdir = "$E{LOCKS}/$E{KIND}.lock";
open(my $LF, '>>', "$E{LOCKS}/$E{KIND}.flock") or do { print "[slot] cannot open lock file: $!\n"; exit 2 };
sub busy { my $why = shift; my $l = slurp("$lockdir/label"); my $p = slurp("$lockdir/pid");
  print "[slot] $E{KIND} slot busy: ", (defined $l ? $l : '?'), " (pid ", (defined $p ? $p : '?'), ")$why. Not waiting: heavy jobs are run one at a time and queued by the caller (rc 75).\n"; exit 75 }
if (!flock($LF, LOCK_EX | LOCK_NB)) { busy('') }
# From here on we hold the kernel lock: any lock dir that still exists belongs to a dead holder, EXCEPT a live legacy (v1) slot script which does not use flock.
if (-d $lockdir) {
  my $tok = slurp("$lockdir/token");
  if (!defined $tok) {
    my $p = slurp("$lockdir/pid");
    if (defined $p && $p =~ /^\d+$/ && $p > 0 && kill(0, $p)) {
      my $cmdline = psfield('command', $p); my $le = lstart_epoch(psfield('lstart', $p)); my $mt = (stat($lockdir))[9];
      if ($cmdline =~ /gradle-slot/ && (!defined $le || $le <= $mt + 2)) { busy(' [legacy v1 holder]') }
      print "[slot] lock of pid $p is a reused pid (not a slot script / started after the lock): removing stale lock\n";
    } else { print "[slot] removing stale lock of dead pid ", (defined $p ? $p : 'none'), "\n" }
  } else { print "[slot] removing stale lock dir of dead holder (token $tok)\n" }
  remove_tree($lockdir);
}
my $token = join('-', $$, int(Time::HiRes::time() * 1000), int(rand(1e9)));
{ my $tmp = "$E{LOCKS}/.$E{KIND}.$$.tmp"; remove_tree($tmp) if -e $tmp; mkdir($tmp) or do { print "[slot] cannot create lock dir: $!\n"; exit 2 };
  spew("$tmp/pid", $E{SLOTPID}); spew("$tmp/label", $E{LABEL}); spew("$tmp/token", $token); spew("$tmp/lstart", $E{LSTART} // ''); spew("$tmp/supervisor_pid", $$); spew("$tmp/started_epoch", time());
  rename($tmp, $lockdir) or do { print "[slot] cannot publish lock dir: $!\n"; remove_tree($tmp); exit 2 } }
sub release_lock { my $t = slurp("$lockdir/token"); remove_tree($lockdir) if defined $t && $t eq $token }   # only a lock we own
spew("$E{OUT}/.started", $token);
print "$E{BANNER}\n";

my $log = "$E{OUT}/job.log";
open(my $LW, '>>', $log) or do { print "[slot] cannot open job.log: $!\n"; release_lock(); exit 2 };
open(my $LR, '<', $log) or do { release_lock(); exit 2 };
my $out_ok = 1;
sub pump { while (1) { my $n = sysread($LR, my $b, 65536); last unless $n; if ($out_ok) { print STDOUT $b or $out_ok = 0 } } }
sub logline { my $m = shift; syswrite($LW, "$m\n") }

pipe(my $GR, my $GW) or die; pipe(my $DR, my $DW) or die;
my $pid = fork(); die "fork: $!" unless defined $pid;
if ($pid == 0) {
  close($GW); close($DR); close($DW); close($LF); close($LR);
  setpgrp(0, 0);
  open(STDOUT, '>&', $LW) or POSIX::_exit(126); open(STDERR, '>&', $LW) or POSIX::_exit(126);
  $SIG{$_} = 'DEFAULT' for qw(INT TERM HUP QUIT PIPE);
  sysread($GR, my $go, 1) or POSIX::_exit(127);    # EOF = supervisor died before the handshake: do not run
  { exec { $cmd[0] } @cmd; }
  print STDERR "[slot] exec failed: $cmd[0]: $!\n"; POSIX::_exit(127);
}
setpgrp($pid, $pid);
my $rp = fork(); die "fork: $!" unless defined $rp;
if ($rp == 0) {   # reaper: survives SIGKILL of the supervisor, keeps the flock fd until the job group is gone
  close($GW); close($GR); close($DW); close($LR);
  POSIX::setsid(); $SIG{$_} = 'IGNORE' for qw(INT TERM HUP PIPE);
  open(STDIN, '<', '/dev/null'); open(STDOUT, '>', '/dev/null'); open(STDERR, '>', '/dev/null');
  my $buf = '';
  while (1) { my $n = sysread($DR, my $b, 64); if (!defined $n) { next if $!{EINTR}; last } last unless $n; $buf .= $b; last if $buf =~ /D/ }
  if ($buf !~ /D/ && kill(0, -$pid)) {
    syswrite($LW, "[slot] supervisor died unexpectedly: reaper terminates the job's process group\n");
    kill('TERM', -$pid); my $end = now() + $E{GRACE};
    while (now() < $end && kill(0, -$pid)) { nap(0.1) }
    if (kill(0, -$pid)) { kill('KILL', -$pid); my $e2 = now() + 5; while (now() < $e2 && kill(0, -$pid)) { nap(0.1) } }
    if (-d $lockdir) { my $t = slurp("$lockdir/token"); remove_tree($lockdir) if defined $t && $t eq $token }
  }
  POSIX::_exit(0);
}
close($GR); close($DR);
spew_atomic("$lockdir/job_pgid", $pid); spew_atomic("$lockdir/job_pid", $pid);
syswrite($GW, 'G'); close($GW);

my ($status, $reaped) = (0, 0);
sub reap_job { return if $reaped; my $r = waitpid($pid, WNOHANG); if ($r == $pid) { $status = $?; $reaped = 1 } }
sub group_alive { return kill(0, -$pid) }
sub term_group {
  reap_job(); return unless group_alive();
  kill('TERM', -$pid); my $end = now() + $E{GRACE};
  while (now() < $end) { reap_job(); last unless group_alive(); pump(); nap(0.1) }
  if (group_alive()) { kill('KILL', -$pid); my $e2 = now() + 5; while (now() < $e2) { reap_job(); last unless group_alive(); nap(0.1) } }
  reap_job();
}
my $deadline = $E{TIMEOUT} > 0 ? now() + $E{TIMEOUT} : undef;
my ($timed_out, $slot_died) = (0, 0);
while (1) {
  reap_job(); last if $reaped;
  if ($got_sig) { term_group(); last }
  if (defined $deadline && now() >= $deadline) { $timed_out = 1; term_group(); last }
  if (getppid() != $E{SLOTPID}) { $slot_died = 1; term_group(); last }
  pump(); nap(0.1);
}
# the leader is gone (or was killed); settle the rest of the group
my $extra = '';
if (!$reaped) { my $e = now() + 5; while (!$reaped && now() < $e) { reap_job(); nap(0.05) } }
if (!$timed_out && !$got_sig && !$slot_died && group_alive()) {
  my @left; for my $l (`ps -axo pid=,pgid= 2>/dev/null`) { my ($p, $g) = split ' ', $l; push @left, $p if defined $g && $g == $pid && $p != $$ }
  if ($E{SWEEP}) { kill('TERM', -$pid); my $e = now() + 3; while (now() < $e && group_alive()) { reap_job(); nap(0.1) } kill('KILL', -$pid) if group_alive();
    $extra .= "swept=" . scalar(@left) . " (processes left in the job's group after the job exited were terminated: @left)\n"; logline("[slot] swept " . scalar(@left) . " leftover process(es) of the job's group: @left") }
  else { $extra .= "leftover_in_group=" . scalar(@left) . " (@left)\n"; logline("[slot] WARNING: " . scalar(@left) . " process(es) of the job's group still alive after the job exited: @left") }
}
my $rc;
if ($timed_out) { $rc = 124; logline("[slot] $E{LABEL} TIMED OUT after $E{TIMEOUT}s (process group killed to free the slot)") }
elsif ($got_sig) { my %n = (INT => 2, TERM => 15, HUP => 1); $rc = 128 + $n{$got_sig}; logline("[slot] $E{LABEL} terminated by signal $got_sig (process group killed)"); $extra .= "terminated_by=$got_sig\n";
  my $r = slurp("$lockdir/abort_reason"); $extra .= "abort_reason=$r\n" if defined $r && length $r }
elsif ($slot_died) { $rc = 143; logline("[slot] $E{LABEL} slot script died: job process group killed"); $extra .= "slot_died=1\n" }
else { my $s = $status & 127; $rc = $s ? 128 + $s : ($status >> 8) }
pump();
if ($extra ne '') { if (open(my $X, '>>', "$E{OUT}/.extra")) { print $X $extra; close $X } }
if ($slot_died) {   # nobody else will finish the record
  if (open(my $M, '>>', "$E{OUT}/meta.txt")) { print $M "end_utc=" . `date -u +%FT%TZ`; print $M "rc=$rc\nnote=slot script died; supervisor finished the record\n"; print $M $extra; close $M }
  system("cd '$E{OUT}' && shasum -a 256 job.log meta.txt > SHA256SUMS 2>/dev/null");
}
release_lock();
syswrite($DW, "D\n"); close($DW); waitpid($rp, 0);
exit $rc;
PERLEOF

export XS_LOCKS="$LANE/locks" XS_KIND="$KIND" XS_SLOTPID="$$" XS_LABEL="$LABEL" XS_OUT="$OUT" XS_TIMEOUT="$TMO" XS_GRACE="$GRACE" XS_SWEEP="$SWEEP" XS_LSTART="$SLOT_LSTART"
export XS_BANNER="[slot] $LABEL ($KIND) runs, job $(basename "$OUT"), timeout ${TMO}s, $g"
{ exec 4<&0; } 2>/dev/null || exec 4</dev/null
perl -e "$SUP_PL" -- "${PRI[@]}" "$@" <&4 4<&- &
SUP=$!
fwd() { kill -"$1" "$SUP" 2>/dev/null; }
trap 'fwd INT' INT; trap 'fwd TERM' TERM; trap 'fwd HUP' HUP
rc=0
while :; do
  wait "$SUP"; rc=$?
  kill -0 "$SUP" 2>/dev/null || break      # interrupted by a trapped signal while the supervisor still runs: wait again
done
trap - INT TERM HUP; exec 4<&-

if [ "$rc" = 75 ] && [ ! -e "$OUT/.started" ]; then rm -f "$OUT/meta.txt"; rmdir "$OUT" 2>/dev/null; exit 75; fi   # refused: nothing started, no record kept
rm -f "$OUT/.started"
if [ -s "$OUT/.extra" ]; then cat "$OUT/.extra" >> "$OUT/meta.txt"; rm -f "$OUT/.extra"; fi
{ echo "end_utc=$(date -u +%FT%TZ)"; echo "rc=$rc"; } >> "$OUT/meta.txt"
( cd "$OUT" && shasum -a 256 job.log meta.txt > SHA256SUMS )
echo "[slot] $LABEL done rc=$rc; results: $OUT ; sha256(SHA256SUMS)=$(shasum -a 256 "$OUT/SHA256SUMS" | cut -c1-64)"
exit $rc
