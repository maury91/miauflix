#!/bin/bash
#
# Find available ports for the backend.
#
# This script helps find what port to use to run the tests.
# It avoids port conflicts by finding unused ports in the system.

# Function to check if a port is in use, using different available tools
is_port_in_use() {
    local port=$1
    
    # Check which port checking tools are available
    if command -v lsof &> /dev/null; then
        echo "Using lsof to check port $port" >&2
        lsof -i ":$port" > /dev/null 2>&1
        return $?
    elif command -v ss &> /dev/null; then
        echo "Using ss to check port $port" >&2
        ss -tln | grep ":$port " > /dev/null 2>&1
        return $?
    elif command -v netstat &> /dev/null; then
        echo "Using netstat to check port $port" >&2
        netstat -tuln | grep ":$port " > /dev/null 2>&1
        return $?
    else
        echo "No standard network tools found, using direct TCP connection test for port $port" >&2
        # If no tools are available, try a direct TCP connection (will fail if port is in use)
        (echo > /dev/tcp/127.0.0.1/$port) > /dev/null 2>&1
        # Return inverted result: 0 if port is in use (connection succeeded), 1 if not in use
        if [ $? -eq 0 ]; then
            return 0  # Port is in use
        else
            return 1  # Port is not in use
        fi
    fi
}

# Function to find an available port
find_available_port() {
    local port=$1
    local max_attempts=100
    
    for (( attempt=0; attempt<max_attempts; attempt++ )); do
        if ! is_port_in_use "$port"; then
            echo $port
            return
        fi
        port=$((port + 1))
    done
    
    echo "Error: Could not find an available port after $max_attempts attempts" >&2
    exit 1
}

# Find ports for each service
PORT=$(find_available_port 3000)

# Output the ports as environment variables
echo "export PORT=$PORT"
