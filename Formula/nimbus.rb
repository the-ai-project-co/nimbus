class Nimbus < Formula
  desc "AI-powered cloud infrastructure management CLI"
  homepage "https://github.com/the-ai-project-co/nimbus"
  version "1.0.0"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/the-ai-project-co/nimbus/releases/download/v1.0.0/nimbus-darwin-arm64.tar.gz"
      sha256 "PLACEHOLDER_SHA256_DARWIN_ARM64"
    else
      url "https://github.com/the-ai-project-co/nimbus/releases/download/v1.0.0/nimbus-darwin-x64.tar.gz"
      sha256 "PLACEHOLDER_SHA256_DARWIN_X64"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/the-ai-project-co/nimbus/releases/download/v1.0.0/nimbus-linux-arm64.tar.gz"
      sha256 "PLACEHOLDER_SHA256_LINUX_ARM64"
    else
      url "https://github.com/the-ai-project-co/nimbus/releases/download/v1.0.0/nimbus-linux-x64.tar.gz"
      sha256 "PLACEHOLDER_SHA256_LINUX_X64"
    end
  end

  def install
    bin.install "nimbus"
  end

  test do
    assert_match "nimbus", shell_output("#{bin}/nimbus --version")
  end
end
