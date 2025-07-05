#!/bin/bash

# LinuxServer.io style entrypoint for dynamic user permissions
# Based on s6-overlay approach but simplified for our use case

set -e

# Default values
PUID=${PUID:-1000}
PGID=${PGID:-1000}

echo "-------------------------------------"
echo "User uid:    $(id -u)"
echo "User gid:    $(id -g)"
echo "-------------------------------------"
echo "Setting user to PUID: $PUID"
echo "Setting group to PGID: $PGID"
echo "-------------------------------------"

# Create group if it doesn't exist
if ! getent group $PGID > /dev/null 2>&1; then
    echo "Creating group with GID: $PGID"
    groupadd -g $PGID miauflix-runtime
else
    GROUP_NAME=$(getent group $PGID | cut -d: -f1)
    echo "Using existing group: $GROUP_NAME (GID: $PGID)"
fi

# Create user if it doesn't exist
if ! getent passwd $PUID > /dev/null 2>&1; then
    echo "Creating user with UID: $PUID"
    useradd -u $PUID -g $PGID -M -s /bin/bash miauflix-runtime
else
    USER_NAME=$(getent passwd $PUID | cut -d: -f1)
    echo "Using existing user: $USER_NAME (UID: $PUID)"
fi

# Set ownership of application directories
echo "Setting ownership of /usr/src/app/data to $PUID:$PGID"
chown -R $PUID:$PGID /usr/src/app/data

# Ensure directories are writable
chmod 755 /usr/src/app/data

echo "-------------------------------------"
echo "Starting application as UID: $PUID, GID: $PGID"
echo "-------------------------------------"

# Execute the CMD as the specified user
exec gosu $PUID:$PGID "$@" 