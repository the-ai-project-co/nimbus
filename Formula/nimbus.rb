class Nimbus < Formula
  desc "AI-powered cloud infrastructure management CLI"
  homepage "https://github.com/the-ai-project-co/nimbus"
  version "0.2.0"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/the-ai-project-co/nimbus/releases/download/v0.2.0/nimbus-darwin-arm64.tar.gz"
      sha256 "PLACEHOLDER_DARWIN_ARM64_BUILD_REQUIRED"
    else
      url "https://github.com/the-ai-project-co/nimbus/releases/download/v0.2.0/nimbus-darwin-x64.tar.gz"
      sha256 "PLACEHOLDER_DARWIN_X64_BUILD_REQUIRED"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/the-ai-project-co/nimbus/releases/download/v0.2.0/nimbus-linux-arm64.tar.gz"
      sha256 "PLACEHOLDER_LINUX_ARM64_BUILD_REQUIRED"
    else
      url "https://github.com/the-ai-project-co/nimbus/releases/download/v0.2.0/nimbus-linux-x64.tar.gz"
      sha256 "PLACEHOLDER_LINUX_X64_BUILD_REQUIRED"
    end
  end

  def install
    bin.install "nimbus"
  end

  def caveats
    <<~EOS
      To get started with Nimbus:

        # Just run nimbus — first-run wizard will guide you
        nimbus

        # Or set an API key directly
        export ANTHROPIC_API_KEY=sk-ant-...

      Optional cloud CLI tools for full functionality:
        - Terraform:     brew install hashicorp/tap/terraform
        - kubectl:       brew install kubernetes-cli
        - Helm:          brew install helm
        - AWS CLI:       brew install awscli

      Documentation: https://github.com/the-ai-project-co/nimbus#readme
    EOS
  end

  test do
    assert_match "nimbus", shell_output("#{bin}/nimbus --version")
  end
end
