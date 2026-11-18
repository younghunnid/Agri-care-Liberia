#!/usr/bin/env bash
# Creates a small LOCAL certificate authority and a server certificate for this computer's LAN address,
# so an Android phone on the same Wi-Fi can open the app over real HTTPS (needed for install + offline).
#
#   scripts/make-dev-cert.sh [LAN_IP]        (default: auto-detected)
#
# Output (git-ignored): .dev-certs/ca.crt  <- install this ONE file on the phone (see docs/ANDROID_HTTPS_TESTING.md)
#                       .dev-certs/server.pem + server.key  <- used by scripts/dev-https-proxy.mjs
# The CA private key never leaves this folder. Delete .dev-certs/ and remove the CA from the phone when done.
set -euo pipefail
cd "$(dirname "$0")/.."
IP="${1:-$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}')}"
[ -n "$IP" ] || { echo "Could not detect the LAN IP. Pass it: scripts/make-dev-cert.sh 192.168.1.20" >&2; exit 1; }
OUT=.dev-certs
mkdir -p "$OUT"
chmod 700 "$OUT"
cd "$OUT"

if [ ! -f ca.key ]; then
  openssl genrsa -out ca.key 4096 2>/dev/null
  # The CA may only vouch for private-network addresses and localhost (name constraints), and it expires in 90 days,
  # so even if its key were ever leaked it could not impersonate public websites.
  openssl req -x509 -new -nodes -key ca.key -sha256 -days 90 -subj "/CN=Agri-Advisory Local Dev CA (testing only)" \
    -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" \
    -addext "nameConstraints=critical,permitted;IP:192.168.0.0/255.255.0.0,permitted;IP:10.0.0.0/255.0.0.0,permitted;IP:172.16.0.0/255.240.0.0,permitted;IP:127.0.0.0/255.0.0.0,permitted;DNS:localhost" \
    -out ca.pem
  cp ca.pem ca.crt
fi

openssl genrsa -out server.key 2048 2>/dev/null
openssl req -new -key server.key -subj "/CN=$IP" -out server.csr
cat > server.ext <<EXT
subjectAltName=IP:$IP,IP:127.0.0.1,DNS:localhost
basicConstraints=CA:FALSE
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
EXT
openssl x509 -req -in server.csr -CA ca.pem -CAkey ca.key -CAcreateserial -out server.pem -days 90 -sha256 -extfile server.ext 2>/dev/null
openssl verify -CAfile ca.pem server.pem
chmod 600 ca.key server.key
echo "Certificate for https://$IP:3443 created in $(pwd)"
echo "Install on the phone: $(pwd)/ca.crt"
