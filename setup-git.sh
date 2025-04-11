#!/bin/bash

# Exit on error
set -e

echo "Setting up Git with GitHub CLI in dev container..."

# Check if GitHub CLI is installed
if ! command -v gh &> /dev/null; then
    echo "GitHub CLI not found. Installing..."
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null
    apt update
    apt install gh -y
    echo "GitHub CLI installed successfully."
else
    echo "GitHub CLI is already installed."
fi

# Check if already authenticated
if gh auth status &> /dev/null; then
    echo "Already authenticated with GitHub."
else
    echo "Authenticating with GitHub..."
    # Note: This is an interactive process that requires user input
    # The script will pause here until authentication is complete
    gh auth login
fi

# Configure Git to use GitHub CLI for authentication
echo "Configuring Git to use GitHub CLI for authentication..."
git config --global credential.helper '!gh auth git-credential'

# Set default pull strategy
echo "Setting default pull strategy to merge..."
git config --global pull.rebase false

# Verify the setup
echo "Verifying Git setup..."
git pull

echo "Git setup completed successfully!"
echo "You can now use Git commands in your dev container." 