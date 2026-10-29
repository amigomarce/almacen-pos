#!/usr/bin/env bash
# Deja un equipo con Zorin OS Lite (XFCE) listo como caja del almacén (ADR-020).
#
# Uso, dentro de la sesión del usuario que atiende la caja (no como root):
#   bash /usr/share/almacen-pos/configurar-caja-linux.sh
#   bash /usr/share/almacen-pos/configurar-caja-linux.sh --deshacer
#
# Qué hace:
#   1. Abre la caja al iniciar sesión.
#   2. Quita los atajos del escritorio que sacan al cajero de la caja: tecla Super (menú),
#      Alt+Tab, Ctrl+Esc, Alt+F1/F2/F3 y los que usan Super. Alt+F4 lo bloquea la propia caja.
#   3. Evita que la pantalla se apague o se bloquee y que salgan avisos de actualizaciones.
#   4. Da permiso de impresora USB (grupo `lp`; pide la clave de administrador).
#
# Antes de tocar nada guarda una copia de los atajos en ~/.config/almacen-pos/. Con
# --deshacer se restaura y se quita el inicio automático; hay que cerrar sesión para verlo.
set -euo pipefail

RESPALDO="$HOME/.config/almacen-pos"
XML="$HOME/.config/xfce4/xfconf/xfce-perchannel-xml/xfce4-keyboard-shortcuts.xml"
AUTOSTART="$HOME/.config/autostart"

if [ "$(id -u)" = 0 ]; then
  echo "Ejecútalo como el usuario de la caja, no con sudo." >&2
  exit 1
fi
if ! command -v xfconf-query >/dev/null; then
  echo "No encuentro xfconf-query: este script es para Zorin OS Lite (escritorio XFCE)." >&2
  exit 1
fi

if [ "${1:-}" = "--deshacer" ]; then
  if [ -f "$RESPALDO/xfce4-keyboard-shortcuts.xml" ]; then
    cp "$RESPALDO/xfce4-keyboard-shortcuts.xml" "$XML"
  fi
  rm -f "$AUTOSTART/almacen-pos.desktop" "$AUTOSTART/update-notifier.desktop"
  echo "Listo. Cierra sesión y vuelve a entrar para recuperar los atajos del escritorio."
  exit 0
fi

mkdir -p "$RESPALDO" "$AUTOSTART"

# 1. Inicio automático.
cat >"$AUTOSTART/almacen-pos.desktop" <<'EOF'
[Desktop Entry]
Type=Application
Name=Almacén POS
Exec=almacen-pos
X-GNOME-Autostart-enabled=true
EOF
echo "✓ La caja se abrirá al iniciar sesión."

# 2. Atajos. La copia se hace una sola vez: si se corre de nuevo no pisa la original.
if [ -f "$XML" ] && [ ! -f "$RESPALDO/xfce4-keyboard-shortcuts.xml" ]; then
  cp "$XML" "$RESPALDO/xfce4-keyboard-shortcuts.xml"
fi
canal=xfce4-keyboard-shortcuts
quitados=0
while IFS= read -r propiedad; do
  case "$propiedad" in
    */override) continue ;;
    *Super* | *'<Alt>Tab' | *'<Alt><Shift>Tab' | *'<Primary>Escape' | *'<Alt>F1' | \
      *'<Alt>F2' | *'<Alt>F3' | *'<Alt>Escape')
      xfconf-query -c "$canal" -p "$propiedad" -r && quitados=$((quitados + 1))
      ;;
  esac
done < <(xfconf-query -c "$canal" -l | grep -E '^/(commands|xfwm4)/custom/')
echo "✓ Atajos del escritorio quitados: $quitados."

# 3. Pantalla siempre encendida y sin bloqueo. `-n` crea la propiedad si no existe.
pm=xfce4-power-manager
xfconf-query -c "$pm" -p /xfce4-power-manager/dpms-enabled -n -t bool -s false
xfconf-query -c "$pm" -p /xfce4-power-manager/blank-on-ac -n -t int -s 0
xfconf-query -c "$pm" -p /xfce4-power-manager/lock-screen-suspend-hibernate -n -t bool -s false
xfconf-query -c xfce4-screensaver -p /saver/enabled -n -t bool -s false
xfconf-query -c xfce4-screensaver -p /lock/enabled -n -t bool -s false
if command -v xset >/dev/null && [ -n "${DISPLAY:-}" ]; then
  xset s off -dpms || true
fi
if [ -f /etc/xdg/autostart/update-notifier.desktop ]; then
  printf '[Desktop Entry]\nType=Application\nName=update-notifier\nHidden=true\n' \
    >"$AUTOSTART/update-notifier.desktop"
fi
echo "✓ La pantalla no se apaga ni se bloquea; sin avisos de actualizaciones sobre la caja."

# 4. Impresora USB (/dev/usb/lp0). El cambio de grupo vale desde el próximo inicio de sesión.
if id -nG | tr ' ' '\n' | grep -qx lp; then
  echo "✓ El usuario ya puede usar la impresora USB."
else
  echo "Para la impresora USB hace falta la clave de administrador:"
  if sudo usermod -aG lp "$USER"; then
    echo "✓ Permiso de impresora USB agregado."
  else
    echo "✗ No se pudo agregar al grupo lp. Hazlo después con: sudo usermod -aG lp $USER" >&2
  fi
fi

echo
echo "Listo. Cierra sesión y vuelve a entrar (o reinicia) para que todo quede activo."
