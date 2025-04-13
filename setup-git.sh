#!/bin/bash

# Exit on error
set -e

# Detect if running in dev container
if [ -f /.dockerenv ] || [ -d /.devcontainer ]; then
    IS_DEV_CONTAINER=true
    echo "Detected dev container environment"
else
    IS_DEV_CONTAINER=false
    echo "Detected local environment"
fi

echo "Setting up Git with GitHub CLI..."

# Check if GitHub CLI is installed
if ! command -v gh &> /dev/null; then
    echo "GitHub CLI not found. Installing..."
    if [ "$IS_DEV_CONTAINER" = true ]; then
        # Dev container installation (no sudo needed)
        curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null
        apt update
        apt install gh -y
    else
        # Local environment installation (requires sudo)
        curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
        sudo apt update
        sudo apt install gh -y
    fi
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

# Configure Git user information
echo "Configuring Git user information..."
read -p "Enter your Git username: " GIT_USERNAME
read -p "Enter your Git email: " GIT_EMAIL

git config --global user.name "$GIT_USERNAME"
git config --global user.email "$GIT_EMAIL"

echo "Git user configured as: $GIT_USERNAME <$GIT_EMAIL>"

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
echo "You can now use Git commands."