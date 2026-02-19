#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root_dir"

host="${1:-${DEPLOY_HOST:-root@85.239.60.3}}"
ssh_port="${SSH_PORT:-22}"
public_ports="${PUBLIC_PORTS:-80,443}"
blocked_ports="${BLOCKED_PORTS:-54322,8080,8081,5173}"
host_check="${HOST_CHECK:-${host#*@}}"

log() {
  printf '[harden-firewall] %s\n' "$*"
}

trim() {
  local v="${1:-}"
  v="${v#"${v%%[![:space:]]*}"}"
  v="${v%"${v##*[![:space:]]}"}"
  printf '%s' "$v"
}

probe_tcp_open() {
  local target="$1"
  local port="$2"
  if command -v nc >/dev/null 2>&1; then
    if nc -h 2>&1 | grep -q ' -G '; then
      # BSD netcat (macOS): -G controls connect timeout.
      nc -z -G 2 "$target" "$port" >/dev/null 2>&1
    else
      # GNU/OpenBSD netcat: -w controls timeout.
      nc -z -w 2 "$target" "$port" >/dev/null 2>&1
    fi
    return $?
  fi
  if command -v timeout >/dev/null 2>&1; then
    timeout 3 bash -lc "cat </dev/null >/dev/tcp/${target}/${port}" >/dev/null 2>&1
    return $?
  fi
  perl -MIO::Socket::INET -e 'exit(IO::Socket::INET->new(PeerAddr=>$ARGV[0],PeerPort=>$ARGV[1],Proto=>"tcp",Timeout=>2)?0:1)' "$target" "$port" >/dev/null 2>&1
}

apply_ufw_remote() {
  log "Applying UFW policy on ${host} (allow: ${ssh_port},${public_ports}; block: ${blocked_ports})"
  ssh "$host" \
    "SSH_PORT='${ssh_port}' PUBLIC_PORTS='${public_ports}' BLOCKED_PORTS='${blocked_ports}' bash -s" <<'REMOTE'
set -euo pipefail

echo "[remote] UFW status before:"
ufw status verbose || true

if ! command -v ufw >/dev/null 2>&1; then
  echo "[remote] Installing ufw..."
  apt-get update -y >/dev/null
  apt-get install -y ufw >/dev/null
fi

ufw allow "${SSH_PORT}/tcp" comment "ssh-access" >/dev/null

IFS=',' read -r -a allow_ports <<< "${PUBLIC_PORTS}"
for p in "${allow_ports[@]}"; do
  p="$(echo "$p" | xargs)"
  [[ -n "$p" ]] || continue
  ufw allow "${p}/tcp" >/dev/null
done

IFS=',' read -r -a deny_ports <<< "${BLOCKED_PORTS}"
for p in "${deny_ports[@]}"; do
  p="$(echo "$p" | xargs)"
  [[ -n "$p" ]] || continue

  while true; do
    rule_num="$(ufw status numbered | awk -v port="${p}/tcp" '$0 ~ port && $0 ~ /ALLOW/ { gsub(/[\[\]]/, "", $1); print $1; exit }')"
    [[ -n "${rule_num:-}" ]] || break
    ufw --force delete "$rule_num" >/dev/null || break
  done

  ufw deny "${p}/tcp" >/dev/null
done

ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null

if ! ufw status numbered | grep -Eq "(^| )${SSH_PORT}/tcp( +| ).*ALLOW"; then
  echo "[remote] SSH allow rule for ${SSH_PORT}/tcp not found, aborting for safety." >&2
  exit 1
fi

ufw --force enable >/dev/null
ufw reload >/dev/null

echo "[remote] UFW status after:"
ufw status verbose
REMOTE
}

apply_docker_user_drop_remote() {
  log "Applying DOCKER-USER drop rules on ${host} for ${blocked_ports}"
  ssh "$host" "BLOCKED_PORTS='${blocked_ports}' bash -s" <<'REMOTE'
set -euo pipefail

if ! command -v iptables >/dev/null 2>&1; then
  echo "[remote] iptables not found; cannot apply DOCKER-USER fallback." >&2
  exit 1
fi

public_iface="$(ip route show default | awk '/default/ {print $5; exit}')"
if [[ -z "${public_iface:-}" ]]; then
  echo "[remote] Could not detect public interface from default route." >&2
  exit 1
fi

iptables -N DOCKER-USER >/dev/null 2>&1 || true

IFS=',' read -r -a deny_ports <<< "${BLOCKED_PORTS}"
for p in "${deny_ports[@]}"; do
  p="$(echo "$p" | xargs)"
  [[ -n "$p" ]] || continue

  # Cleanup legacy broad DROP rules (without interface) that can break internal proxy traffic.
  while iptables -C DOCKER-USER -p tcp --dport "$p" -j DROP >/dev/null 2>&1; do
    iptables -D DOCKER-USER -p tcp --dport "$p" -j DROP
  done
  if command -v ip6tables >/dev/null 2>&1; then
    while ip6tables -C DOCKER-USER -p tcp --dport "$p" -j DROP >/dev/null 2>&1; do
      ip6tables -D DOCKER-USER -p tcp --dport "$p" -j DROP
    done
  fi

  mapped_port="$(iptables -t nat -S DOCKER \
    | awk -v host_port="$p" '
      $0 ~ ("--dport " host_port " ") {
        for (i = 1; i <= NF; i += 1) {
          if ($i == "--to-destination") {
            split($(i+1), parts, ":")
            print parts[length(parts)]
            exit
          }
        }
      }
    ')"
  if [[ -z "${mapped_port:-}" ]]; then
    mapped_port="$p"
  fi

  iptables -C DOCKER-USER -i "$public_iface" -p tcp --dport "$mapped_port" -j DROP >/dev/null 2>&1 || \
    iptables -I DOCKER-USER -i "$public_iface" -p tcp --dport "$mapped_port" -j DROP

  # Also keep direct host-port drop for ports that are not DNAT-translated.
  iptables -C DOCKER-USER -i "$public_iface" -p tcp --dport "$p" -j DROP >/dev/null 2>&1 || \
    iptables -I DOCKER-USER -i "$public_iface" -p tcp --dport "$p" -j DROP

  if command -v ip6tables >/dev/null 2>&1; then
    ip6tables -C DOCKER-USER -i "$public_iface" -p tcp --dport "$mapped_port" -j DROP >/dev/null 2>&1 || \
      ip6tables -I DOCKER-USER -i "$public_iface" -p tcp --dport "$mapped_port" -j DROP
    ip6tables -C DOCKER-USER -i "$public_iface" -p tcp --dport "$p" -j DROP >/dev/null 2>&1 || \
      ip6tables -I DOCKER-USER -i "$public_iface" -p tcp --dport "$p" -j DROP
  fi
  echo "[remote] DOCKER-USER drop applied: host ${p} -> container ${mapped_port} on ${public_iface}"
done

echo "[remote] DOCKER-USER rules:"
iptables -S DOCKER-USER || true
REMOTE
}

verify_ports() {
  local open_blocked=()
  IFS=',' read -r -a deny_ports <<< "${blocked_ports}"
  for p in "${deny_ports[@]}"; do
    p="$(trim "$p")"
    [[ -n "$p" ]] || continue
    if probe_tcp_open "$host_check" "$p"; then
      open_blocked+=("$p")
    fi
  done

  local open_public=()
  IFS=',' read -r -a allow_ports <<< "${public_ports}"
  for p in "${allow_ports[@]}"; do
    p="$(trim "$p")"
    [[ -n "$p" ]] || continue
    if probe_tcp_open "$host_check" "$p"; then
      open_public+=("$p")
    fi
  done

  printf '%s\n' "${open_blocked[*]:-}" > /tmp/harden_fw_open_blocked.$$
  printf '%s\n' "${open_public[*]:-}" > /tmp/harden_fw_open_public.$$
}

log "Target host: ${host}"
log "Safety check: SSH ${ssh_port}/tcp will be explicitly allowed before UFW enable."

apply_ufw_remote
verify_ports

blocked_after_ufw="$(cat /tmp/harden_fw_open_blocked.$$)"
public_after_ufw="$(cat /tmp/harden_fw_open_public.$$)"
rm -f /tmp/harden_fw_open_blocked.$$ /tmp/harden_fw_open_public.$$

if [[ -n "$blocked_after_ufw" ]]; then
  log "Warning: ports still reachable after UFW (likely Docker iptables bypass): ${blocked_after_ufw}"
  apply_docker_user_drop_remote
  verify_ports
  blocked_after_fallback="$(cat /tmp/harden_fw_open_blocked.$$)"
  public_after_fallback="$(cat /tmp/harden_fw_open_public.$$)"
  rm -f /tmp/harden_fw_open_blocked.$$ /tmp/harden_fw_open_public.$$
  if [[ -n "$blocked_after_fallback" ]]; then
    log "ERROR: blocked ports still open: ${blocked_after_fallback}"
    exit 1
  fi
  log "Blocked ports are now closed. Public ports still open: ${public_after_fallback:-none}"
else
  log "UFW alone closed blocked ports. Public ports still open: ${public_after_ufw:-none}"
fi

if curl -ksS -o /dev/null -w "%{http_code}" https://motio.nikog.net/realms/timeline/.well-known/openid-configuration | grep -Eq '^(200|301|302)$'; then
  log "Keycloak endpoint via HTTPS is reachable through Caddy."
else
  log "Warning: Keycloak HTTPS endpoint check returned unexpected status."
fi

log "Hardening completed."
