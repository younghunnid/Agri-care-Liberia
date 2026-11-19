#!/usr/bin/env bash
# Runs backend-php/public/.htaccess under a PRIVATE Apache 2.4 instance (own config, loopback high port, php-cgi 8.5) to prove the rewrite rules,
# file denial and error documents work the way Hostinger's Apache/LiteSpeed will use them. XAMPP's httpd.conf and running Apache are untouched.
# Needs the disposable MySQL on :3307 (database/validation/scratch-engines.sh start). Usage: tests/m3/apache-check.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HTTPD="${HTTPD_BIN:-/Applications/XAMPP/xamppfiles/bin/httpd}"
MODS="${HTTPD_MODULES:-/Applications/XAMPP/xamppfiles/modules}"
PHPCGI="${PHP_CGI_BIN:-/usr/local/bin/php-cgi}"
PORT="${APACHE_TEST_PORT:-18089}"
T="$(mktemp -d)"; trap 'kill "$(cat "$T/httpd.pid" 2>/dev/null)" 2>/dev/null || true; AGRI_DISPOSABLE_DB_OK=1 DB_USER=root DB_PASS= php "$ROOT/backend-php/tests/m3/provision.php" drop 127.0.0.1:3307 "$DB" "$DBU" 2>/dev/null || true; rm -rf "$T"' EXIT
mkdir -p "$T/htdocs" "$T/cgi" "$T/logs"
ln -s "$ROOT/backend-php/public" "$T/htdocs/api"          # same shape as public_html/api on Hostinger
echo "<!doctype html><title>spa</title>" > "$T/htdocs/index.html"
# httpoxy probes (behavioural). Three directories, each with a CGI script that dumps the environment it receives and a PHP probe:
#   poxy_on   = the REAL Proxy-header rule taken from backend-php/public/.htaccess
#   mech_on   = the SAME rule form applied to a harmless stand-in header (X-Poxy-Test)  -> proves the directive form works inside .htaccess
#   mech_off  = no rule (positive control for the stand-in: the header MUST reach the CGI environment, otherwise the test could not detect a broken rule)
# Apache >= 2.4.25 already refuses to pass "Proxy" into CGI, so the real header cannot be used as its own positive control on this server.
POXY_RULE="$(grep -E '^[[:space:]]*RequestHeader[[:space:]]+unset[[:space:]]+Proxy' "$ROOT/backend-php/public/.htaccess" || true)"
for d in poxy_on mech_on mech_off; do
  mkdir -p "$T/htdocs/$d"
  printf 'Options +ExecCGI\nAddHandler cgi-script .cgi\n' > "$T/htdocs/$d/.htaccess"
  printf '#!/bin/sh\necho "Content-Type: text/plain"\necho\nenv | grep -iE "^HTTP_(PROXY|X_POXY_TEST)=" || echo "absent"\n' > "$T/htdocs/$d/env.cgi"
  chmod +x "$T/htdocs/$d/env.cgi"
  printf '<?php header("Content-Type: text/plain"); echo "getenv=" . var_export(getenv("HTTP_PROXY"), true) . " server=" . var_export($_SERVER["HTTP_PROXY"] ?? null, true);\n' > "$T/htdocs/$d/probe.php"
done
[ -n "$POXY_RULE" ] && printf '<IfModule mod_headers.c>\n%s\n</IfModule>\n' "$POXY_RULE" >> "$T/htdocs/poxy_on/.htaccess"
[ -n "$POXY_RULE" ] && printf '<IfModule mod_headers.c>\n%s\n</IfModule>\n' "$(printf '%s' "$POXY_RULE" | sed 's/Proxy/X-Poxy-Test/')" >> "$T/htdocs/mech_on/.htaccess"
cat > "$T/cgi/php" <<SH
#!/bin/sh
exec "$PHPCGI" -d cgi.force_redirect=0 -d display_errors=0 "\$@"
SH
chmod +x "$T/cgi/php"
P="$(AGRI_DISPOSABLE_DB_OK=1 DB_USER=root DB_PASS= php "$ROOT/backend-php/tests/m3/provision.php" create 127.0.0.1:3307)"
DB="$(echo "$P" | php -r 'echo json_decode(stream_get_contents(STDIN))->db;')"; DBU="$(echo "$P" | php -r 'echo json_decode(stream_get_contents(STDIN))->user;')"; DBP="$(echo "$P" | php -r 'echo json_decode(stream_get_contents(STDIN))->pass;')"
SECRET1="$(openssl rand -hex 24)"; SECRET2="$(openssl rand -hex 24)"
cat > "$T/httpd.conf" <<CONF
ServerRoot "$T"
Listen 127.0.0.1:$PORT
PidFile "$T/httpd.pid"
ServerName localhost
$(for m in authz_core authz_host authn_core access_compat unixd mime dir alias env setenvif headers rewrite actions cgi log_config; do echo "LoadModule ${m}_module \"$MODS/mod_$m.so\""; done)
User $(id -un)
TypesConfig "${HTTPD_MIME_TYPES:-/Applications/XAMPP/xamppfiles/etc/mime.types}"
DocumentRoot "$T/htdocs"
ErrorLog "$T/logs/error.log"
LogLevel warn
DirectoryIndex index.html
<Directory "$T/htdocs">
  AllowOverride All
  Require all granted
</Directory>
ScriptAlias /cgi-bin/ "$T/cgi/"
<Directory "$T/cgi">
  Require all granted
</Directory>
AddHandler php-cgi .php
Action php-cgi /cgi-bin/php
SetEnv APP_ENV test
SetEnv CACHE_DIR $T/cache
SetEnv HEALTH_CACHE_TTL_SECONDS 0
SetEnv SESSION_SECRET $SECRET1
SetEnv OWNER_KEY_HMAC_SECRET $SECRET2
SetEnv DB_HOST 127.0.0.1
SetEnv DB_PORT 3307
SetEnv DB_NAME $DB
SetEnv DB_USER $DBU
SetEnv DB_PASS $DBP
SetEnv LOG_DIR $T/logs
CONF
"$HTTPD" -t -f "$T/httpd.conf" >/dev/null 2>"$T/syntax.txt" || { cat "$T/syntax.txt"; exit 1; }
"$HTTPD" -f "$T/httpd.conf" || { echo "httpd failed to start"; cat "$T/logs/error.log"; exit 1; }; for i in $(seq 1 30); do curl -s -o /dev/null "http://127.0.0.1:$PORT/" && break; sleep 0.2; done
B="http://127.0.0.1:$PORT"; fail=0
chk() { # name expected actual
  if [ "$2" = "$3" ]; then echo "  ok   $1"; else echo "  FAIL $1 (expected '$2', got '$3')"; fail=1; fi; }
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
body() { curl -s "$@"; }
hdr() { curl -s -D - -o /dev/null "$@" | tr -d '\r'; }
chk "GET /api/v1/health -> 200"                      200 "$(code $B/api/v1/health)"
chk "health body is JSON with status ok"             ok  "$(body $B/api/v1/health | php -r 'echo json_decode(stream_get_contents(STDIN))->status ?? "";')"
chk "published guides reach 7 under Apache"          7   "$(body $B/api/v1/health | php -r 'echo json_decode(stream_get_contents(STDIN))->publishedGuides ?? "";')"
chk "GET /api/v1/csrf-token -> 200"                  200 "$(code $B/api/v1/csrf-token)"
chk "csrf cookie set"                                1   "$(hdr $B/api/v1/csrf-token | grep -ci '^set-cookie: agri_csrf=')"
chk "unknown API path -> JSON 404 (not Apache HTML)" 404 "$(code $B/api/v1/nope)"
chk "unknown API path body is JSON"                  NOT_FOUND "$(body $B/api/v1/nope | php -r 'echo json_decode(stream_get_contents(STDIN))->error->code ?? "";')"
chk "/api/index.php is not an API route (JSON 404)"  404 "$(code $B/api/index.php)"
chk "/api/.htaccess denied"                          403 "$(code $B/api/.htaccess)"
chk "/api/.env denied"                               403 "$(code $B/api/.env)"
chk "other file types in /api denied (.sql)"        403 "$(code $B/api/001_schema.sql)"
chk "/api/index.php/extra (PATH_INFO) refused"       404 "$(code $B/api/index.php/v1/health)"
chk "/api/error.json is served as JSON"              application/json "$(hdr $B/api/error.json | grep -i '^content-type' | sed 's/.*: //; s/;.*//')"
chk "directory listing disabled /api/"               404 "$(code $B/api/)"
chk "POST without CSRF -> 403"                       403 "$(code -X POST -H 'Content-Type: application/json' -d '{}' $B/api/v1/auth/login)"
chk "malformed JSON -> 400"                          400 "$(code -X POST -H 'Content-Type: application/json' -d '{bad' $B/api/v1/auth/login)"
chk "nosniff header present"                         1   "$(hdr $B/api/v1/health | grep -ci '^x-content-type-options: nosniff')"
chk "no X-Powered-By"                                0   "$(hdr $B/api/v1/health | grep -ci '^x-powered-by')"
chk "Server version hidden by config (ServerSignature Off)" 0 "$(body $B/api/v1/nope | grep -ci 'apache/')"
chk "SPA root outside /api untouched (index.html)"   200 "$(code $B/)"
echo "-- httpoxy (behavioural): a client 'Proxy:' header must never become HTTP_PROXY"
chk "rule present in the shipped .htaccess"                   1   "$([ -n "$POXY_RULE" ] && echo 1 || echo 0)"
chk "CONTROL: without a rule the stand-in header reaches the CGI environment (test is sensitive)" "HTTP_X_POXY_TEST=leaked" "$(curl -s -H 'X-Poxy-Test: leaked' $B/mech_off/env.cgi | tr -d '\r')"
chk "the shipped rule FORM removes the stand-in header inside .htaccess" "absent" "$(curl -s -H 'X-Poxy-Test: leaked' $B/mech_on/env.cgi | tr -d '\r')"
chk "real 'Proxy:' header never reaches the CGI environment under the shipped rule" "absent" "$(curl -s -H 'Proxy: http://127.0.0.1:9/' $B/poxy_on/env.cgi | tr -d '\r')"
echo "  info this Apache $("$HTTPD" -v | sed -n 's/.*Apache\/\([0-9.]*\).*/\1/p') $([ "$(curl -s -H 'Proxy: http://127.0.0.1:9/' $B/mech_off/env.cgi | tr -d '\r')" = absent ] && echo 'ignores the Proxy header by itself (>= 2.4.25); the rule is defence in depth for older Apache/LiteSpeed' || echo 'passes the Proxy header: the rule is REQUIRED')"
chk "PHP under the shipped rule sees neither getenv nor \$_SERVER" "getenv=false server=NULL" "$(curl -s -H 'Proxy: http://127.0.0.1:9/' $B/poxy_on/probe.php)"
chk "real API still works when a Proxy header is sent"        200 "$(code -H 'Proxy: http://127.0.0.1:9/' $B/api/v1/health)"
BS="$(PHP_BIN_FOR_CLI=${PHP_CLI_BIN:-php}; env -i PATH="$PATH" HTTP_PROXY=http://127.0.0.1:9/ "${PHP_CLI_BIN:-php}" -r '$_SERVER["REQUEST_URI"]="/api/v1/x"; $_SERVER["REQUEST_METHOD"]="GET"; $_SERVER["HTTP_PROXY"]="http://127.0.0.1:9/"; require $argv[1]."/app/autoload.php"; ob_start(); \Agri\Bootstrap::run($argv[1]); ob_end_clean(); echo "getenv=" . var_export(getenv("HTTP_PROXY"), true) . " server=" . var_export($_SERVER["HTTP_PROXY"] ?? null, true);' "$ROOT/backend-php" 2>/dev/null)"
chk "bootstrap itself removes HTTP_PROXY from env and \$_SERVER (defence in depth)" "getenv=false server=NULL" "$BS"
DIS="$(env -i PATH="$PATH" "${PHP_CLI_BIN:-php}" -d disable_functions=putenv,umask,header_remove -r '$_SERVER["REQUEST_URI"]="/api/v1/x"; $_SERVER["REQUEST_METHOD"]="GET"; require $argv[1]."/app/autoload.php"; ob_start(); \Agri\Bootstrap::run($argv[1]); $o = ob_get_clean(); echo (str_contains($o, "SERVER_MISCONFIGURED") ? "clean-json-error" : "unexpected: " . substr($o, 0, 80));' "$ROOT/backend-php" 2>&1)"
chk "hosts that disable putenv/umask/header_remove still get a clean JSON error, not a crash" "clean-json-error" "$DIS"
[ "$fail" = 0 ] && echo "Apache check: all passed" || { echo "Apache check: FAILED"; tail -5 "$T/logs/error.log" 2>/dev/null; exit 1; }
