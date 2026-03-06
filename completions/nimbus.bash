#!/usr/bin/env bash

# Dynamic completion helpers
_nimbus_kubectl_contexts() {
  kubectl config get-contexts -o name 2>/dev/null
}
_nimbus_namespaces() {
  kubectl get namespaces -o name 2>/dev/null | sed 's|namespace/||'
}
_nimbus_tf_workspaces() {
  terraform workspace list 2>/dev/null | sed 's/^[* ]*//'
}

_nimbus_completions() {
  local cur="${COMP_WORDS[COMP_CWORD]}"
  local prev="${COMP_WORDS[COMP_CWORD-1]}"
  local commands="chat run plan build deploy init login logout help version upgrade update doctor logs status alias pipeline rollback incident runbook schedule export"
  # G20: Subcommand completions for terraform/kubectl/helm
  case "${COMP_WORDS[1]}" in
    tf|terraform) COMPREPLY=($(compgen -W "init plan apply destroy validate workspace output" -- "${cur}")); return ;;
    k8s|kubectl)  COMPREPLY=($(compgen -W "get apply delete logs scale rollout exec describe diff" -- "${cur}")); return ;;
    helm)         COMPREPLY=($(compgen -W "install upgrade rollback uninstall list show diff" -- "${cur}")); return ;;
    runbook)      COMPREPLY=($(compgen -W "list run create" -- "${cur}")); return ;;
    schedule)     COMPREPLY=($(compgen -W "list add remove run-now" -- "${cur}")); return ;;
    export)       COMPREPLY=($(compgen -W "--format --output" -- "${cur}")); return ;;
  esac
  case "$prev" in
    --mode) COMPREPLY=($(compgen -W "plan build deploy" -- "$cur")); return ;;
    --format) COMPREPLY=($(compgen -W "text json table md html" -- "$cur")); return ;;
    --ui) COMPREPLY=($(compgen -W "ink readline" -- "$cur")); return ;;
    --context) COMPREPLY=($(compgen -W "$(_nimbus_kubectl_contexts)" -- "$cur")); return ;;
    --namespace|-n) COMPREPLY=($(compgen -W "$(_nimbus_namespaces)" -- "$cur")); return ;;
    --workspace) COMPREPLY=($(compgen -W "$(_nimbus_tf_workspaces)" -- "$cur")); return ;;
    nimbus) COMPREPLY=($(compgen -W "$commands" -- "$cur")); return ;;
  esac
  COMPREPLY=($(compgen -W "--mode --format --auto-approve --stdin --model --max-turns --help --version --context --namespace --workspace --quiet --budget" -- "$cur"))
}
complete -F _nimbus_completions nimbus
