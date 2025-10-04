#!/bin/bash

# Test script for Hasura Event Detector Netlify Functions
# Usage: ./test-functions.sh [local|production]

# Determine base URL
if [ "$1" == "production" ]; then
  BASE_URL="${NETLIFY_URL:?NETLIFY_URL environment variable not set}"
  echo "Testing production deployment at: $BASE_URL"
else
  BASE_URL="http://localhost:8888"
  echo "Testing local development at: $BASE_URL"
fi

echo ""
echo "==========================================="
echo "Test 1: db-orders (orders.created event)"
echo "==========================================="
echo "Background function - processes order creation"
echo ""

curl -X POST "$BASE_URL/.netlify/functions/db-orders" \
  -H "Content-Type: application/json" \
  -d '{
    "event": {
      "session_variables": {
        "x-hasura-role": "user"
      },
      "op": "INSERT",
      "data": {
        "old": null,
        "new": {
          "id": "123e4567-e89b-12d3-a456-426614174000",
          "user_id": "user_001",
          "customer_email": "customer@example.com",
          "total": 99.99,
          "payment_method": "credit_card",
          "status": "pending",
          "created_at": "2024-01-15T10:30:00Z"
        }
      }
    },
    "created_at": "2024-01-15T10:30:00.000Z",
    "id": "evt_001",
    "delivery_info": {
      "current_retry": 0,
      "max_retries": 0
    },
    "trigger": {
      "name": "orders_insert"
    },
    "table": {
      "schema": "public",
      "name": "orders"
    }
  }'

echo ""
echo ""
echo "==========================================="
echo "Test 2: db-orders (orders.shipped event)"
echo "==========================================="
echo "Background function - processes order shipment"
echo ""

curl -X POST "$BASE_URL/.netlify/functions/db-orders" \
  -H "Content-Type: application/json" \
  -d '{
    "event": {
      "session_variables": {
        "x-hasura-role": "admin"
      },
      "op": "UPDATE",
      "data": {
        "old": {
          "id": "123e4567-e89b-12d3-a456-426614174000",
          "status": "pending",
          "tracking_number": null
        },
        "new": {
          "id": "123e4567-e89b-12d3-a456-426614174000",
          "status": "shipped",
          "tracking_number": "TRK123456",
          "shipped_at": "2024-01-16T14:20:00Z"
        }
      }
    },
    "created_at": "2024-01-16T14:20:00.000Z",
    "id": "evt_002",
    "delivery_info": {
      "current_retry": 0,
      "max_retries": 0
    },
    "trigger": {
      "name": "orders_update"
    },
    "table": {
      "schema": "public",
      "name": "orders"
    }
  }'

echo ""
echo ""
echo "==========================================="
echo "Test 3: db-users (users.activated event)"
echo "==========================================="
echo "Synchronous function - processes user activation"
echo ""

curl -X POST "$BASE_URL/.netlify/functions/db-users" \
  -H "Content-Type: application/json" \
  -d '{
    "event": {
      "session_variables": {
        "x-hasura-role": "admin"
      },
      "op": "UPDATE",
      "data": {
        "old": {
          "id": "user_001",
          "email": "user@example.com",
          "name": "John Doe",
          "status": "pending",
          "created_at": "2024-01-14T08:00:00Z"
        },
        "new": {
          "id": "user_001",
          "email": "user@example.com",
          "name": "John Doe",
          "status": "active",
          "created_at": "2024-01-14T08:00:00Z",
          "activated_at": "2024-01-15T10:30:00Z"
        }
      }
    },
    "created_at": "2024-01-15T10:30:00.000Z",
    "id": "evt_003",
    "delivery_info": {
      "current_retry": 0,
      "max_retries": 0
    },
    "trigger": {
      "name": "users_update"
    },
    "table": {
      "schema": "public",
      "name": "users"
    }
  }'

echo ""
echo ""
echo "==========================================="
echo "Test 4: db-payments (payments.completed event)"
echo "==========================================="
echo "Background function WITH observability - processes payment"
echo ""

curl -X POST "$BASE_URL/.netlify/functions/db-payments" \
  -H "Content-Type: application/json" \
  -d '{
    "event": {
      "session_variables": {
        "x-hasura-role": "system"
      },
      "op": "UPDATE",
      "data": {
        "old": {
          "id": "pay_001",
          "order_id": "123e4567-e89b-12d3-a456-426614174000",
          "amount": 99.99,
          "status": "processing"
        },
        "new": {
          "id": "pay_001",
          "order_id": "123e4567-e89b-12d3-a456-426614174000",
          "amount": 99.99,
          "status": "completed",
          "completed_at": "2024-01-15T10:35:00Z"
        }
      }
    },
    "created_at": "2024-01-15T10:35:00.000Z",
    "id": "evt_004",
    "delivery_info": {
      "current_retry": 0,
      "max_retries": 0
    },
    "trigger": {
      "name": "payments_update"
    },
    "table": {
      "schema": "public",
      "name": "payments"
    }
  }'

echo ""
echo ""
echo "==========================================="
echo "Tests Complete!"
echo "==========================================="
echo ""
echo "Summary:"
echo "- db-orders: Handles ALL order events (created, shipped, cancelled)"
echo "- db-users: Handles ALL user events (activated, deactivated)"
echo "- db-payments: Handles ALL payment events (completed, refunded)"
echo ""
echo "Each function uses plural table naming and dot notation events."
echo ""
