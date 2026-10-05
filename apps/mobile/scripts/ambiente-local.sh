#!/usr/bin/env bash
#
# Ambiente de DEVELOPMENT do Mobile: API + Metro no PC, celular (Jaa Dev) pela mesma rede Wi-Fi.
#
#   ambiente-local.sh iniciar   # confere a rede Windows/WSL, sobe a API e abre o Metro neste terminal
#   ambiente-local.sh parar     # encerra a API e o Metro que este script subiu
#
# Não usa USB nem adb, não inicia a Web, não roda migrations e não altera o banco.
# O IP do PC nunca fica gravado: é detectado a cada execução.
set -euo pipefail

RAIZ="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/../../.." && pwd)"
MOBILE="$RAIZ/apps/mobile"
REGISTROS="$HOME/.cache/jaa"
PORTA_API=3333
PORTA_METRO=8081
# Regras de firewall já existentes neste PC; o script só cria a que faltar, com estes nomes.
REGRA_API="Jaa API Dev $PORTA_API"
REGRA_METRO="Jaa Metro Dev $PORTA_METRO"

falhar() { printf '\nERRO: %s\n\n' "$1" >&2; exit 1; }
dizer() { printf '%s\n' "$1"; }

pids_na_porta() { ss -ltnpH 2>/dev/null | awk -v porta=":$1" '$4 ~ porta"$"' | grep -oP 'pid=\K[0-9]+' | sort -u || true; }
porta_ativa() { [ -n "$(pids_na_porta "$1")" ]; }

# Encerra o que estiver escutando na porta — mas só se for um processo do próprio Jaa.
liberar_porta() {
  local porta="$1" nome="$2" pid pasta
  for pid in $(pids_na_porta "$porta"); do
    pasta="$(readlink -f "/proc/$pid/cwd" 2>/dev/null || true)"
    case "$pasta" in
      "$RAIZ"*) ;;
      *) falhar "a porta $porta está em uso por outro programa (pid $pid, em ${pasta:-?}). Feche-o antes." ;;
    esac
    dizer "Encerrando $nome anterior (pid $pid)..."
    # O grupo inteiro: npm → tsx/expo → node.
    kill -TERM -- "-$(ps -o pgid= -p "$pid" | tr -d ' ')" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  done
  for _ in $(seq 1 20); do porta_ativa "$porta" || return 0; sleep 0.5; done
  for pid in $(pids_na_porta "$porta"); do kill -KILL "$pid" 2>/dev/null || true; done
  sleep 0.5
  porta_ativa "$porta" && falhar "não foi possível liberar a porta $porta."
  return 0
}

ip_do_windows() {
  # IPv4 do adaptador que tem saída para a rede (Wi-Fi/cabo), nunca os virtuais do WSL/Hyper-V.
  powershell.exe -NoProfile -Command "(Get-NetIPConfiguration | Where-Object { \$_.IPv4DefaultGateway -ne \$null -and \$_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1).IPv4Address.IPAddress" 2>/dev/null | tr -d '\r\n '
}
ip_do_wsl() { ip -4 -o addr show eth0 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | head -1; }

# "escuta:porta>destino:porta" de cada encaminhamento atual do Windows para as duas portas.
encaminhamentos() {
  netsh.exe interface portproxy show v4tov4 2>/dev/null | tr -d '\r' |
    awk -v a="$PORTA_API" -v m="$PORTA_METRO" '$1 ~ /^[0-9.*]+$/ && ($2 == a || $2 == m) { print $1 ":" $2 ">" $3 ":" $4 }'
}
regra_existe() { netsh.exe advfirewall firewall show rule name="$1" >/dev/null 2>&1; }

# Deixa o Windows encaminhando <IP da rede>:3333 e :8081 para o WSL. Só pede Administrador (UAC)
# quando algo precisa mudar: IP do Windows ou do WSL diferente, ou regra de firewall ausente.
preparar_rede() {
  local windows="$1" wsl="$2" comandos="" atual porta
  local esperado_api="$windows:$PORTA_API>$wsl:$PORTA_API" esperado_metro="$windows:$PORTA_METRO>$wsl:$PORTA_METRO"

  while IFS= read -r atual; do
    [ -z "$atual" ] && continue
    if [ "$atual" != "$esperado_api" ] && [ "$atual" != "$esperado_metro" ]; then
      # Sobra de um IP antigo: sai, para não haver dois encaminhamentos da mesma porta.
      comandos+="netsh interface portproxy delete v4tov4 listenaddress=${atual%%:*} listenport=$(cut -d: -f2 <<<"${atual%%>*}"); "
    fi
  done < <(encaminhamentos)

  for porta in "$PORTA_API" "$PORTA_METRO"; do
    encaminhamentos | grep -Fxq "$windows:$porta>$wsl:$porta" ||
      comandos+="netsh interface portproxy add v4tov4 listenaddress=$windows listenport=$porta connectaddress=$wsl connectport=$porta; "
  done
  regra_existe "$REGRA_API" || comandos+="netsh advfirewall firewall add rule name='$REGRA_API' dir=in action=allow protocol=TCP localport=$PORTA_API; "
  regra_existe "$REGRA_METRO" || comandos+="netsh advfirewall firewall add rule name='$REGRA_METRO' dir=in action=allow protocol=TCP localport=$PORTA_METRO; "

  if [ -z "$comandos" ]; then
    dizer "Rede Windows → WSL: já correta ($windows → $wsl, portas $PORTA_API e $PORTA_METRO)."
    return 0
  fi

  dizer "Rede Windows → WSL precisa de ajuste (o IP mudou ou falta regra)."
  dizer "O Windows vai pedir permissão de Administrador (UAC): confirme com \"Sim\"."
  powershell.exe -NoProfile -Command "Start-Process powershell -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '-NoProfile','-Command',\"$comandos\"" >/dev/null 2>&1 || true

  if encaminhamentos | grep -Fxq "$esperado_api" && encaminhamentos | grep -Fxq "$esperado_metro" && [ "$(encaminhamentos | wc -l)" -eq 2 ]; then
    dizer "Rede Windows → WSL: ajustada ($windows → $wsl)."
  else
    falhar "a rede não foi ajustada (permissão negada?). Rode de novo e confirme o UAC, ou execute num PowerShell de Administrador:
  ${comandos//; /
  }"
  fi
}

banco_no_ar() { (exec 3<>/dev/tcp/127.0.0.1/55433) 2>/dev/null; }

iniciar() {
  mkdir -p "$REGISTROS"
  # Android SDK/Java do ambiente existente (necessário só para builds; preservado como está).
  # shellcheck disable=SC1091
  [ -f "$HOME/.jaa-android-env" ] && source "$HOME/.jaa-android-env"

  dizer ""
  dizer "=== Jaa Mobile (Development local, pela rede Wi-Fi) ==="
  dizer ""

  local windows wsl
  windows="$(ip_do_windows)"
  wsl="$(ip_do_wsl)"
  [[ "$windows" =~ ^[0-9]+(\.[0-9]+){3}$ ]] || falhar "não encontrei o IP do Windows na rede. O PC está conectado ao Wi-Fi/cabo?"
  [[ "$wsl" =~ ^[0-9]+(\.[0-9]+){3}$ ]] || falhar "não encontrei o IP do WSL (interface eth0)."

  preparar_rede "$windows" "$wsl"

  # O banco é só LIGADO se estiver parado (mesmo container, mesmos dados). Nenhuma migration roda aqui.
  if ! banco_no_ar; then
    dizer "PostgreSQL local parado: ligando o container (sem migrations)..."
    (cd "$RAIZ" && npm run --silent banco:subir) || falhar "não foi possível ligar o PostgreSQL local (Docker está aberto?)."
  fi

  liberar_porta "$PORTA_API" "API"
  liberar_porta "$PORTA_METRO" "Metro"

  dizer "Iniciando a API (porta $PORTA_API)..."
  (cd "$RAIZ" && setsid nohup npm run dev -w @jaa/api >"$REGISTROS/api.log" 2>&1 &)
  for _ in $(seq 1 40); do porta_ativa "$PORTA_API" && break; sleep 0.5; done
  porta_ativa "$PORTA_API" || falhar "a API não subiu. Veja: $REGISTROS/api.log"

  dizer ""
  dizer "  IP do PC na rede:   $windows"
  dizer "  API:                http://$windows:$PORTA_API   (teste: http://$windows:$PORTA_API/health)"
  dizer "  No Jaa Dev, abra:   http://$windows:$PORTA_METRO"
  dizer ""
  dizer "  Registros:  Metro (inclui os erros do Android) → $REGISTROS/metro.log"
  dizer "              API                                → $REGISTROS/api.log"
  dizer "  Encerrar:   Ctrl+C aqui e depois  jaa-mobile-stop"
  dizer ""

  cd "$MOBILE"
  # Sem URL fixa: o app usa, para a API, o mesmo host de onde o Metro o serviu.
  unset EXPO_PUBLIC_JAA_API_URL
  # O Metro anuncia o IP da rede (não o interno do WSL): o endereço e o QR do terminal ficam certos.
  export REACT_NATIVE_PACKAGER_HOSTNAME="$windows"
  local metro="npx expo start --dev-client --host lan --port $PORTA_METRO"
  if command -v script >/dev/null 2>&1; then
    # `script` mantém o terminal interativo (teclas r, j, m do Expo) e grava tudo no arquivo.
    exec script -qfec "$metro" "$REGISTROS/metro.log"
  fi
  # shellcheck disable=SC2086
  exec $metro 2>&1 | tee "$REGISTROS/metro.log"
}

parar() {
  dizer ""
  liberar_porta "$PORTA_METRO" "Metro"
  liberar_porta "$PORTA_API" "API"
  dizer "Ambiente Mobile encerrado (API e Metro). O PostgreSQL local continua ligado."
  dizer ""
}

case "${1:-}" in
  iniciar) iniciar ;;
  parar) parar ;;
  *) falhar "uso: ambiente-local.sh iniciar | parar" ;;
esac
