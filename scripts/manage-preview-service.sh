#!/bin/zsh

set -euo pipefail

label="com.longbiao.ai-course.preview"
domain="gui/$(id -u)"
service="$domain/$label"
project_root="$(cd "$(dirname "$0")/.." && pwd)"
runner="$project_root/scripts/run-preview-service.sh"
plist="$HOME/Library/LaunchAgents/$label.plist"
log_dir="$HOME/Library/Logs"
stdout_log="$log_dir/ai-course-preview.log"
stderr_log="$log_dir/ai-course-preview.error.log"
preview_url="http://127.0.0.1:4178/zh-cn/stage-1/ov-001-what-is-ai/"

write_plist() {
  mkdir -p "${plist:h}" "$log_dir"
  rm -f "$plist"
  plutil -create xml1 "$plist"
  plutil -insert Label -string "$label" "$plist"
  plutil -insert ProgramArguments -json "[\"/bin/zsh\",\"$runner\"]" "$plist"
  plutil -insert WorkingDirectory -string "$project_root" "$plist"
  plutil -insert RunAtLoad -bool true "$plist"
  plutil -insert KeepAlive -bool true "$plist"
  plutil -insert ThrottleInterval -integer 5 "$plist"
  plutil -insert ProcessType -string Interactive "$plist"
  plutil -insert StandardOutPath -string "$stdout_log" "$plist"
  plutil -insert StandardErrorPath -string "$stderr_log" "$plist"
  plutil -insert EnvironmentVariables -json '{"PATH":"/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin","AI_COURSE_PREVIEW_PORT":"4178"}' "$plist"
  plutil -lint "$plist" >/dev/null
}

bootout_if_loaded() {
  launchctl bootout "$service" >/dev/null 2>&1 || true
}

wait_until_ready() {
  local attempt
  for attempt in {1..30}; do
    if curl -fsS --max-time 2 "$preview_url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

print_status() {
  local details
  if ! details="$(launchctl print "$service" 2>&1)"; then
    print "AI course preview service is not installed."
    return 1
  fi

  print "$details" | awk '/^\t(state|pid|last exit code) =/ { print }'
  if curl -fsS --max-time 3 "$preview_url" >/dev/null 2>&1; then
    print "ready = true"
    print "url = $preview_url"
    return 0
  fi

  print "ready = false"
  print "stderr = $stderr_log"
  return 1
}

install_service() {
  write_plist
  bootout_if_loaded
  launchctl enable "$service"
  launchctl bootstrap "$domain" "$plist"
  launchctl kickstart -k "$service"

  if ! wait_until_ready; then
    print -u2 "The preview service was installed but did not become ready."
    tail -n 80 "$stderr_log" >&2 || true
    return 1
  fi

  print "AI course preview service installed."
  print_status
}

restart_service() {
  if [[ ! -f "$plist" ]]; then
    install_service
    return
  fi
  launchctl kickstart -k "$service"
  if ! wait_until_ready; then
    print -u2 "The preview service did not become ready after restart."
    tail -n 80 "$stderr_log" >&2 || true
    return 1
  fi
  print_status
}

uninstall_service() {
  bootout_if_loaded
  launchctl disable "$service" >/dev/null 2>&1 || true
  rm -f "$plist"
  print "AI course preview service uninstalled."
}

case "${1:-status}" in
  install)
    install_service
    ;;
  restart)
    restart_service
    ;;
  status)
    print_status
    ;;
  logs)
    print "stdout = $stdout_log"
    print "stderr = $stderr_log"
    tail -n 80 "$stdout_log" "$stderr_log" 2>/dev/null || true
    ;;
  uninstall)
    uninstall_service
    ;;
  *)
    print -u2 "Usage: $0 {install|restart|status|logs|uninstall}"
    exit 2
    ;;
esac
