import { RestClient, type RestClientOptions } from './rest-client';
import { ServiceURLs } from './service-discovery';

/**
 * Unified Tools Client for MCP Tools Services
 * Provides a single interface to interact with all tool services
 */
export class ToolsClient {
  private gitClient: RestClient;
  private fsClient: RestClient;
  private terraformClient: RestClient;
  private k8sClient: RestClient;
  private helmClient: RestClient;
  private awsClient: RestClient;
  private githubClient: RestClient;
  private gcpClient: RestClient;
  private azureClient: RestClient;

  constructor(options: RestClientOptions = {}) {
    this.gitClient = new RestClient(ServiceURLs.GIT_TOOLS, options);
    this.fsClient = new RestClient(ServiceURLs.FS_TOOLS, options);
    this.terraformClient = new RestClient(ServiceURLs.TERRAFORM_TOOLS, options);
    this.k8sClient = new RestClient(ServiceURLs.K8S_TOOLS, options);
    this.helmClient = new RestClient(ServiceURLs.HELM_TOOLS, options);
    this.awsClient = new RestClient(ServiceURLs.AWS_TOOLS, options);
    this.githubClient = new RestClient(ServiceURLs.GITHUB_TOOLS, options);
    this.gcpClient = new RestClient(ServiceURLs.GCP_TOOLS, options);
    this.azureClient = new RestClient(ServiceURLs.AZURE_TOOLS, options);
  }

  // ==================== Git Operations ====================

  git = {
    clone: async (url: string, path: string, options?: { branch?: string; depth?: number }) => {
      return this.gitClient.post('/api/git/clone', { url, path, ...options });
    },

    status: async (path?: string) => {
      const query = path ? `?path=${encodeURIComponent(path)}` : '';
      return this.gitClient.get(`/api/git/status${query}`);
    },

    add: async (files?: string | string[], path?: string) => {
      return this.gitClient.post('/api/git/add', { files, path });
    },

    commit: async (
      message: string,
      options?: { path?: string; amend?: boolean; allowEmpty?: boolean }
    ) => {
      return this.gitClient.post('/api/git/commit', { message, ...options });
    },

    push: async (options?: {
      path?: string;
      remote?: string;
      branch?: string;
      force?: boolean;
      setUpstream?: boolean;
    }) => {
      return this.gitClient.post('/api/git/push', options);
    },

    pull: async (options?: {
      path?: string;
      remote?: string;
      branch?: string;
      rebase?: boolean;
    }) => {
      return this.gitClient.post('/api/git/pull', options);
    },

    createBranch: async (
      name: string,
      options?: { path?: string; checkout?: boolean; startPoint?: string }
    ) => {
      return this.gitClient.post('/api/git/branch', { name, ...options });
    },

    listBranches: async (path?: string, showRemote?: boolean) => {
      const params = new URLSearchParams();
      if (path) {
        params.set('path', path);
      }
      if (showRemote) {
        params.set('remote', 'true');
      }
      const query = params.toString() ? `?${params.toString()}` : '';
      return this.gitClient.get(`/api/git/branches${query}`);
    },

    checkout: async (target: string, options?: { path?: string; create?: boolean }) => {
      return this.gitClient.post('/api/git/checkout', { target, ...options });
    },

    diff: async (options?: {
      path?: string;
      cached?: boolean;
      nameOnly?: boolean;
      from?: string;
      to?: string;
    }) => {
      const params = new URLSearchParams();
      if (options?.path) {
        params.set('path', options.path);
      }
      if (options?.cached) {
        params.set('cached', 'true');
      }
      if (options?.nameOnly) {
        params.set('nameOnly', 'true');
      }
      if (options?.from) {
        params.set('from', options.from);
      }
      if (options?.to) {
        params.set('to', options.to);
      }
      const query = params.toString() ? `?${params.toString()}` : '';
      return this.gitClient.get(`/api/git/diff${query}`);
    },

    log: async (options?: {
      path?: string;
      maxCount?: number;
      from?: string;
      to?: string;
      file?: string;
    }) => {
      const params = new URLSearchParams();
      if (options?.path) {
        params.set('path', options.path);
      }
      if (options?.maxCount) {
        params.set('maxCount', options.maxCount.toString());
      }
      if (options?.from) {
        params.set('from', options.from);
      }
      if (options?.to) {
        params.set('to', options.to);
      }
      if (options?.file) {
        params.set('file', options.file);
      }
      const query = params.toString() ? `?${params.toString()}` : '';
      return this.gitClient.get(`/api/git/log${query}`);
    },

    merge: async (
      branch: string,
      options?: { path?: string; noFf?: boolean; squash?: boolean; message?: string }
    ) => {
      return this.gitClient.post('/api/git/merge', { branch, ...options });
    },

    stash: async (
      command: 'push' | 'pop' | 'list' | 'drop' | 'apply' | 'clear',
      options?: { path?: string; message?: string; index?: number }
    ) => {
      return this.gitClient.post('/api/git/stash', { command, ...options });
    },

    fetch: async (options?: { path?: string; remote?: string; prune?: boolean }) => {
      return this.gitClient.post('/api/git/fetch', options);
    },

    reset: async (
      target: string,
      options?: { path?: string; mode?: 'soft' | 'mixed' | 'hard' }
    ) => {
      return this.gitClient.post('/api/git/reset', { target, ...options });
    },

    init: async (options?: { path?: string; bare?: boolean }) => {
      return this.gitClient.post('/api/git/init', options);
    },

    remote: async (options?: { path?: string; name?: string }) => {
      const params = new URLSearchParams();
      if (options?.path) {
        params.set('path', options.path);
      }
      if (options?.name) {
        params.set('name', options.name);
      }
      const query = params.toString() ? `?${params.toString()}` : '';
      return this.gitClient.get(`/api/git/remote${query}`);
    },

    revert: async (
      commit: string,
      options?: { cwd?: string; noCommit?: boolean; noEdit?: boolean }
    ) => {
      return this.gitClient.post('/api/git/revert', { commit, ...options });
    },

    cherryPick: async (
      commit: string,
      options?: {
        path?: string;
        noCommit?: boolean;
        edit?: boolean;
        signoff?: boolean;
        strategy?: string;
      }
    ) => {
      return this.gitClient.post('/api/git/cherry-pick', { commit, ...options });
    },

    cherryPickAbort: async (options?: { path?: string }) => {
      return this.gitClient.post('/api/git/cherry-pick/abort', options || {});
    },

    cherryPickContinue: async (options?: { path?: string }) => {
      return this.gitClient.post('/api/git/cherry-pick/continue', options || {});
    },

    tag: async (
      name: string,
      options?: {
        path?: string;
        message?: string;
        annotated?: boolean;
        force?: boolean;
        commit?: string;
      }
    ) => {
      return this.gitClient.post('/api/git/tag', { name, ...options });
    },

    deleteTag: async (name: string, options?: { path?: string; remote?: string }) => {
      const params = new URLSearchParams();
      params.set('name', name);
      if (options?.path) {
        params.set('path', options.path);
      }
      if (options?.remote) {
        params.set('remote', options.remote);
      }
      return this.gitClient.delete(`/api/git/tag?${params.toString()}`);
    },

    listTags: async (options?: { path?: string; pattern?: string }) => {
      const params = new URLSearchParams();
      if (options?.path) {
        params.set('path', options.path);
      }
      if (options?.pattern) {
        params.set('pattern', options.pattern);
      }
      const query = params.toString() ? `?${params.toString()}` : '';
      return this.gitClient.get(`/api/git/tags${query}`);
    },

    pushTags: async (options?: { path?: string; remote?: string; tagName?: string }) => {
      return this.gitClient.post('/api/git/tag/push', options || {});
    },

    showTag: async (name: string, options?: { path?: string }) => {
      const params = new URLSearchParams();
      params.set('name', name);
      if (options?.path) {
        params.set('path', options.path);
      }
      return this.gitClient.get(`/api/git/tag/show?${params.toString()}`);
    },

    blame: async (
      file: string,
      options?: { path?: string; startLine?: number; endLine?: number }
    ) => {
      const params = new URLSearchParams();
      params.set('file', file);
      if (options?.path) {
        params.set('path', options.path);
      }
      if (options?.startLine) {
        params.set('startLine', options.startLine.toString());
      }
      if (options?.endLine) {
        params.set('endLine', options.endLine.toString());
      }
      return this.gitClient.get(`/api/git/blame?${params.toString()}`);
    },
  };

  // ==================== File System Operations ====================

  fs = {
    read: async (filePath: string, options?: { basePath?: string; encoding?: string }) => {
      const params = new URLSearchParams();
      params.set('path', filePath);
      if (options?.basePath) {
        params.set('basePath', options.basePath);
      }
      if (options?.encoding) {
        params.set('encoding', options.encoding);
      }
      return this.fsClient.get(`/api/fs/read?${params.toString()}`);
    },

    write: async (
      filePath: string,
      content: string,
      options?: { basePath?: string; encoding?: string; createDirs?: boolean }
    ) => {
      return this.fsClient.post('/api/fs/write', { path: filePath, content, ...options });
    },

    list: async (
      dirPath: string,
      options?: { basePath?: string; recursive?: boolean; pattern?: string }
    ) => {
      const params = new URLSearchParams();
      params.set('path', dirPath);
      if (options?.basePath) {
        params.set('basePath', options.basePath);
      }
      if (options?.recursive) {
        params.set('recursive', 'true');
      }
      if (options?.pattern) {
        params.set('pattern', options.pattern);
      }
      return this.fsClient.get(`/api/fs/list?${params.toString()}`);
    },

    search: async (
      pattern: string,
      options?: { basePath?: string; path?: string; type?: string; maxResults?: number }
    ) => {
      const params = new URLSearchParams();
      params.set('pattern', pattern);
      if (options?.basePath) {
        params.set('basePath', options.basePath);
      }
      if (options?.path) {
        params.set('path', options.path);
      }
      if (options?.type) {
        params.set('type', options.type);
      }
      if (options?.maxResults) {
        params.set('maxResults', options.maxResults.toString());
      }
      return this.fsClient.get(`/api/fs/search?${params.toString()}`);
    },

    delete: async (filePath: string, options?: { basePath?: string; recursive?: boolean }) => {
      return this.fsClient.post('/api/fs/delete', { path: filePath, ...options });
    },

    copy: async (
      source: string,
      destination: string,
      options?: { basePath?: string; overwrite?: boolean }
    ) => {
      return this.fsClient.post('/api/fs/copy', { source, destination, ...options });
    },

    move: async (
      source: string,
      destination: string,
      options?: { basePath?: string; overwrite?: boolean }
    ) => {
      return this.fsClient.post('/api/fs/move', { source, destination, ...options });
    },

    tree: async (
      directory: string,
      options?: { maxDepth?: number; includeHidden?: boolean; includeFiles?: boolean }
    ) => {
      return this.fsClient.post('/api/fs/tree', { directory, ...options });
    },

    mkdir: async (dirPath: string, options?: { basePath?: string; recursive?: boolean }) => {
      return this.fsClient.post('/api/fs/mkdir', { path: dirPath, ...options });
    },

    exists: async (filePath: string, basePath?: string) => {
      const params = new URLSearchParams();
      params.set('path', filePath);
      if (basePath) {
        params.set('basePath', basePath);
      }
      return this.fsClient.get(`/api/fs/exists?${params.toString()}`);
    },

    stat: async (filePath: string, basePath?: string) => {
      const params = new URLSearchParams();
      params.set('path', filePath);
      if (basePath) {
        params.set('basePath', basePath);
      }
      return this.fsClient.get(`/api/fs/stat?${params.toString()}`);
    },
  };

  // ==================== Terraform Operations ====================

  terraform = {
    init: async (
      workingDir?: string,
      options?: { backend?: boolean; upgrade?: boolean; reconfigure?: boolean }
    ) => {
      return this.terraformClient.post('/api/terraform/init', { workingDir, ...options });
    },

    plan: async (options?: {
      workingDir?: string;
      out?: string;
      vars?: Record<string, string>;
      varFiles?: string[];
      target?: string[];
      destroy?: boolean;
    }) => {
      return this.terraformClient.post('/api/terraform/plan', options);
    },

    apply: async (options?: {
      workingDir?: string;
      planFile?: string;
      vars?: Record<string, string>;
      varFiles?: string[];
      target?: string[];
      autoApprove?: boolean;
    }) => {
      return this.terraformClient.post('/api/terraform/apply', options);
    },

    destroy: async (options?: {
      workingDir?: string;
      vars?: Record<string, string>;
      varFiles?: string[];
      target?: string[];
      autoApprove?: boolean;
    }) => {
      return this.terraformClient.post('/api/terraform/destroy', options);
    },

    output: async (workingDir?: string, name?: string) => {
      const params = new URLSearchParams();
      if (workingDir) {
        params.set('workingDir', workingDir);
      }
      if (name) {
        params.set('name', name);
      }
      const query = params.toString() ? `?${params.toString()}` : '';
      return this.terraformClient.get(`/api/terraform/output${query}`);
    },

    show: async (options?: { workingDir?: string; planFile?: string; address?: string }) => {
      const params = new URLSearchParams();
      if (options?.workingDir) {
        params.set('workingDir', options.workingDir);
      }
      if (options?.planFile) {
        params.set('planFile', options.planFile);
      }
      if (options?.address) {
        params.set('address', options.address);
      }
      const query = params.toString() ? `?${params.toString()}` : '';
      return this.terraformClient.get(`/api/terraform/show${query}`);
    },

    validate: async (workingDir?: string) => {
      return this.terraformClient.post('/api/terraform/validate', { workingDir });
    },

    fmt: async (options?: {
      workingDir?: string;
      check?: boolean;
      recursive?: boolean;
      diff?: boolean;
    }) => {
      return this.terraformClient.post('/api/terraform/fmt', options);
    },

    workspace: {
      list: async (workingDir?: string) => {
        const params = new URLSearchParams();
        if (workingDir) {
          params.set('workingDir', workingDir);
        }
        const query = params.toString() ? `?${params.toString()}` : '';
        return this.terraformClient.get(`/api/terraform/workspace/list${query}`);
      },
      select: async (name: string, workingDir?: string) => {
        return this.terraformClient.post('/api/terraform/workspace/select', { name, workingDir });
      },
      new: async (name: string, workingDir?: string) => {
        return this.terraformClient.post('/api/terraform/workspace/new', { name, workingDir });
      },
      delete: async (name: string, workingDir?: string) => {
        return this.terraformClient.post('/api/terraform/workspace/delete', { name, workingDir });
      },
    },

    state: {
      list: async (workingDir?: string) => {
        const params = new URLSearchParams();
        if (workingDir) {
          params.set('workingDir', workingDir);
        }
        const query = params.toString() ? `?${params.toString()}` : '';
        return this.terraformClient.get(`/api/terraform/state/list${query}`);
      },
      show: async (address: string, workingDir?: string) => {
        const params = new URLSearchParams();
        params.set('address', address);
        if (workingDir) {
          params.set('workingDir', workingDir);
        }
        return this.terraformClient.get(`/api/terraform/state/show?${params.toString()}`);
      },
      mv: async (directory: string, source: string, destination: string) => {
        return this.terraformClient.post('/api/terraform/state/mv', {
          directory,
          source,
          destination,
        });
      },
      pull: async (directory: string) => {
        const params = new URLSearchParams();
        params.set('directory', directory);
        return this.terraformClient.get(`/api/terraform/state/pull?${params.toString()}`);
      },
      push: async (directory: string, options?: { stateFile?: string; force?: boolean }) => {
        return this.terraformClient.post('/api/terraform/state/push', { directory, ...options });
      },
    },

    taint: async (directory: string, address: string) => {
      return this.terraformClient.post('/api/terraform/taint', { directory, address });
    },

    untaint: async (directory: string, address: string) => {
      return this.terraformClient.post('/api/terraform/untaint', { directory, address });
    },

    graph: async (directory: string, options?: { type?: 'plan' | 'apply' }) => {
      const params = new URLSearchParams();
      params.set('directory', directory);
      if (options?.type) {
        params.set('type', options.type);
      }
      return this.terraformClient.get(`/api/terraform/graph?${params.toString()}`);
    },

    forceUnlock: async (directory: string, lockId: string) => {
      return this.terraformClient.post('/api/terraform/force-unlock', { directory, lockId });
    },

    refresh: async (directory: string, options?: { varFile?: string }) => {
      return this.terraformClient.post('/api/terraform/refresh', { directory, ...options });
    },
  };

  // ==================== Kubernetes Operations ====================

  k8s = {
    get: async (
      resource: string,
      options?: {
        name?: string;
        namespace?: string;
        selector?: string;
        allNamespaces?: boolean;
        output?: 'json' | 'yaml' | 'wide' | 'name';
        kubeconfig?: string;
        context?: string;
      }
    ) => {
      const params = new URLSearchParams();
      params.set('resource', resource);
      if (options?.name) {
        params.set('name', options.name);
      }
      if (options?.namespace) {
        params.set('namespace', options.namespace);
      }
      if (options?.selector) {
        params.set('selector', options.selector);
      }
      if (options?.allNamespaces) {
        params.set('allNamespaces', 'true');
      }
      if (options?.output) {
        params.set('output', options.output);
      }
      if (options?.kubeconfig) {
        params.set('kubeconfig', options.kubeconfig);
      }
      if (options?.context) {
        params.set('context', options.context);
      }
      return this.k8sClient.get(`/api/k8s/resources?${params.toString()}`);
    },

    apply: async (
      manifest: string,
      options?: {
        namespace?: string;
        dryRun?: boolean;
        force?: boolean;
        serverSide?: boolean;
        kubeconfig?: string;
        context?: string;
      }
    ) => {
      return this.k8sClient.post('/api/k8s/apply', { manifest, ...options });
    },

    delete: async (
      resource: string,
      options?: {
        name?: string;
        namespace?: string;
        selector?: string;
        force?: boolean;
        gracePeriod?: number;
        kubeconfig?: string;
        context?: string;
      }
    ) => {
      return this.k8sClient.post('/api/k8s/delete', { resource, ...options });
    },

    logs: async (
      pod: string,
      options?: {
        namespace?: string;
        container?: string;
        tail?: number;
        previous?: boolean;
        since?: string;
        timestamps?: boolean;
        kubeconfig?: string;
        context?: string;
      }
    ) => {
      const params = new URLSearchParams();
      params.set('pod', pod);
      if (options?.namespace) {
        params.set('namespace', options.namespace);
      }
      if (options?.container) {
        params.set('container', options.container);
      }
      if (options?.tail) {
        params.set('tail', options.tail.toString());
      }
      if (options?.previous) {
        params.set('previous', 'true');
      }
      if (options?.since) {
        params.set('since', options.since);
      }
      if (options?.timestamps) {
        params.set('timestamps', 'true');
      }
      if (options?.kubeconfig) {
        params.set('kubeconfig', options.kubeconfig);
      }
      if (options?.context) {
        params.set('context', options.context);
      }
      return this.k8sClient.get(`/api/k8s/logs?${params.toString()}`);
    },

    exec: async (
      pod: string,
      command: string[],
      options?: { namespace?: string; container?: string; kubeconfig?: string; context?: string }
    ) => {
      return this.k8sClient.post('/api/k8s/exec', { pod, command, ...options });
    },

    describe: async (
      resource: string,
      options?: {
        name?: string;
        namespace?: string;
        selector?: string;
        allNamespaces?: boolean;
        kubeconfig?: string;
        context?: string;
      }
    ) => {
      const params = new URLSearchParams();
      params.set('resource', resource);
      if (options?.name) {
        params.set('name', options.name);
      }
      if (options?.namespace) {
        params.set('namespace', options.namespace);
      }
      if (options?.selector) {
        params.set('selector', options.selector);
      }
      if (options?.allNamespaces) {
        params.set('allNamespaces', 'true');
      }
      if (options?.kubeconfig) {
        params.set('kubeconfig', options.kubeconfig);
      }
      if (options?.context) {
        params.set('context', options.context);
      }
      return this.k8sClient.get(`/api/k8s/describe?${params.toString()}`);
    },

    scale: async (
      resource: string,
      name: string,
      replicas: number,
      options?: { namespace?: string; kubeconfig?: string; context?: string }
    ) => {
      return this.k8sClient.post('/api/k8s/scale', { resource, name, replicas, ...options });
    },

    rollout: async (
      resource: string,
      name: string,
      action: 'status' | 'history' | 'restart' | 'undo' | 'pause' | 'resume',
      options?: { namespace?: string; revision?: number; kubeconfig?: string; context?: string }
    ) => {
      return this.k8sClient.post('/api/k8s/rollout', { resource, name, action, ...options });
    },

    contexts: async (kubeconfig?: string) => {
      const params = new URLSearchParams();
      if (kubeconfig) {
        params.set('kubeconfig', kubeconfig);
      }
      const query = params.toString() ? `?${params.toString()}` : '';
      return this.k8sClient.get(`/api/k8s/contexts${query}`);
    },

    namespaces: async (kubeconfig?: string, context?: string) => {
      const params = new URLSearchParams();
      if (kubeconfig) {
        params.set('kubeconfig', kubeconfig);
      }
      if (context) {
        params.set('context', context);
      }
      const query = params.toString() ? `?${params.toString()}` : '';
      return this.k8sClient.get(`/api/k8s/namespaces${query}`);
    },

    createNamespace: async (name: string, options?: { kubeconfig?: string; context?: string }) => {
      return this.k8sClient.post('/api/k8s/namespace', { name, ...options });
    },

    deleteNamespace: async (name: string, options?: { kubeconfig?: string; context?: string }) => {
      return this.k8sClient.post('/api/k8s/namespace/delete', { name, ...options });
    },

    portForward: async (
      pod: string,
      ports: string,
      options?: { namespace?: string; kubeconfig?: string; context?: string }
    ) => {
      return this.k8sClient.post('/api/k8s/port-forward', { pod, ports, ...options });
    },

    top: async (
      resourceType: 'pods' | 'nodes',
      options?: { namespace?: string; kubeconfig?: string; context?: string }
    ) => {
      const params = new URLSearchParams();
      if (options?.namespace) {
        params.set('namespace', options.namespace);
      }
      if (options?.kubeconfig) {
        params.set('kubeconfig', options.kubeconfig);
      }
      if (options?.context) {
        params.set('context', options.context);
      }
      const query = params.toString() ? `?${params.toString()}` : '';
      return this.k8sClient.get(`/api/k8s/top/${resourceType}${query}`);
    },

    patch: async (
      resource: string,
      name: string,
      patch: string,
      options?: {
        namespace?: string;
        type?: 'strategic' | 'merge' | 'json';
        kubeconfig?: string;
        context?: string;
      }
    ) => {
      return this.k8sClient.post('/api/k8s/patch', { resource, name, patch, ...options });
    },

    label: async (
      resource: string,
      name: string,
      labels: Record<string, string>,
      options?: { namespace?: string; overwrite?: boolean; kubeconfig?: string; context?: string }
    ) => {
      return this.k8sClient.post('/api/k8s/label', { resource, name, labels, ...options });
    },

    annotate: async (
      resource: string,
      name: string,
      annotations: Record<string, string>,
      options?: { namespace?: string; overwrite?: boolean; kubeconfig?: string; context?: string }
    ) => {
      return this.k8sClient.post('/api/k8s/annotate', { resource, name, annotations, ...options });
    },
  };

  // ==================== Helm Operations ====================

  helm = {
    install: async (
      name: string,
      chart: string,
      options?: {
        namespace?: string;
        values?: string;
        valuesFiles?: string[];
        set?: Record<string, string>;
        version?: string;
        createNamespace?: boolean;
        dryRun?: boolean;
        wait?: boolean;
        timeout?: string;
        atomic?: boolean;
        kubeconfig?: string;
        kubeContext?: string;
      }
    ) => {
      return this.helmClient.post('/api/helm/install', { name, chart, ...options });
    },

    upgrade: async (
      name: string,
      chart: string,
      options?: {
        namespace?: string;
        values?: string;
        valuesFiles?: string[];
        set?: Record<string, string>;
        version?: string;
        install?: boolean;
        createNamespace?: boolean;
        dryRun?: boolean;
        wait?: boolean;
        timeout?: string;
        atomic?: boolean;
        reuseValues?: boolean;
        kubeconfig?: string;
        kubeContext?: string;
      }
    ) => {
      return this.helmClient.post('/api/helm/upgrade', { name, chart, ...options });
    },

    uninstall: async (
      name: string,
      options?: {
        namespace?: string;
        keepHistory?: boolean;
        dryRun?: boolean;
        wait?: boolean;
        timeout?: string;
        kubeconfig?: string;
        kubeContext?: string;
      }
    ) => {
      return this.helmClient.post('/api/helm/uninstall', { name, ...options });
    },

    list: async (options?: {
      namespace?: string;
      allNamespaces?: boolean;
      filter?: string;
      maxResults?: number;
      kubeconfig?: string;
      kubeContext?: string;
    }) => {
      const params = new URLSearchParams();
      if (options?.namespace) {
        params.set('namespace', options.namespace);
      }
      if (options?.allNamespaces) {
        params.set('allNamespaces', 'true');
      }
      if (options?.filter) {
        params.set('filter', options.filter);
      }
      if (options?.maxResults) {
        params.set('maxResults', options.maxResults.toString());
      }
      if (options?.kubeconfig) {
        params.set('kubeconfig', options.kubeconfig);
      }
      if (options?.kubeContext) {
        params.set('kubeContext', options.kubeContext);
      }
      const query = params.toString() ? `?${params.toString()}` : '';
      return this.helmClient.get(`/api/helm/list${query}`);
    },

    rollback: async (
      name: string,
      revision: number,
      options?: {
        namespace?: string;
        dryRun?: boolean;
        wait?: boolean;
        timeout?: string;
        force?: boolean;
        kubeconfig?: string;
        kubeContext?: string;
      }
    ) => {
      return this.helmClient.post('/api/helm/rollback', { name, revision, ...options });
    },

    getValues: async (
      name: string,
      options?: {
        namespace?: string;
        allValues?: boolean;
        revision?: number;
        kubeconfig?: string;
        kubeContext?: string;
      }
    ) => {
      const params = new URLSearchParams();
      params.set('name', name);
      if (options?.namespace) {
        params.set('namespace', options.namespace);
      }
      if (options?.allValues) {
        params.set('allValues', 'true');
      }
      if (options?.revision) {
        params.set('revision', options.revision.toString());
      }
      if (options?.kubeconfig) {
        params.set('kubeconfig', options.kubeconfig);
      }
      if (options?.kubeContext) {
        params.set('kubeContext', options.kubeContext);
      }
      return this.helmClient.get(`/api/helm/values?${params.toString()}`);
    },

    history: async (
      name: string,
      options?: {
        namespace?: string;
        maxResults?: number;
        kubeconfig?: string;
        kubeContext?: string;
      }
    ) => {
      const params = new URLSearchParams();
      params.set('name', name);
      if (options?.namespace) {
        params.set('namespace', options.namespace);
      }
      if (options?.maxResults) {
        params.set('maxResults', options.maxResults.toString());
      }
      if (options?.kubeconfig) {
        params.set('kubeconfig', options.kubeconfig);
      }
      if (options?.kubeContext) {
        params.set('kubeContext', options.kubeContext);
      }
      return this.helmClient.get(`/api/helm/history?${params.toString()}`);
    },

    repo: {
      add: async (
        name: string,
        url: string,
        options?: {
          username?: string;
          password?: string;
          kubeconfig?: string;
          kubeContext?: string;
        }
      ) => {
        return this.helmClient.post('/api/helm/repo', { action: 'add', name, url, ...options });
      },
      remove: async (name: string) => {
        return this.helmClient.post('/api/helm/repo', { action: 'remove', name });
      },
      list: async () => {
        return this.helmClient.post('/api/helm/repo', { action: 'list' });
      },
      update: async () => {
        return this.helmClient.post('/api/helm/repo', { action: 'update' });
      },
    },

    search: async (
      keyword: string,
      options?: {
        version?: string;
        versions?: boolean;
        hub?: boolean;
        maxResults?: number;
        kubeconfig?: string;
        kubeContext?: string;
      }
    ) => {
      const params = new URLSearchParams();
      params.set('keyword', keyword);
      if (options?.version) {
        params.set('version', options.version);
      }
      if (options?.versions) {
        params.set('versions', 'true');
      }
      if (options?.hub) {
        params.set('hub', 'true');
      }
      if (options?.maxResults) {
        params.set('maxResults', options.maxResults.toString());
      }
      if (options?.kubeconfig) {
        params.set('kubeconfig', options.kubeconfig);
      }
      if (options?.kubeContext) {
        params.set('kubeContext', options.kubeContext);
      }
      return this.helmClient.get(`/api/helm/search?${params.toString()}`);
    },

    template: async (
      name: string,
      chart: string,
      options?: {
        namespace?: string;
        values?: string;
        valuesFiles?: string[];
        set?: Record<string, string>;
        version?: string;
        kubeconfig?: string;
        kubeContext?: string;
      }
    ) => {
      return this.helmClient.post('/api/helm/template', { name, chart, ...options });
    },

    show: async (
      chart: string,
      options?: { subcommand?: 'all' | 'chart' | 'readme' | 'values' | 'crds'; version?: string }
    ) => {
      const params = new URLSearchParams();
      params.set('chart', chart);
      if (options?.subcommand) {
        params.set('subcommand', options.subcommand);
      }
      if (options?.version) {
        params.set('version', options.version);
      }
      return this.helmClient.get(`/api/helm/show?${params.toString()}`);
    },

    lint: async (
      chartPath: string,
      options?: { strict?: boolean; valuesFiles?: string[]; namespace?: string }
    ) => {
      return this.helmClient.post('/api/helm/lint', { chartPath, ...options });
    },
  };

  // ==================== GitHub Operations ====================

  github = {
    /**
     * Set authorization token for GitHub API requests
     */
    setToken: (token: string) => {
      this.githubClient = new RestClient(ServiceURLs.GITHUB_TOOLS, {
        headers: { Authorization: `Bearer ${token}` },
      });
    },

    // Pull Request Operations
    prs: {
      list: async (
        owner: string,
        repo: string,
        options?: { state?: 'open' | 'closed' | 'all'; perPage?: number }
      ) => {
        const params = new URLSearchParams();
        params.set('owner', owner);
        params.set('repo', repo);
        if (options?.state) {
          params.set('state', options.state);
        }
        if (options?.perPage) {
          params.set('per_page', options.perPage.toString());
        }
        return this.githubClient.get(`/api/github/prs?${params.toString()}`);
      },

      get: async (owner: string, repo: string, prNumber: number) => {
        const params = new URLSearchParams();
        params.set('owner', owner);
        params.set('repo', repo);
        return this.githubClient.get(`/api/github/prs/${prNumber}?${params.toString()}`);
      },

      create: async (
        owner: string,
        repo: string,
        params: { title: string; head: string; base: string; body?: string; draft?: boolean }
      ) => {
        return this.githubClient.post('/api/github/prs', { owner, repo, ...params });
      },

      merge: async (
        owner: string,
        repo: string,
        prNumber: number,
        options?: {
          commitTitle?: string;
          commitMessage?: string;
          mergeMethod?: 'merge' | 'squash' | 'rebase';
        }
      ) => {
        return this.githubClient.post(`/api/github/prs/${prNumber}/merge`, {
          owner,
          repo,
          commit_title: options?.commitTitle,
          commit_message: options?.commitMessage,
          merge_method: options?.mergeMethod,
        });
      },
    },

    // Issue Operations
    issues: {
      list: async (
        owner: string,
        repo: string,
        options?: { state?: 'open' | 'closed' | 'all'; perPage?: number }
      ) => {
        const params = new URLSearchParams();
        params.set('owner', owner);
        params.set('repo', repo);
        if (options?.state) {
          params.set('state', options.state);
        }
        if (options?.perPage) {
          params.set('per_page', options.perPage.toString());
        }
        return this.githubClient.get(`/api/github/issues?${params.toString()}`);
      },

      get: async (owner: string, repo: string, issueNumber: number) => {
        const params = new URLSearchParams();
        params.set('owner', owner);
        params.set('repo', repo);
        return this.githubClient.get(`/api/github/issues/${issueNumber}?${params.toString()}`);
      },

      create: async (
        owner: string,
        repo: string,
        params: { title: string; body?: string; labels?: string[]; assignees?: string[] }
      ) => {
        return this.githubClient.post('/api/github/issues', { owner, repo, ...params });
      },

      close: async (owner: string, repo: string, issueNumber: number) => {
        const params = new URLSearchParams();
        params.set('owner', owner);
        params.set('repo', repo);
        return this.githubClient.put(
          `/api/github/issues/${issueNumber}/close?${params.toString()}`,
          {}
        );
      },

      addComment: async (owner: string, repo: string, issueNumber: number, body: string) => {
        return this.githubClient.post(`/api/github/issues/${issueNumber}/comments`, {
          owner,
          repo,
          body,
        });
      },
    },

    // Repository Operations
    repos: {
      get: async (owner: string, repo: string) => {
        const params = new URLSearchParams();
        params.set('owner', owner);
        params.set('repo', repo);
        return this.githubClient.get(`/api/github/repos?${params.toString()}`);
      },

      listBranches: async (owner: string, repo: string, options?: { perPage?: number }) => {
        const params = new URLSearchParams();
        params.set('owner', owner);
        params.set('repo', repo);
        if (options?.perPage) {
          params.set('per_page', options.perPage.toString());
        }
        return this.githubClient.get(`/api/github/repos/branches?${params.toString()}`);
      },

      createBranch: async (owner: string, repo: string, branch: string, sha: string) => {
        return this.githubClient.post('/api/github/repos/branches', { owner, repo, branch, sha });
      },

      deleteBranch: async (owner: string, repo: string, branch: string) => {
        const params = new URLSearchParams();
        params.set('owner', owner);
        params.set('repo', repo);
        params.set('branch', branch);
        return this.githubClient.delete(`/api/github/repos/branches?${params.toString()}`);
      },
    },

    // User Operations
    user: {
      get: async () => {
        return this.githubClient.get('/api/github/user');
      },
    },
  };

  // ==================== AWS Operations ====================

  aws = {
    ec2: {
      listInstances: async (options?: {
        instanceIds?: string[];
        maxResults?: number;
        nextToken?: string;
        region?: string;
      }) => {
        const params = new URLSearchParams();
        if (options?.instanceIds) {
          params.set('instanceIds', options.instanceIds.join(','));
        }
        if (options?.maxResults) {
          params.set('maxResults', options.maxResults.toString());
        }
        if (options?.nextToken) {
          params.set('nextToken', options.nextToken);
        }
        if (options?.region) {
          params.set('region', options.region);
        }
        const query = params.toString() ? `?${params.toString()}` : '';
        return this.awsClient.get(`/api/aws/ec2/instances${query}`);
      },

      startInstances: async (instanceIds: string[], region?: string) => {
        return this.awsClient.post('/api/aws/ec2/instances/start', { instanceIds, region });
      },

      stopInstances: async (
        instanceIds: string[],
        options?: { force?: boolean; region?: string }
      ) => {
        return this.awsClient.post('/api/aws/ec2/instances/stop', { instanceIds, ...options });
      },

      rebootInstances: async (instanceIds: string[], region?: string) => {
        return this.awsClient.post('/api/aws/ec2/instances/reboot', { instanceIds, region });
      },

      terminateInstances: async (instanceIds: string[], region?: string) => {
        return this.awsClient.post('/api/aws/ec2/instances/terminate', { instanceIds, region });
      },

      runInstances: async (
        imageId: string,
        instanceType: string,
        options?: {
          minCount?: number;
          maxCount?: number;
          keyName?: string;
          securityGroupIds?: string[];
          subnetId?: string;
          userData?: string;
          tags?: Record<string, string>;
          region?: string;
        }
      ) => {
        return this.awsClient.post('/api/aws/ec2/instances/run', {
          imageId,
          instanceType,
          ...options,
        });
      },

      listRegions: async (region?: string) => {
        const query = region ? `?region=${encodeURIComponent(region)}` : '';
        return this.awsClient.get(`/api/aws/ec2/regions${query}`);
      },

      listVpcs: async (region?: string) => {
        const query = region ? `?region=${encodeURIComponent(region)}` : '';
        return this.awsClient.get(`/api/aws/ec2/vpcs${query}`);
      },

      listSubnets: async (options?: { vpcId?: string; region?: string }) => {
        const params = new URLSearchParams();
        if (options?.vpcId) {
          params.set('vpcId', options.vpcId);
        }
        if (options?.region) {
          params.set('region', options.region);
        }
        const query = params.toString() ? `?${params.toString()}` : '';
        return this.awsClient.get(`/api/aws/ec2/subnets${query}`);
      },

      listSecurityGroups: async (options?: { vpcId?: string; region?: string }) => {
        const params = new URLSearchParams();
        if (options?.vpcId) {
          params.set('vpcId', options.vpcId);
        }
        if (options?.region) {
          params.set('region', options.region);
        }
        const query = params.toString() ? `?${params.toString()}` : '';
        return this.awsClient.get(`/api/aws/ec2/security-groups${query}`);
      },
    },

    s3: {
      listBuckets: async (region?: string) => {
        const query = region ? `?region=${encodeURIComponent(region)}` : '';
        return this.awsClient.get(`/api/aws/s3/buckets${query}`);
      },

      listObjects: async (
        bucket: string,
        options?: {
          prefix?: string;
          delimiter?: string;
          maxKeys?: number;
          continuationToken?: string;
          region?: string;
        }
      ) => {
        const params = new URLSearchParams();
        params.set('bucket', bucket);
        if (options?.prefix) {
          params.set('prefix', options.prefix);
        }
        if (options?.delimiter) {
          params.set('delimiter', options.delimiter);
        }
        if (options?.maxKeys) {
          params.set('maxKeys', options.maxKeys.toString());
        }
        if (options?.continuationToken) {
          params.set('continuationToken', options.continuationToken);
        }
        if (options?.region) {
          params.set('region', options.region);
        }
        return this.awsClient.get(`/api/aws/s3/objects?${params.toString()}`);
      },

      getObject: async (bucket: string, key: string, region?: string) => {
        const params = new URLSearchParams();
        params.set('bucket', bucket);
        params.set('key', key);
        if (region) {
          params.set('region', region);
        }
        return this.awsClient.get(`/api/aws/s3/object?${params.toString()}`);
      },

      putObject: async (
        bucket: string,
        key: string,
        body: string,
        options?: {
          contentType?: string;
          metadata?: Record<string, string>;
          tags?: Record<string, string>;
          region?: string;
        }
      ) => {
        return this.awsClient.post('/api/aws/s3/object', { bucket, key, body, ...options });
      },

      deleteObject: async (bucket: string, key: string, region?: string) => {
        const params = new URLSearchParams();
        params.set('bucket', bucket);
        params.set('key', key);
        if (region) {
          params.set('region', region);
        }
        return this.awsClient.delete(`/api/aws/s3/object?${params.toString()}`);
      },

      createBucket: async (bucket: string, region?: string) => {
        return this.awsClient.post('/api/aws/s3/bucket', { bucket, region });
      },

      deleteBucket: async (bucket: string, region?: string) => {
        const params = new URLSearchParams();
        params.set('bucket', bucket);
        if (region) {
          params.set('region', region);
        }
        return this.awsClient.delete(`/api/aws/s3/bucket?${params.toString()}`);
      },
    },

    iam: {
      listUsers: async (options?: {
        maxItems?: number;
        marker?: string;
        pathPrefix?: string;
        region?: string;
      }) => {
        const params = new URLSearchParams();
        if (options?.maxItems) {
          params.set('maxItems', options.maxItems.toString());
        }
        if (options?.marker) {
          params.set('marker', options.marker);
        }
        if (options?.pathPrefix) {
          params.set('pathPrefix', options.pathPrefix);
        }
        if (options?.region) {
          params.set('region', options.region);
        }
        const query = params.toString() ? `?${params.toString()}` : '';
        return this.awsClient.get(`/api/aws/iam/users${query}`);
      },

      getUser: async (userName: string, region?: string) => {
        const params = new URLSearchParams();
        params.set('userName', userName);
        if (region) {
          params.set('region', region);
        }
        return this.awsClient.get(`/api/aws/iam/user?${params.toString()}`);
      },

      createUser: async (
        userName: string,
        options?: { path?: string; tags?: Record<string, string>; region?: string }
      ) => {
        return this.awsClient.post('/api/aws/iam/user', { userName, ...options });
      },

      deleteUser: async (userName: string, region?: string) => {
        const params = new URLSearchParams();
        params.set('userName', userName);
        if (region) {
          params.set('region', region);
        }
        return this.awsClient.delete(`/api/aws/iam/user?${params.toString()}`);
      },

      listRoles: async (options?: {
        maxItems?: number;
        marker?: string;
        pathPrefix?: string;
        region?: string;
      }) => {
        const params = new URLSearchParams();
        if (options?.maxItems) {
          params.set('maxItems', options.maxItems.toString());
        }
        if (options?.marker) {
          params.set('marker', options.marker);
        }
        if (options?.pathPrefix) {
          params.set('pathPrefix', options.pathPrefix);
        }
        if (options?.region) {
          params.set('region', options.region);
        }
        const query = params.toString() ? `?${params.toString()}` : '';
        return this.awsClient.get(`/api/aws/iam/roles${query}`);
      },

      getRole: async (roleName: string, region?: string) => {
        const params = new URLSearchParams();
        params.set('roleName', roleName);
        if (region) {
          params.set('region', region);
        }
        return this.awsClient.get(`/api/aws/iam/role?${params.toString()}`);
      },

      listPolicies: async (options?: {
        maxItems?: number;
        marker?: string;
        scope?: 'All' | 'AWS' | 'Local';
        onlyAttached?: boolean;
        region?: string;
      }) => {
        const params = new URLSearchParams();
        if (options?.maxItems) {
          params.set('maxItems', options.maxItems.toString());
        }
        if (options?.marker) {
          params.set('marker', options.marker);
        }
        if (options?.scope) {
          params.set('scope', options.scope);
        }
        if (options?.onlyAttached) {
          params.set('onlyAttached', 'true');
        }
        if (options?.region) {
          params.set('region', options.region);
        }
        const query = params.toString() ? `?${params.toString()}` : '';
        return this.awsClient.get(`/api/aws/iam/policies${query}`);
      },

      listGroups: async (options?: {
        maxItems?: number;
        marker?: string;
        pathPrefix?: string;
        region?: string;
      }) => {
        const params = new URLSearchParams();
        if (options?.maxItems) {
          params.set('maxItems', options.maxItems.toString());
        }
        if (options?.marker) {
          params.set('marker', options.marker);
        }
        if (options?.pathPrefix) {
          params.set('pathPrefix', options.pathPrefix);
        }
        if (options?.region) {
          params.set('region', options.region);
        }
        const query = params.toString() ? `?${params.toString()}` : '';
        return this.awsClient.get(`/api/aws/iam/groups${query}`);
      },
    },
  };

  // ==================== GCP Operations ====================

  gcp = {
    compute: {
      listInstances: async (options?: {
        project?: string;
        zone?: string;
        maxResults?: number;
        pageToken?: string;
      }) => {
        const params = new URLSearchParams();
        if (options?.project) {
          params.set('project', options.project);
        }
        if (options?.zone) {
          params.set('zone', options.zone);
        }
        if (options?.maxResults) {
          params.set('maxResults', options.maxResults.toString());
        }
        if (options?.pageToken) {
          params.set('pageToken', options.pageToken);
        }
        const query = params.toString() ? `?${params.toString()}` : '';
        return this.gcpClient.get(`/api/gcp/compute/instances${query}`);
      },

      startInstance: async (instance: string, options?: { project?: string; zone?: string }) => {
        return this.gcpClient.post('/api/gcp/compute/instances/start', { instance, ...options });
      },

      stopInstance: async (instance: string, options?: { project?: string; zone?: string }) => {
        return this.gcpClient.post('/api/gcp/compute/instances/stop', { instance, ...options });
      },
    },

    storage: {
      listBuckets: async (options?: {
        project?: string;
        maxResults?: number;
        pageToken?: string;
      }) => {
        const params = new URLSearchParams();
        if (options?.project) {
          params.set('project', options.project);
        }
        if (options?.maxResults) {
          params.set('maxResults', options.maxResults.toString());
        }
        if (options?.pageToken) {
          params.set('pageToken', options.pageToken);
        }
        const query = params.toString() ? `?${params.toString()}` : '';
        return this.gcpClient.get(`/api/gcp/storage/buckets${query}`);
      },
    },

    gke: {
      listClusters: async (options?: { project?: string; zone?: string }) => {
        const params = new URLSearchParams();
        if (options?.project) {
          params.set('project', options.project);
        }
        if (options?.zone) {
          params.set('zone', options.zone);
        }
        const query = params.toString() ? `?${params.toString()}` : '';
        return this.gcpClient.get(`/api/gcp/gke/clusters${query}`);
      },
    },

    iam: {
      listServiceAccounts: async (options?: {
        project?: string;
        maxResults?: number;
        pageToken?: string;
      }) => {
        const params = new URLSearchParams();
        if (options?.project) {
          params.set('project', options.project);
        }
        if (options?.maxResults) {
          params.set('maxResults', options.maxResults.toString());
        }
        if (options?.pageToken) {
          params.set('pageToken', options.pageToken);
        }
        const query = params.toString() ? `?${params.toString()}` : '';
        return this.gcpClient.get(`/api/gcp/iam/service-accounts${query}`);
      },

      listRoles: async (options?: {
        project?: string;
        maxResults?: number;
        pageToken?: string;
      }) => {
        const params = new URLSearchParams();
        if (options?.project) {
          params.set('project', options.project);
        }
        if (options?.maxResults) {
          params.set('maxResults', options.maxResults.toString());
        }
        if (options?.pageToken) {
          params.set('pageToken', options.pageToken);
        }
        const query = params.toString() ? `?${params.toString()}` : '';
        return this.gcpClient.get(`/api/gcp/iam/roles${query}`);
      },
    },

    discover: {
      startDiscovery: async (options?: { project?: string; regions?: string[] }) => {
        return this.gcpClient.post('/api/gcp/discover/start', options);
      },

      getSession: async (sessionId: string) => {
        return this.gcpClient.get(`/api/gcp/discover/session/${sessionId}`);
      },
    },

    terraform: {
      generate: async (options?: {
        project?: string;
        resources?: string[];
        outputDir?: string;
      }) => {
        return this.gcpClient.post('/api/gcp/terraform/generate', options);
      },
    },
  };

  // ==================== Azure Operations ====================

  azure = {
    compute: {
      listVMs: async (options?: {
        subscriptionId?: string;
        resourceGroup?: string;
        maxResults?: number;
      }) => {
        const params = new URLSearchParams();
        if (options?.subscriptionId) {
          params.set('subscriptionId', options.subscriptionId);
        }
        if (options?.resourceGroup) {
          params.set('resourceGroup', options.resourceGroup);
        }
        if (options?.maxResults) {
          params.set('maxResults', options.maxResults.toString());
        }
        const query = params.toString() ? `?${params.toString()}` : '';
        return this.azureClient.get(`/api/azure/compute/vms${query}`);
      },

      startVM: async (
        vmName: string,
        options?: { subscriptionId?: string; resourceGroup?: string }
      ) => {
        return this.azureClient.post('/api/azure/compute/vms/start', { vmName, ...options });
      },

      stopVM: async (
        vmName: string,
        options?: { subscriptionId?: string; resourceGroup?: string; deallocate?: boolean }
      ) => {
        return this.azureClient.post('/api/azure/compute/vms/stop', { vmName, ...options });
      },
    },

    storage: {
      listAccounts: async (options?: { subscriptionId?: string; resourceGroup?: string }) => {
        const params = new URLSearchParams();
        if (options?.subscriptionId) {
          params.set('subscriptionId', options.subscriptionId);
        }
        if (options?.resourceGroup) {
          params.set('resourceGroup', options.resourceGroup);
        }
        const query = params.toString() ? `?${params.toString()}` : '';
        return this.azureClient.get(`/api/azure/storage/accounts${query}`);
      },
    },

    aks: {
      listClusters: async (options?: { subscriptionId?: string; resourceGroup?: string }) => {
        const params = new URLSearchParams();
        if (options?.subscriptionId) {
          params.set('subscriptionId', options.subscriptionId);
        }
        if (options?.resourceGroup) {
          params.set('resourceGroup', options.resourceGroup);
        }
        const query = params.toString() ? `?${params.toString()}` : '';
        return this.azureClient.get(`/api/azure/aks/clusters${query}`);
      },
    },

    iam: {
      listRoleAssignments: async (options?: {
        subscriptionId?: string;
        resourceGroup?: string;
        scope?: string;
      }) => {
        const params = new URLSearchParams();
        if (options?.subscriptionId) {
          params.set('subscriptionId', options.subscriptionId);
        }
        if (options?.resourceGroup) {
          params.set('resourceGroup', options.resourceGroup);
        }
        if (options?.scope) {
          params.set('scope', options.scope);
        }
        const query = params.toString() ? `?${params.toString()}` : '';
        return this.azureClient.get(`/api/azure/iam/role-assignments${query}`);
      },
    },

    discover: {
      startDiscovery: async (options?: { subscriptionId?: string; resourceGroups?: string[] }) => {
        return this.azureClient.post('/api/azure/discover/start', options);
      },

      getSession: async (sessionId: string) => {
        return this.azureClient.get(`/api/azure/discover/session/${sessionId}`);
      },
    },

    terraform: {
      generate: async (options?: {
        subscriptionId?: string;
        resources?: string[];
        outputDir?: string;
      }) => {
        return this.azureClient.post('/api/azure/terraform/generate', options);
      },
    },
  };

  // ==================== Health Checks ====================

  /**
   * Check health of all tool services
   */
  async healthCheck(): Promise<Record<string, boolean>> {
    const [git, fs, terraform, k8s, helm, aws, github, gcp, azure] = await Promise.all([
      this.gitClient.healthCheck(),
      this.fsClient.healthCheck(),
      this.terraformClient.healthCheck(),
      this.k8sClient.healthCheck(),
      this.helmClient.healthCheck(),
      this.awsClient.healthCheck(),
      this.githubClient.healthCheck(),
      this.gcpClient.healthCheck(),
      this.azureClient.healthCheck(),
    ]);

    return { git, fs, terraform, k8s, helm, aws, github, gcp, azure };
  }

  /**
   * Check health of a specific service
   */
  async healthCheckService(
    service: 'git' | 'fs' | 'terraform' | 'k8s' | 'helm' | 'aws' | 'github' | 'gcp' | 'azure'
  ): Promise<boolean> {
    const clients: Record<string, RestClient> = {
      git: this.gitClient,
      fs: this.fsClient,
      terraform: this.terraformClient,
      k8s: this.k8sClient,
      helm: this.helmClient,
      aws: this.awsClient,
      github: this.githubClient,
      gcp: this.gcpClient,
      azure: this.azureClient,
    };

    return clients[service].healthCheck();
  }
}
