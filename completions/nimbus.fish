complete -c nimbus -f

# Subcommands
complete -c nimbus -n '__fish_use_subcommand' -a chat -d 'Interactive DevOps agent TUI'
complete -c nimbus -n '__fish_use_subcommand' -a run -d 'Run agent non-interactively'
complete -c nimbus -n '__fish_use_subcommand' -a plan -d 'Preview infrastructure changes'
complete -c nimbus -n '__fish_use_subcommand' -a init -d 'Generate NIMBUS.md'
complete -c nimbus -n '__fish_use_subcommand' -a login -d 'Configure LLM provider'
complete -c nimbus -n '__fish_use_subcommand' -a logout -d 'Remove credentials'
complete -c nimbus -n '__fish_use_subcommand' -a help -d 'Show help'
complete -c nimbus -n '__fish_use_subcommand' -a version -d 'Show version'
complete -c nimbus -n '__fish_use_subcommand' -a upgrade -d 'Upgrade to latest version'
complete -c nimbus -n '__fish_use_subcommand' -a update -d 'Alias for upgrade'
complete -c nimbus -n '__fish_use_subcommand' -a doctor -d 'Check environment'
complete -c nimbus -n '__fish_use_subcommand' -a logs -d 'Stream Kubernetes pod logs'
complete -c nimbus -n '__fish_use_subcommand' -a status -d 'Show current agent status'
complete -c nimbus -n '__fish_use_subcommand' -a alias -d 'Manage command aliases'
complete -c nimbus -n '__fish_use_subcommand' -a pipeline -d 'Run CI/CD pipeline'
complete -c nimbus -n '__fish_use_subcommand' -a rollback -d 'Rollback infrastructure changes'
complete -c nimbus -n '__fish_use_subcommand' -a incident -d 'Incident response session'
complete -c nimbus -n '__fish_use_subcommand' -a runbook -d 'Execute operational runbooks'
complete -c nimbus -n '__fish_use_subcommand' -a schedule -d 'Manage periodic automation'
complete -c nimbus -n '__fish_use_subcommand' -a export -d 'Export session to file'

# G20: Subcommand completions for tf/kubectl/helm
complete -c nimbus -n '__fish_seen_subcommand_from tf terraform' -a 'init plan apply destroy validate workspace output' -d 'terraform subcommand'
complete -c nimbus -n '__fish_seen_subcommand_from k8s kubectl' -a 'get apply delete logs scale rollout exec describe diff' -d 'kubectl subcommand'
complete -c nimbus -n '__fish_seen_subcommand_from helm' -a 'install upgrade rollback uninstall list show diff' -d 'helm subcommand'
complete -c nimbus -n '__fish_seen_subcommand_from runbook' -a 'list run create' -d 'runbook subcommand'
complete -c nimbus -n '__fish_seen_subcommand_from schedule' -a 'list add remove run-now' -d 'schedule subcommand'

# Flags
complete -c nimbus -l mode -a 'plan build deploy' -d 'Agent mode'
complete -c nimbus -l format -a 'text json table md html' -d 'Output format'
complete -c nimbus -l auto-approve -d 'Auto-approve permissions'
complete -c nimbus -l model -d 'LLM model override'
complete -c nimbus -l max-turns -d 'Maximum agent turns'
complete -c nimbus -l budget -d 'Cost budget in USD'
complete -c nimbus -l quiet -s q -d 'Suppress banners and decorative headers'

# Dynamic completions for --context (kubectl contexts)
complete -c nimbus -l context -d 'kubectl context' -a '(kubectl config get-contexts -o name 2>/dev/null)'

# Dynamic completions for --namespace (kubernetes namespaces)
complete -c nimbus -l namespace -s n -d 'Kubernetes namespace' -a '(kubectl get namespaces -o name 2>/dev/null | string replace "namespace/" "")'

# Dynamic completions for --workspace (terraform workspaces)
complete -c nimbus -l workspace -d 'Terraform workspace' -a '(terraform workspace list 2>/dev/null | string replace -r "^[* ]*" "")'
