#compdef nimbus

# Dynamic completion helpers
_nimbus_kubectl_contexts() {
  local contexts
  contexts=(${(f)"$(kubectl config get-contexts -o name 2>/dev/null)"})
  _describe 'kubectl contexts' contexts
}

_nimbus_namespaces() {
  local namespaces
  namespaces=(${(f)"$(kubectl get namespaces -o name 2>/dev/null | sed 's|namespace/||')"})
  _describe 'kubernetes namespaces' namespaces
}

_nimbus_tf_workspaces() {
  local workspaces
  workspaces=(${(f)"$(terraform workspace list 2>/dev/null | sed 's/^[* ]*//')"})
  _describe 'terraform workspaces' workspaces
}

_nimbus() {
  local -a commands
  commands=(
    'chat:Interactive DevOps agent TUI'
    'run:Run agent non-interactively'
    'plan:Preview infrastructure changes'
    'init:Generate NIMBUS.md project context'
    'login:Configure LLM provider'
    'logout:Remove credentials'
    'help:Show help'
    'version:Show version'
    'upgrade:Upgrade to latest version'
    'update:Alias for upgrade'
    'doctor:Check environment'
    'logs:Stream Kubernetes pod logs'
    'status:Show current agent status'
    'alias:Manage command aliases'
    'pipeline:Run CI/CD pipeline'
    'rollback:Rollback infrastructure changes'
    'incident:Incident response session'
    'runbook:Execute operational runbooks'
    'schedule:Manage periodic automation'
    'export:Export session to file'
  )
  _arguments \
    '1: :->command' \
    '--mode[Agent mode]:mode:(plan build deploy)' \
    '--format[Output format]:format:(text json table md html)' \
    '--auto-approve[Auto-approve permissions]' \
    '--model[LLM model]:model:' \
    '--context[kubectl context]:context:_nimbus_kubectl_contexts' \
    '--namespace[Kubernetes namespace]:namespace:_nimbus_namespaces' \
    '--workspace[Terraform workspace]:workspace:_nimbus_tf_workspaces' \
    '--budget[Cost budget in USD]:budget:' \
    '--quiet[Suppress banners/headers]' \
    '--version[Show version]' \
    '--help[Show help]'
  # G20: Subcommand completions
  case ${words[2]} in
    tf|terraform)
      local -a tf_cmds; tf_cmds=('init' 'plan' 'apply' 'destroy' 'validate' 'workspace' 'output')
      _describe 'terraform subcommands' tf_cmds; return ;;
    k8s|kubectl)
      local -a k8s_cmds; k8s_cmds=('get' 'apply' 'delete' 'logs' 'scale' 'rollout' 'exec' 'describe' 'diff')
      _describe 'kubectl subcommands' k8s_cmds; return ;;
    helm)
      local -a helm_cmds; helm_cmds=('install' 'upgrade' 'rollback' 'uninstall' 'list' 'show' 'diff')
      _describe 'helm subcommands' helm_cmds; return ;;
    runbook)
      local -a rb_cmds; rb_cmds=('list' 'run' 'create')
      _describe 'runbook subcommands' rb_cmds; return ;;
    schedule)
      local -a sched_cmds; sched_cmds=('list' 'add' 'remove' 'run-now')
      _describe 'schedule subcommands' sched_cmds; return ;;
  esac
  case $state in
    command) _describe 'nimbus commands' commands ;;
  esac
}
_nimbus "$@"
