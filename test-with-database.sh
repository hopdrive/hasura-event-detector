#!/bin/bash
# Test script that runs with actual database writes
# USES TEST ENVIRONMENT ONLY - NEVER PRODUCTION

# Load test credentials from console .env file
ENV_FILE="packages/console/.env"

if [ ! -f "$ENV_FILE" ]; then
    echo "❌ .env file not found: $ENV_FILE"
    echo "Expected location: /Users/robnewton/Github/hasura-event-detector/packages/console/.env"
    exit 1
fi

# Source the .env file
set -a
source "$ENV_FILE"
set +a

# Map VITE_ variables to expected names
export HASURA_GRAPHQL_ENDPOINT="$VITE_GRAPHQL_ENDPOINT"
export HASURA_ADMIN_SECRET="$VITE_HASURA_ADMIN_SECRET"

# Safety check - abort if production endpoint is set
if [[ "$HASURA_GRAPHQL_ENDPOINT" == *"gql.hopdrive.io"* ]]; then
    echo "❌ ERROR: Production endpoint detected!"
    echo "❌ This script will NOT run against production!"
    exit 1
fi

# Verify we have required variables
if [ -z "$HASURA_GRAPHQL_ENDPOINT" ]; then
    echo "❌ ERROR: HASURA_GRAPHQL_ENDPOINT not set in .env file"
    exit 1
fi

if [ -z "$HASURA_ADMIN_SECRET" ]; then
    echo "❌ ERROR: HASURA_ADMIN_SECRET not set in .env file"
    exit 1
fi

echo "=================================================="
echo "Running test with TEST database writes"
echo "=================================================="
echo "Endpoint: $HASURA_GRAPHQL_ENDPOINT"
echo "Secret: ${HASURA_ADMIN_SECRET:0:10}..."
echo ""
echo "✅ Using TEST environment (safe to run)"
echo ""

# Check if payload file specified
PAYLOAD_FILE="$1"

if [ -n "$PAYLOAD_FILE" ]; then
    if [ ! -f "$PAYLOAD_FILE" ]; then
        echo "❌ ERROR: Payload file not found: $PAYLOAD_FILE"
        exit 1
    fi
    echo "Using specified payload: $PAYLOAD_FILE"
    echo ""
    node test-with-real-payload.js "$PAYLOAD_FILE"
else
    echo "No payload specified - will randomly select from test-payloads/"
    echo ""
    node test-with-real-payload.js
fi

echo ""
echo "=================================================="
echo "Test complete!"
echo "Check the database for new records:"
echo "  - invocations table"
echo "  - event_executions table"
echo "  - job_executions table"
echo "=================================================="
