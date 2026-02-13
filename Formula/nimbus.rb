# frozen_string_literal: true

# Homebrew formula for Nimbus CLI
# AI-powered infrastructure assistant
#
# Installation:
#   brew tap the-ai-project-co/nimbus
#   brew install nimbus
#
# Or directly:
#   brew install the-ai-project-co/nimbus/nimbus

class Nimbus < Formula
  desc "AI-powered infrastructure assistant for Terraform, Kubernetes, and Helm"
  homepage "https://github.com/the-ai-project-co/nimbus"
  # URL and SHA256 are updated automatically by scripts/update-formula.sh during release
  url "https://github.com/the-ai-project-co/nimbus/archive/refs/tags/v#{version}.tar.gz"
  sha256 "PLACEHOLDER_SHA256_UPDATED_BY_RELEASE_SCRIPT"
  license "MIT"
  head "https://github.com/the-ai-project-co/nimbus.git", branch: "main"

  # Bottle configuration for pre-built binaries
  # bottle do
  #   sha256 cellar: :any_skip_relocation, arm64_sonoma: "PLACEHOLDER"
  #   sha256 cellar: :any_skip_relocation, arm64_ventura: "PLACEHOLDER"
  #   sha256 cellar: :any_skip_relocation, sonoma: "PLACEHOLDER"
  #   sha256 cellar: :any_skip_relocation, ventura: "PLACEHOLDER"
  #   sha256 cellar: :any_skip_relocation, x86_64_linux: "PLACEHOLDER"
  # end

  depends_on "node@20" => :build

  # Optional dependencies for full functionality
  uses_from_macos "curl"

  def install
    # Install Bun for building if not available
    system "npm", "install", "-g", "bun" unless which("bun")

    # Install dependencies
    system "bun", "install", "--frozen-lockfile"

    # Build the CLI
    cd "services/cli-service" do
      system "bun", "run", "build:node"
    end

    # Install the CLI binary
    libexec.install Dir["services/cli-service/dist/*"]
    libexec.install Dir["node_modules"]

    # Create wrapper script
    (bin/"nimbus").write <<~EOS
      #!/bin/bash
      exec "#{Formula["node@20"].opt_bin}/node" "#{libexec}/index.js" "$@"
    EOS

    # Generate shell completions
    generate_completions_from_executable(bin/"nimbus", "completion")
  end

  def post_install
    # Create config directory
    (var/"nimbus").mkpath
  end

  def caveats
    <<~EOS
      Nimbus has been installed!

      To get started:
        nimbus --help
        nimbus init
        nimbus doctor

      Configuration:
        nimbus config set llm.apiKey YOUR_API_KEY

      Documentation:
        https://github.com/the-ai-project-co/nimbus/docs

      For full functionality, ensure you have:
        - Terraform (brew install terraform)
        - kubectl (brew install kubernetes-cli)
        - Helm (brew install helm)
        - AWS CLI (brew install awscli)
    EOS
  end

  test do
    # Test basic command
    assert_match "nimbus", shell_output("#{bin}/nimbus --version")

    # Test help command
    assert_match "Commands:", shell_output("#{bin}/nimbus --help")

    # Test doctor command (should work without full setup)
    output = shell_output("#{bin}/nimbus doctor --json", 0)
    assert_match "passed", output
  end
end
