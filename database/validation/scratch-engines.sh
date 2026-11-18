#!/usr/bin/env bash
# Starts/stops DISPOSABLE database servers for M2 schema validation. It never touches XAMPP's or MAMP's own data:
# each engine gets its own data directory under $AGRI_SCRATCH_DIR (default: $TMPDIR/agri-scratch-db), a loopback-only port and a short socket.
#
#   database/validation/scratch-engines.sh start|stop|status|reset
#
# Engines (override paths with env vars if installed elsewhere):
#   MySQL 8.0   : $MYSQL80_BASE (default /Applications/MAMP/Library/bin/mysql80)      -> 127.0.0.1:3307, root, no password
#   MariaDB 10.4: $MARIADB_BASE (default /Applications/XAMPP/xamppfiles)              -> 127.0.0.1:3308, root, no password
# The empty root password is acceptable ONLY because these servers listen on 127.0.0.1 and hold no real data. `reset` deletes the scratch data.
set -euo pipefail
SCRATCH="${AGRI_SCRATCH_DIR:-${TMPDIR:-/tmp}/agri-scratch-db}"; SCRATCH="${SCRATCH%/}"
MYSQL80_BASE="${MYSQL80_BASE:-/Applications/MAMP/Library/bin/mysql80}"
MARIADB_BASE="${MARIADB_BASE:-/Applications/XAMPP/xamppfiles}"
SOCK80=/tmp/agri_m2_mysql80.sock
SOCKMA=/tmp/agri_m2_maria104.sock
ME="$(whoami)"

start_mysql80() {
  mkdir -p "$SCRATCH/mysql80"
  if [ ! -d "$SCRATCH/mysql80/data/mysql" ]; then
    "$MYSQL80_BASE/bin/mysqld" --no-defaults --initialize-insecure --basedir="$MYSQL80_BASE" --datadir="$SCRATCH/mysql80/data" --user="$ME" > "$SCRATCH/mysql80/init.log" 2>&1
  fi
  rm -f "$SOCK80"
  nohup "$MYSQL80_BASE/bin/mysqld" --no-defaults --basedir="$MYSQL80_BASE" --datadir="$SCRATCH/mysql80/data" --port=3307 --mysqlx=OFF \
    --bind-address=127.0.0.1 --socket="$SOCK80" --pid-file="$SCRATCH/mysql80/mysql.pid" --log-error="$SCRATCH/mysql80/server.log" --user="$ME" > /dev/null 2>&1 &
}
start_mariadb() {
  mkdir -p "$SCRATCH/mariadb104"
  if [ ! -d "$SCRATCH/mariadb104/data/mysql" ]; then
    "$MARIADB_BASE/bin/mysql_install_db" --no-defaults --basedir="$MARIADB_BASE" --datadir="$SCRATCH/mariadb104/data" --user="$ME" --auth-root-authentication-method=normal > "$SCRATCH/mariadb104/init.log" 2>&1
  fi
  rm -f "$SOCKMA"
  nohup "$MARIADB_BASE/sbin/mysqld" --no-defaults --basedir="$MARIADB_BASE" --datadir="$SCRATCH/mariadb104/data" --port=3308 --bind-address=127.0.0.1 \
    --socket="$SOCKMA" --pid-file="$SCRATCH/mariadb104/maria.pid" --log-error="$SCRATCH/mariadb104/server.log" --user="$ME" --lc-messages-dir="$MARIADB_BASE/share/mysql" \
    --max-allowed-packet=64M --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci > /dev/null 2>&1 &
}
wait_ready() { # $1 admin binary, $2 socket
  for _ in $(seq 1 30); do "$1" --no-defaults -uroot --socket="$2" ping 2>/dev/null | grep -q alive && return 0; sleep 1; done; return 1
}
case "${1:-status}" in
  start)
    start_mysql80; start_mariadb
    wait_ready "$MYSQL80_BASE/bin/mysqladmin" "$SOCK80" && echo "MySQL 8.0   ready on 127.0.0.1:3307" || echo "MySQL 8.0 did not start (see $SCRATCH/mysql80/server.log)"
    wait_ready "$MARIADB_BASE/bin/mysqladmin" "$SOCKMA" && echo "MariaDB 10.4 ready on 127.0.0.1:3308" || echo "MariaDB did not start (see $SCRATCH/mariadb104/server.log)";;
  stop)
    "$MYSQL80_BASE/bin/mysqladmin" --no-defaults -uroot --socket="$SOCK80" shutdown 2>/dev/null && echo "MySQL 8.0 stopped" || echo "MySQL 8.0 not running"
    "$MARIADB_BASE/bin/mysqladmin" --no-defaults -uroot --socket="$SOCKMA" shutdown 2>/dev/null && echo "MariaDB stopped" || echo "MariaDB not running";;
  status)
    "$MYSQL80_BASE/bin/mysqladmin" --no-defaults -uroot --socket="$SOCK80" ping 2>/dev/null | sed 's/^/MySQL 8.0: /' || echo "MySQL 8.0: down"
    "$MARIADB_BASE/bin/mysqladmin" --no-defaults -uroot --socket="$SOCKMA" ping 2>/dev/null | sed 's/^/MariaDB 10.4: /' || echo "MariaDB 10.4: down";;
  reset) "$0" stop; rm -rf "$SCRATCH"; echo "scratch data removed: $SCRATCH";;
  *) echo "usage: $0 start|stop|status|reset"; exit 2;;
esac
