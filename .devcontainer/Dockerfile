FROM oven/bun:debian

# Config Bun
ENV PATH="~/.bun/bin:${PATH}"
RUN ln -s /usr/local/bin/bun /usr/local/bin/node

# Update packages
RUN if [ "debian" == "alpine" ] ; then apk update ; else apt-get update ; fi

# Install Node.js and npm for packageManager field support (npm@10.8.1)
# Note: package.json specifies packageManager: "npm@10.8.1" which requires Corepack
RUN if [ "debian" == "alpine" ] ; then \
      apk add --no-cache nodejs npm corepack && \
      corepack enable ; \
    else \
      curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
      apt-get install -y nodejs && \
      npm install -g corepack@latest && \
      corepack enable ; \
    fi

# Install Git
RUN if [ "debian" == "alpine" ] ; then apk add git ; else apt-get install -y git ; fi

# Install Github CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null && apt update && apt install gh -y
