# Dev Container Dockerfile
# Extends the base .NET 10 devcontainer image and removes the problematic Yarn apt repository
# which has an expired GPG signing key (62D54FD4003F6525).

FROM mcr.microsoft.com/devcontainers/dotnet:1-10.0

# Remove the expired Yarn repository to prevent apt update failures during feature installation.
# The Yarn classic repository at dl.yarnpkg.com uses an expired GPG key.
# Yarn can still be installed via npm (npm install -g yarn) or corepack if needed.
RUN rm -f /etc/apt/sources.list.d/yarn.list \
    && rm -f /etc/apt/keyrings/yarn.gpg \
    && apt-get update \
    && rm -rf /var/lib/apt/lists/*
