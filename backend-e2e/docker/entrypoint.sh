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

# Ensure /usr/src/app/data/downloads exists and is owned by the correct user
echo "Ensuring /usr/src/app/downloads exists and is owned by $PUID:$PGID"
mkdir -p /usr/src/app/downloads
chown -R $PUID:$PGID /usr/src/app/downloads

# Ensure directories are writable
chmod 755 /usr/src/app/data

# Ensure /tmp is writable by the application user (for trace files)
echo "Setting ownership of /tmp to $PUID:$PGID"
chown -R $PUID:$PGID /tmp
chmod 755 /tmp

# Sync frontend files from image to volume on container start
if [ -d "/usr/src/app/public" ] && [ -d "/usr/src/app/public_volume" ]; then
    # Check if volume is empty or if image files are newer
    NEED_SYNC=false
    
    if [ -z "$(ls -A /usr/src/app/public_volume 2>/dev/null)" ]; then
        # Volume is empty, need to sync
        NEED_SYNC=true
        echo "-------------------------------------"
        echo "Volume is empty, syncing frontend files from image..."
        echo "-------------------------------------"
    else
        # Compare newest file modification times
        if command -v find > /dev/null 2>&1 && command -v stat > /dev/null 2>&1; then
            # Get newest file mtime in image (in seconds since epoch)
            IMAGE_NEWEST=$(find /usr/src/app/public -type f -exec stat -c %Y {} \; 2>/dev/null | sort -n | tail -1)
            # Get newest file mtime in volume
            VOLUME_NEWEST=$(find /usr/src/app/public_volume -type f -exec stat -c %Y {} \; 2>/dev/null | sort -n | tail -1)
            
            if [ -n "$IMAGE_NEWEST" ] && [ -n "$VOLUME_NEWEST" ]; then
                if [ "$IMAGE_NEWEST" -gt "$VOLUME_NEWEST" ]; then
                    NEED_SYNC=true
                    echo "-------------------------------------"
                    echo "Image files are newer, syncing frontend files from image to volume..."
                    echo "-------------------------------------"
                else
                    echo "-------------------------------------"
                    echo "Volume files are up-to-date or newer, skipping sync"
                    echo "-------------------------------------"
                fi
            else
                # Fallback: if we can't determine, sync to be safe
                NEED_SYNC=true
                echo "-------------------------------------"
                echo "Unable to compare timestamps, syncing frontend files from image to volume..."
                echo "-------------------------------------"
            fi
        else
            # Fallback: if find/stat not available, sync to be safe
            NEED_SYNC=true
            echo "-------------------------------------"
            echo "Syncing frontend files from image to volume..."
            echo "-------------------------------------"
        fi
    fi
    
    if [ "$NEED_SYNC" = true ]; then
        # Use rsync if available, otherwise use cp
        if command -v rsync > /dev/null 2>&1; then
            rsync -av --delete /usr/src/app/public/ /usr/src/app/public_volume/
        else
            rm -rf /usr/src/app/public_volume/*
            cp -r /usr/src/app/public/* /usr/src/app/public_volume/
        fi
        # Ensure proper ownership of synced files
        chown -R $PUID:$PGID /usr/src/app/public_volume
        echo "Frontend files synced successfully"
        echo "-------------------------------------"
    fi
fi

echo "-------------------------------------"
echo "Starting application as UID: $PUID, GID: $PGID"
echo "-------------------------------------"

# Execute the CMD as the specified user
exec gosu $PUID:$PGID "$@" 