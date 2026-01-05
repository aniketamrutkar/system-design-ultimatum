# AWS DynamoDB - Complete Deep Dive

## What is DynamoDB?

**Amazon DynamoDB** is a fully managed, serverless NoSQL database service that enables:
- **Automatic scaling**: Capacity adjusts to traffic automatically
- **High performance**: Single-digit millisecond latency
- **Fully managed**: No servers, patches, or backups to manage
- **Multi-region**: Built-in global tables and replication
- **Pay-per-request or provisioned**: Flexible pricing models
- **ACID transactions**: Single and multi-item transactions

### Core Characteristics

| Aspect | Benefit |
|--------|---------|
| **Serverless** | No infrastructure to manage |
| **Auto-scaling** | Capacity adjusts to demand |
| **High performance** | < 10ms latency at any scale |
| **Managed backup** | Built-in backup and point-in-time recovery |
| **Global tables** | Multi-region replication with millisecond latency |
| **ACID transactions** | Single & multi-item transactional support |
| **Security** | Encryption, IAM, VPC integration |

---

## DynamoDB Architecture Overview

```
AWS Region (US-East-1)
  ├─ DynamoDB Partition 0
  │  └─ Replica 1, Replica 2, Replica 3 (3-way replication)
  ├─ DynamoDB Partition 1
  │  └─ Replica 1, Replica 2, Replica 3
  └─ DynamoDB Partition N
     └─ Replica 1, Replica 2, Replica 3
       ↓
  Global Tables (Multi-region)
  ├─ Region 2 (EU-West-1)
  └─ Region 3 (AP-Southeast-1)
```

**Key concepts:**
- **Table**: Collection of items (like a database table)
- **Item**: Single record (like a row in SQL)
- **Attribute**: Field in an item (like a column)
- **Partition**: Logical unit containing items (distributed across nodes)
- **Partition Key**: Determines which partition stores item
- **Replica**: Copy of partition (for HA and read scaling)

---

## Core Components

### 1. Tables and Items

**Table**: Collection of items with defined schema (partially)

```python
import boto3

dynamodb = boto3.resource('dynamodb', region_name='us-east-1')

# Create table
table = dynamodb.create_table(
    TableName='users',
    KeySchema=[
        {'AttributeName': 'user_id', 'KeyType': 'HASH'},      # Partition key
        {'AttributeName': 'created_at', 'KeyType': 'RANGE'}   # Sort key
    ],
    AttributeDefinitions=[
        {'AttributeName': 'user_id', 'AttributeType': 'S'},   # String
        {'AttributeName': 'created_at', 'AttributeType': 'S'} # String
    ],
    BillingMode='PAY_PER_REQUEST'  # Auto-scaling
)
```

**Item**: Single record in table

```python
# Put item
table.put_item(
    Item={
        'user_id': 'user123',
        'created_at': '2024-01-05T10:00:00Z',
        'email': 'user@example.com',
        'name': 'John Doe',
        'profile': {
            'age': 30,
            'location': 'NYC'
        },
        'tags': ['vip', 'verified']
    }
)

# Get item
response = table.get_item(
    Key={
        'user_id': 'user123',
        'created_at': '2024-01-05T10:00:00Z'
    }
)
```

---

### 2. Primary Keys

**Partition Key (HASH)**: Determines which partition stores item

```
Partition key: user_id
- Values: user1, user2, user3, ...
- Hash function: hash(user_id) % num_partitions
- All items with same user_id in same partition
- Enables equality queries fast
```

**Sort Key (RANGE)**: Enables range queries within partition

```cql
KeySchema:
  HASH: user_id
  RANGE: created_at

Query patterns:
  - user_id = 'user1' AND created_at = '2024-01-05'  (exact)
  - user_id = 'user1' AND created_at > '2024-01-01'  (range)
  - user_id = 'user1' AND created_at BETWEEN ... AND ...
```

**Attribute types:**

```python
# String (S)
'user_id': 'user123'

# Number (N)
'age': 30

# Binary (B)
'image': b'binary_data'

# Boolean (BOOL)
'is_active': True

# Null (NULL)
'phone': None

# Map (M)
'profile': {'age': 30, 'location': 'NYC'}

# List (L)
'tags': ['vip', 'verified']

# String Set (SS)
'colors': {'red', 'blue', 'green'}

# Number Set (NS)
'scores': {100, 200, 300}
```

---

### 3. Secondary Indexes

**Global Secondary Index (GSI)**: Query on different attributes

```python
# Create GSI on email
table = dynamodb.create_table(
    TableName='users',
    KeySchema=[
        {'AttributeName': 'user_id', 'KeyType': 'HASH'},
    ],
    GlobalSecondaryIndexes=[
        {
            'IndexName': 'email-index',
            'KeySchema': [
                {'AttributeName': 'email', 'KeyType': 'HASH'}
            ],
            'Projection': {'ProjectionType': 'ALL'},
            'BillingMode': 'PAY_PER_REQUEST'
        }
    ],
    AttributeDefinitions=[
        {'AttributeName': 'user_id', 'AttributeType': 'S'},
        {'AttributeName': 'email', 'AttributeType': 'S'}
    ],
    BillingMode='PAY_PER_REQUEST'
)

# Query by email
response = table.query(
    IndexName='email-index',
    KeyConditionExpression='email = :email',
    ExpressionAttributeValues={
        ':email': 'user@example.com'
    }
)
```

**Local Secondary Index (LSI)**: Range key on same partition key

```python
# Create LSI with different sort key
table = dynamodb.create_table(
    TableName='user_activity',
    KeySchema=[
        {'AttributeName': 'user_id', 'KeyType': 'HASH'},
        {'AttributeName': 'timestamp', 'KeyType': 'RANGE'}
    ],
    LocalSecondaryIndexes=[
        {
            'IndexName': 'activity-type-index',
            'KeySchema': [
                {'AttributeName': 'user_id', 'KeyType': 'HASH'},
                {'AttributeName': 'activity_type', 'KeyType': 'RANGE'}
            ],
            'Projection': {'ProjectionType': 'ALL'}
        }
    ]
)

# Query activities of type 'login'
response = table.query(
    IndexName='activity-type-index',
    KeyConditionExpression='user_id = :id AND activity_type = :type',
    ExpressionAttributeValues={
        ':id': 'user123',
        ':type': 'login'
    }
)
```

**GSI vs LSI:**

| Aspect | GSI | LSI |
|--------|-----|-----|
| **Partition Key** | Can be different | Must be same |
| **Size Limit** | 10GB per partition | 10GB total per partition key |
| **Throughput** | Separate from table | Shared with table |
| **Consistency** | Eventually consistent | Strongly consistent option |
| **Sparse Index** | Recommended | Not efficient |

---

### 4. Write Operations

**Put Item** (insert or replace):

```python
table.put_item(
    Item={'user_id': 'user123', 'email': 'new@example.com'},
    ConditionExpression='attribute_not_exists(user_id)'  # Only if not exists
)
```

**Update Item** (modify attributes):

```python
table.update_item(
    Key={'user_id': 'user123'},
    UpdateExpression='SET #email = :email, updated_at = :now',
    ExpressionAttributeNames={'#email': 'email'},
    ExpressionAttributeValues={
        ':email': 'newemail@example.com',
        ':now': '2024-01-05T11:00:00Z'
    },
    ReturnValues='ALL_NEW'
)
```

**Delete Item**:

```python
table.delete_item(
    Key={'user_id': 'user123'},
    ConditionExpression='attribute_exists(user_id)'
)
```

**Batch Write** (high throughput):

```python
with table.batch_writer(batch_size=25) as batch:
    for i in range(1000):
        batch.put_item(
            Item={'user_id': f'user{i}', 'email': f'user{i}@example.com'}
        )
```

---

### 5. Read Operations

**Get Item** (single item, fast):

```python
response = table.get_item(
    Key={'user_id': 'user123'},
    ConsistentRead=True  # Strong consistency
)
item = response.get('Item')
```

**Query** (partition key + optional sort key):

```python
response = table.query(
    KeyConditionExpression='user_id = :id AND created_at > :date',
    ExpressionAttributeValues={
        ':id': 'user123',
        ':date': '2024-01-01'
    },
    Limit=10
)
```

**Scan** (full table scan, slow):

```python
response = table.scan(
    FilterExpression='email = :email',
    ExpressionAttributeValues={
        ':email': 'user@example.com'
    }
)
# Avoid in production (scans entire table)
```

**Batch Get** (get multiple items):

```python
response = dynamodb.batch_get_item(
    RequestItems={
        'users': {
            'Keys': [
                {'user_id': 'user1'},
                {'user_id': 'user2'},
                {'user_id': 'user3'}
            ]
        }
    }
)
```

---

## Throughput and Capacity Planning

### Billing Modes

**Provisioned Capacity** (pay for reserved capacity):

```python
table = dynamodb.create_table(
    TableName='users',
    BillingMode='PROVISIONED',
    ProvisionedThroughput={
        'ReadCapacityUnits': 100,    # 100 strong consistent reads/sec
        'WriteCapacityUnits': 50     # 50 writes/sec
    }
)

# Cost calculation:
# Read: 100 RCU × $0.00013 per RCU-hour = $1.30/hour
# Write: 50 WCU × $0.00065 per WCU-hour = $3.25/hour
# Total: ~$4.55/hour = ~$3,276/month
```

**On-Demand Capacity** (pay per request):

```python
table = dynamodb.create_table(
    TableName='users',
    BillingMode='PAY_PER_REQUEST'
)

# Cost calculation:
# Read: $0.25 per 1M requests
# Write: $1.25 per 1M requests

# Example: 100M reads + 10M writes/month
# Cost: (100M × $0.25) + (10M × $1.25) / 1M = $25 + $12.50 = $37.50
```

**When to use:**

| Mode | Best For |
|------|----------|
| **Provisioned** | Predictable traffic, cost-conscious |
| **On-Demand** | Unpredictable spikes, rapid scaling |

### Capacity Units

**Read Capacity Unit (RCU)**:

```
1 RCU = 1 strong consistent read/sec (4KB item)
      = 2 eventually consistent reads/sec (4KB item)

Example:
  Item size: 4KB
  Strong consistent: 100 reads/sec → 100 RCU
  Eventually consistent: 100 reads/sec → 50 RCU
  
  Item size: 12KB (>4KB)
  RCU needed: ceil(12KB / 4KB) = 3 RCU per read
  100 reads/sec → 300 RCU
```

**Write Capacity Unit (WCU)**:

```
1 WCU = 1 write/sec (1KB item)

Example:
  Item size: 1KB
  100 writes/sec → 100 WCU
  
  Item size: 5KB (>1KB)
  WCU needed: ceil(5KB / 1KB) = 5 WCU per write
  100 writes/sec → 500 WCU
```

### Capacity Estimation

```
Requirement: 10K reads/sec, 1K writes/sec, 5KB items

Read capacity:
  Strong consistent: ceil(5KB / 4KB) × 10K = 2 × 10K = 20K RCU
  Eventually consistent: 20K ÷ 2 = 10K RCU
  
Write capacity:
  ceil(5KB / 1KB) × 1K = 5 × 1K = 5K WCU
  
Total: 20K RCU + 5K WCU (provisioned mode)
  Cost: (20K × $0.00013) + (5K × $0.00065) ≈ $5.63/hour
```

---

## Consistency Models

### Strong Consistency vs Eventually Consistent

```python
# Eventually consistent (default, faster)
response = table.get_item(
    Key={'user_id': 'user123'},
    ConsistentRead=False  # Default
)
# Reads from any replica (might be stale)

# Strongly consistent (slower, latest data)
response = table.get_item(
    Key={'user_id': 'user123'},
    ConsistentRead=True
)
# Reads from primary replica only
```

**Consistency model:**

```
Write to DynamoDB:
  1. Write to primary partition
  2. Asynchronously replicate to 2 other replicas
  3. Return success to client

Immediately after write:
  Strong consistent read: See new value (from primary)
  Eventually consistent read: Might see old value (if reading replica)
  
After ~1ms:
  Both reads see new value (replication caught up)
```

---

## Transactions

**Single Item Transactions** (update with conditions):

```python
table.update_item(
    Key={'user_id': 'user123'},
    UpdateExpression='SET balance = balance - :amount',
    ConditionExpression='balance >= :amount',
    ExpressionAttributeValues={
        ':amount': 100
    }
)
```

**Multi-Item Transactions** (ACID across items/tables):

```python
dynamodb.transact_write_items(
    TransactItems=[
        {
            'Put': {
                'TableName': 'accounts',
                'Item': {
                    'account_id': 'acc1',
                    'balance': 900
                }
            }
        },
        {
            'Put': {
                'TableName': 'accounts',
                'Item': {
                    'account_id': 'acc2',
                    'balance': 1100
                }
            }
        },
        {
            'Put': {
                'TableName': 'transactions',
                'Item': {
                    'transaction_id': 'txn1',
                    'from': 'acc1',
                    'to': 'acc2',
                    'amount': 100
                }
            }
        }
    ]
)
# All succeed or all fail (atomic)
```

---

## Performance Optimization

### Hot Partitions

**Problem**: Uneven distribution of traffic

```
Partition Key: user_id
Users: 1M
Requests/sec: 100K

If distribution is even:
  100K / 1M users = 100 requests per user on average
  
If one user is celebrity with 90K requests:
  Celebrity partition: 90K requests → HIGH LOAD
  Other partitions: 10K requests → LOW LOAD
  
Result: Single partition is bottleneck
```

**Solution: Write Sharding**

```python
# Before (hot partition)
user_id = 'celebrity'
# All writes go to same partition

# After (distribute across shards)
num_shards = 100
shard_id = random.randint(0, num_shards - 1)
partition_key = f'{user_id}#{shard_id}'

# Put item
table.put_item(
    Item={
        'user_id': partition_key,  # 'celebrity#42'
        'timestamp': '2024-01-05T10:00:00Z',
        'action': 'view'
    }
)

# Query all shards for followers
responses = []
for shard in range(num_shards):
    response = table.query(
        KeyConditionExpression='user_id = :id',
        ExpressionAttributeValues={
            ':id': f'celebrity#{shard}'
        }
    )
    responses.extend(response['Items'])
```

### Query Optimization

```python
# ❌ SLOW: Full table scan
response = table.scan(
    FilterExpression='email = :email',
    ExpressionAttributeValues={':email': 'user@example.com'}
)

# ✅ FAST: Use GSI on email
response = table.query(
    IndexName='email-index',
    KeyConditionExpression='email = :email',
    ExpressionAttributeValues={':email': 'user@example.com'}
)

# ❌ SLOW: Fetch all attributes
response = table.query(
    KeyConditionExpression='user_id = :id',
    ExpressionAttributeValues={':id': 'user123'}
)

# ✅ FAST: Project only needed attributes
response = table.query(
    KeyConditionExpression='user_id = :id',
    ProjectionExpression='user_id,email,name',
    ExpressionAttributeValues={':id': 'user123'}
)
```

### Batch Operations

```python
# ❌ SLOW: Individual writes (sequential)
for item in items:
    table.put_item(Item=item)
    # Each write = network round trip

# ✅ FAST: Batch write (25 items per request)
with table.batch_writer(batch_size=25) as batch:
    for item in items:
        batch.put_item(Item=item)

# ❌ SLOW: Individual reads
for user_id in user_ids:
    response = table.get_item(Key={'user_id': user_id})

# ✅ FAST: Batch get (up to 100 items per request)
response = dynamodb.batch_get_item(
    RequestItems={
        'users': {
            'Keys': [{'user_id': uid} for uid in user_ids]
        }
    }
)
```

---

## Scalability and High Availability

### Auto-Scaling (Provisioned Mode)

```python
autoscaling = boto3.client('application-autoscaling')

# Register DynamoDB table for auto-scaling
autoscaling.register_scalable_target(
    ServiceNamespace='dynamodb',
    ResourceId='table/users',
    ScalableDimension='dynamodb:table:WriteCapacityUnits',
    MinCapacity=10,
    MaxCapacity=10000
)

# Create scaling policy
autoscaling.put_scaling_policy(
    PolicyName='users-scaling',
    ServiceNamespace='dynamodb',
    ResourceId='table/users',
    ScalableDimension='dynamodb:table:WriteCapacityUnits',
    PolicyType='TargetTrackingScaling',
    TargetTrackingScalingPolicyConfiguration={
        'TargetValue': 70.0,  # Keep utilization at 70%
        'PredefinedMetricSpecification': {
            'PredefinedMetricType': 'DynamoDBWriteCapacityUtilization'
        }
    }
)
```

### Global Tables (Multi-Region)

```python
# Create table in US-East
us_table = dynamodb.create_table(
    TableName='users',
    KeySchema=[{'AttributeName': 'user_id', 'KeyType': 'HASH'}],
    AttributeDefinitions=[{'AttributeName': 'user_id', 'AttributeType': 'S'}],
    BillingMode='PAY_PER_REQUEST',
    StreamSpecification={'StreamViewType': 'NEW_AND_OLD_IMAGES'}
)

# Add EU-West replica
dynamodb = boto3.client('dynamodb')
dynamodb.create_global_table(
    GlobalTableName='users',
    ReplicationGroup=[
        {'RegionName': 'us-east-1'},
        {'RegionName': 'eu-west-1'},
        {'RegionName': 'ap-southeast-1'}
    ]
)

# Benefits:
# - Local reads (< 10ms latency in each region)
# - Local writes (replicate asynchronously)
# - Automatic failover
# - Multi-region writes (last-write-wins)
```

---

## Use Cases

### 1. User Sessions (High Read/Write)

```python
table = dynamodb.create_table(
    TableName='sessions',
    KeySchema=[
        {'AttributeName': 'session_id', 'KeyType': 'HASH'},
        {'AttributeName': 'created_at', 'KeyType': 'RANGE'}
    ],
    BillingMode='PAY_PER_REQUEST'
)

# Write session (fast, volatile data)
table.put_item(
    Item={
        'session_id': 'sess-abc123',
        'created_at': '2024-01-05T10:00:00Z',
        'user_id': 'user123',
        'data': {'cart': ['item1', 'item2']},
        'ttl': int(time.time()) + 3600  # Auto-expire
    }
)

# Read session (fast lookup)
response = table.get_item(Key={'session_id': 'sess-abc123'})
```

### 2. Real-time Analytics (Time-series)

```python
table = dynamodb.create_table(
    TableName='metrics',
    KeySchema=[
        {'AttributeName': 'metric_name', 'KeyType': 'HASH'},
        {'AttributeName': 'timestamp', 'KeyType': 'RANGE'}
    ],
    BillingMode='PAY_PER_REQUEST'
)

# Write metric
table.put_item(
    Item={
        'metric_name': 'cpu-usage#server1',
        'timestamp': '2024-01-05T10:00:00Z',
        'value': 85.5
    }
)

# Query metrics (range)
response = table.query(
    KeyConditionExpression='metric_name = :name AND #ts BETWEEN :start AND :end',
    ExpressionAttributeNames={'#ts': 'timestamp'},
    ExpressionAttributeValues={
        ':name': 'cpu-usage#server1',
        ':start': '2024-01-05T09:00:00Z',
        ':end': '2024-01-05T10:00:00Z'
    }
)
```

### 3. Document Store (Flexible Schema)

```python
table = dynamodb.create_table(
    TableName='documents',
    KeySchema=[
        {'AttributeName': 'doc_id', 'KeyType': 'HASH'}
    ],
    BillingMode='PAY_PER_REQUEST'
)

# Store flexible document
table.put_item(
    Item={
        'doc_id': 'doc-123',
        'title': 'Article',
        'content': 'Lorem ipsum...',
        'metadata': {
            'author': 'John',
            'tags': ['python', 'dynamodb'],
            'ratings': [5, 4, 5]
        }
    }
)

# Document can have any shape
table.put_item(
    Item={
        'doc_id': 'doc-456',
        'type': 'video',
        'url': 'https://example.com/video.mp4',
        'duration': 3600,
        'transcodes': ['360p', '720p', '1080p']
    }
)
```

---

## Interview Questions & Answers

### Q1: Design a ride-sharing backend for 1M daily active users, 100K concurrent rides

**Requirements:**
- Real-time ride tracking
- Driver and rider matching
- Trip history
- Payments
- 99.99% uptime

**Solution Architecture:**

```python
# Rides table (current/active rides)
rides_table = dynamodb.create_table(
    TableName='rides',
    KeySchema=[
        {'AttributeName': 'ride_id', 'KeyType': 'HASH'},
        {'AttributeName': 'status', 'KeyType': 'RANGE'}
    ],
    GlobalSecondaryIndexes=[
        {
            'IndexName': 'driver-rides-index',
            'KeySchema': [
                {'AttributeName': 'driver_id', 'KeyType': 'HASH'},
                {'AttributeName': 'created_at', 'KeyType': 'RANGE'}
            ],
            'Projection': {'ProjectionType': 'ALL'}
        },
        {
            'IndexName': 'rider-rides-index',
            'KeySchema': [
                {'AttributeName': 'rider_id', 'KeyType': 'HASH'},
                {'AttributeName': 'created_at', 'KeyType': 'RANGE'}
            ],
            'Projection': {'ProjectionType': 'ALL'}
        }
    ],
    BillingMode='PAY_PER_REQUEST'
)

# Driver location (hot writes, use write sharding)
drivers_table = dynamodb.create_table(
    TableName='drivers',
    KeySchema=[
        {'AttributeName': 'driver_id#shard', 'KeyType': 'HASH'},
        {'AttributeName': 'timestamp', 'KeyType': 'RANGE'}
    ],
    BillingMode='PAY_PER_REQUEST'
)

# Trip history (archived)
history_table = dynamodb.create_table(
    TableName='trip_history',
    KeySchema=[
        {'AttributeName': 'user_id', 'KeyType': 'HASH'},
        {'AttributeName': 'trip_date', 'KeyType': 'RANGE'}
    ],
    BillingMode='PAY_PER_REQUEST'
)
```

**Write path:**

```python
# Update ride status (strong consistency)
rides_table.update_item(
    Key={'ride_id': 'ride-123', 'status': 'ACTIVE'},
    UpdateExpression='SET #loc = :loc, #ts = :ts',
    ExpressionAttributeNames={'#loc': 'location', '#ts': 'updated_at'},
    ExpressionAttributeValues={
        ':loc': {'lat': 40.7128, 'lng': -74.0060},
        ':ts': int(time.time())
    }
)

# Update driver location (write sharding for hot partition)
shard_id = random.randint(0, 99)
drivers_table.put_item(
    Item={
        'driver_id#shard': f'driver-123#{shard_id}',
        'timestamp': int(time.time()),
        'location': {'lat': 40.7128, 'lng': -74.0060},
        'status': 'available'
    }
)
```

**Read path:**

```python
# Get active ride
ride = rides_table.get_item(
    Key={'ride_id': 'ride-123', 'status': 'ACTIVE'},
    ConsistentRead=True
)

# Get driver's rides (via GSI)
driver_rides = rides_table.query(
    IndexName='driver-rides-index',
    KeyConditionExpression='driver_id = :id AND created_at > :date',
    ExpressionAttributeValues={
        ':id': 'driver-123',
        ':date': '2024-01-05T00:00:00Z'
    }
)

# Get driver location (query all shards)
locations = []
for shard in range(100):
    response = drivers_table.query(
        KeyConditionExpression=f'driver_id#shard = :id AND #ts = :ts',
        ExpressionAttributeNames={'#ts': 'timestamp'},
        ExpressionAttributeValues={
            ':id': f'driver-123#{shard}',
            ':ts': int(time.time())
        },
        Limit=1
    )
    if response['Items']:
        locations.append(response['Items'][0])
```

**Capacity planning:**

```
Active rides: 100K
Reads/write: 
  - Ride updates: 100K writes/sec (status changes)
  - Location updates: 1M writes/sec (every second)
  - Trip history reads: 100K reads/sec (riders checking history)

Writes: 
  Rides: 100K × 1KB = 100K WCU
  Location: 1M × 0.5KB = 500K WCU (use write sharding)
  
Total: ~600K WCU (on-demand pricing)
```

---

### Q2: Hot partition bottleneck. How to scale writes?

**Answer:**

**Diagnosis:**

```bash
# Monitor write throttling
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name UserErrors \
  --statistics Sum \
  --start-time 2024-01-05T00:00:00Z \
  --end-time 2024-01-05T01:00:00Z
```

**Solution 1: Write Sharding**

```python
# Before (hot key)
partition_key = 'celebrity'  # All writes here

# After (distribute across 100 shards)
num_shards = 100
shard_id = hash(user_id) % num_shards  # Deterministic
partition_key = f'celebrity#{shard_id:03d}'

# Write distributed across 100 partitions
table.put_item(Item={'user_id': partition_key, 'action': 'view'})

# Read from all shards
results = []
for shard in range(num_shards):
    response = table.query(
        KeyConditionExpression='user_id = :id',
        ExpressionAttributeValues={':id': f'celebrity#{shard:03d}'}
    )
    results.extend(response['Items'])
```

**Solution 2: DynamoDB Accelerator (DAX)**

```python
from amazondax.client import AmazonDaxClient

cluster_endpoint = 'dax-cluster.xxxxx.dax.amazonaws.com:8111'
client = AmazonDaxClient.resource(endpoint_url=cluster_endpoint)
table = client.Table('users')

# Writes bypass DAX (go to DynamoDB)
# Reads hit DAX cache first (100x faster)
```

**Solution 3: Multiple Tables with Sharding**

```
# Instead of sharding within table
tables = [
    'users-shard-0',
    'users-shard-1',
    ...
    'users-shard-99'
]

shard_id = hash(user_id) % 100
table = dynamodb.Table(f'users-shard-{shard_id}')
table.put_item(Item=item)

# Each table has separate throughput allocation
```

**Key takeaway**: "Use write sharding for hot partitions. Distribute writes across N shards (typically 100), query all shards on read."

---

### Q3: Transaction across 3 tables fails midway. How to ensure consistency?

**Answer:**

**Problem**: Multi-item transaction needs ACID guarantees

```python
# Scenario: Transfer money between accounts + record transaction + update ledger
# If any step fails, all must roll back

def transfer_money(from_id, to_id, amount):
    try:
        dynamodb.transact_write_items(
            TransactItems=[
                {
                    'Update': {
                        'TableName': 'accounts',
                        'Key': {'account_id': from_id},
                        'UpdateExpression': 'SET balance = balance - :amt',
                        'ExpressionAttributeValues': {':amt': amount},
                        'ConditionExpression': 'balance >= :amt'
                    }
                },
                {
                    'Update': {
                        'TableName': 'accounts',
                        'Key': {'account_id': to_id},
                        'UpdateExpression': 'SET balance = balance + :amt',
                        'ExpressionAttributeValues': {':amt': amount}
                    }
                },
                {
                    'Put': {
                        'TableName': 'transactions',
                        'Item': {
                            'transaction_id': str(uuid4()),
                            'from': from_id,
                            'to': to_id,
                            'amount': amount,
                            'status': 'completed'
                        }
                    }
                }
            ]
        )
        return True
    except Exception as e:
        # Transaction failed → all rolled back automatically
        print(f"Transaction failed: {e}")
        return False
```

**DynamoDB Transactions Guarantees:**

```
✓ ACID (Atomicity, Consistency, Isolation, Durability)
✓ Atomicity: All or nothing (no partial updates)
✓ Consistency: Balance >= 0 always (condition checked)
✓ Isolation: No dirty reads (transaction locked until commit)
✓ Durability: Written to disk + replicated before returning

✗ Limitations:
  - Max 25 items per transaction
  - Max 4MB total size
  - No nested transactions
  - No automatic retry on conflict
```

**Manual retry strategy:**

```python
import time
import random

def transfer_with_retry(from_id, to_id, amount, max_retries=3):
    for attempt in range(max_retries):
        try:
            dynamodb.transact_write_items(TransactItems=[...])
            return True
        except ClientError as e:
            if e.response['Error']['Code'] == 'ValidationException':
                # Condition failed (balance < amount)
                return False
            elif e.response['Error']['Code'] == 'TransactionConflictException':
                # Retry with exponential backoff
                wait_time = (2 ** attempt) + random.uniform(0, 1)
                time.sleep(wait_time)
            else:
                raise
    
    raise Exception("Transaction failed after max retries")
```

**Key takeaway**: "DynamoDB transactions provide ACID guarantees across items. Use condition expressions to enforce business rules. Retry on conflict with exponential backoff."

---

### Q4: Designing for 10 billion items. How to manage?

**Answer:**

**Challenge**: DynamoDB table size

```
10 billion items × 1KB average = 10TB storage
Query latency increases with partition count

Single table:
  10B items / 10GB per partition = 1M partitions
  Lookup involves: hash(key) → partition → seek
```

**Solution: Table Sharding by Date**

```python
# Time-series data: partition by month
table_name = f'events-{year}-{month:02d}'

# Write to current month's table
current_month = '2024-01'
table = dynamodb.Table(f'events-{current_month}')
table.put_item(Item={
    'event_id': str(uuid4()),
    'timestamp': '2024-01-05T10:00:00Z',
    'data': {...}
})

# Query specific month
response = dynamodb.Table('events-2024-01').query(
    KeyConditionExpression='event_type = :type AND #ts > :date',
    ExpressionAttributeNames={'#ts': 'timestamp'},
    ExpressionAttributeValues={
        ':type': 'purchase',
        ':date': '2024-01-01T00:00:00Z'
    }
)

# Query across months (if needed)
def query_events(event_type, start_date, end_date):
    all_items = []
    current = start_date
    
    while current <= end_date:
        table_name = f'events-{current:%Y-%m}'
        try:
            response = dynamodb.Table(table_name).query(
                KeyConditionExpression='event_type = :type AND #ts >= :start',
                ExpressionAttributeNames={'#ts': 'timestamp'},
                ExpressionAttributeValues={
                    ':type': event_type,
                    ':start': current
                }
            )
            all_items.extend(response['Items'])
        except:
            pass  # Table doesn't exist
        
        current += timedelta(months=1)
    
    return all_items
```

**TTL for automatic cleanup:**

```python
# Automatically delete old data
table.put_item(
    Item={
        'event_id': str(uuid4()),
        'timestamp': '2024-01-05T10:00:00Z',
        'ttl': int(time.time()) + (90 * 24 * 3600)  # Delete after 90 days
    }
)

# Enable TTL on table
dynamodb.update_time_to_live(
    TableName='events-2024-01',
    TimeToLiveSpecification={
        'AttributeName': 'ttl',
        'Enabled': True
    }
)
```

**Archive strategy:**

```
Hot data (current month):
  - Full throughput
  - On-Demand billing
  
Warm data (last 3 months):
  - Reduced throughput
  - Provisioned billing
  
Cold data (older):
  - Archive to S3
  - Use Athena for queries
  - Restore if needed
```

---

### Q5: Global table has latency spike in EU. Diagnose and fix.

**Answer:**

**Monitoring:**

```python
import boto3

cloudwatch = boto3.client('cloudwatch')

# Get latency metrics per region
response = cloudwatch.get_metric_statistics(
    Namespace='AWS/DynamoDB',
    MetricName='UserErrors',
    Dimensions=[
        {'Name': 'TableName', 'Value': 'users'},
        {'Name': 'GlobalSecondaryIndexName', 'Value': 'ALL'}
    ],
    StartTime=datetime.utcnow() - timedelta(hours=1),
    EndTime=datetime.utcnow(),
    Period=60,
    Statistics=['Sum']
)
```

**Diagnosis checklist:**

```
1. Check replication lag
   - Primary region writes → Replica region lag
   - Normal: < 1 second
   - Issue: > 10 seconds → network/replication problem

2. Check throttling
   - EU table hitting capacity limit
   - Check ConsumedWriteCapacityUnits metric

3. Check cross-region network
   - High latency between regions
   - Check AWS Direct Connect health

4. Check item size
   - Large items take longer to replicate
   - Check average item size in metrics

5. Check hot partitions
   - Single key receiving all traffic
   - Use CloudWatch dimensions to identify
```

**Solutions:**

**1. Increase capacity in EU region:**

```python
# If using provisioned capacity
dynamodb = boto3.client('dynamodb')
dynamodb.update_table(
    TableName='users',
    ProvisionedThroughput={
        'ReadCapacityUnits': 500,
        'WriteCapacityUnits': 500
    }
)

# If using on-demand, nothing needed (auto-scales)
```

**2. Add local index to reduce cross-region traffic:**

```python
# Instead of global query (hits primary + replicas)
response = table.query(
    KeyConditionExpression='user_id = :id'
)

# Add local cache in EU region
eu_cache = redis_cluster_eu.get(f'user:{user_id}')
if not eu_cache:
    eu_cache = eu_dynamodb_table.get_item(Key={'user_id': user_id})
    redis_cluster_eu.set(f'user:{user_id}', eu_cache, ttl=3600)
```

**3. Monitor replication lag:**

```bash
# Check replication lag metric
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name ReplicationLatency \
  --dimensions Name=TableName,Value=users \
             Name=Region,Value=eu-west-1 \
  --start-time 2024-01-05T00:00:00Z \
  --end-time 2024-01-05T01:00:00Z \
  --period 60 \
  --statistics Maximum,Average
```

**4. Optimize write patterns:**

```python
# Batch writes to reduce round trips
with eu_table.batch_writer(batch_size=25) as batch:
    for item in items:
        batch.put_item(Item=item)

# Use eventually consistent reads where possible
eu_table.get_item(
    Key={'user_id': 'user123'},
    ConsistentRead=False  # Eventually consistent (faster)
)
```

**Key takeaway**: "Monitor replication lag and capacity metrics. Add caching for frequently accessed data. Use eventually consistent reads to reduce latency."

---

## DynamoDB vs Alternatives

| System | Throughput | Latency | Best For | Trade-off |
|--------|-----------|---------|----------|-----------|
| **DynamoDB** | 100K+/sec | 5-10ms | Managed NoSQL, high scale | Eventual consistency, cost at scale |
| **Cassandra** | 1M+/sec | 10-20ms | High write, distributed | Operational complexity |
| **MongoDB** | 100K+/sec | 5-20ms | Document flexibility, ACID | Self-managed, operational overhead |
| **RDS (PostgreSQL)** | 10K/sec | 1-5ms | Relational, transactions | Scaling limitations |
| **Redis** | 1M+/sec | 1-5ms | Cache, fast access | No persistence (volatile) |

---

## Best Practices

### Design Best Practices

✓ **Design tables around queries** (not entities)
✓ **Use partition and sort keys wisely** (avoid hot partitions)
✓ **Prefer read-heavy designs** (use secondary indexes)
✓ **Normalize strategically** (some denormalization OK)
✓ **Plan for growth** (estimate capacity accurately)
✓ **Use TTL for auto-cleanup** (time-series data)
✓ **Separate hot/cold data** (different tables/sharding)

### Operational Best Practices

✓ **Use on-demand for unpredictable traffic** (simplifies planning)
✓ **Monitor auto-scaling** (set reasonable max capacity)
✓ **Enable point-in-time recovery** (disaster recovery)
✓ **Use VPC endpoints** (security, performance)
✓ **Enable DynamoDB Streams** (for change capture)
✓ **Implement exponential backoff** (for retries)
✓ **Use DAX for caching** (100x faster reads)

### Cost Optimization

✓ **On-demand for bursty traffic** (pay per request)
✓ **Provisioned for predictable traffic** (reserved capacity)
✓ **Compress large items** (reduce WCU usage)
✓ **Delete old data via TTL** (reduce storage costs)
✓ **Use projection expressions** (avoid fetching unneeded attributes)
✓ **Batch operations** (reduce API calls)

---

## Disaster Recovery & Backup

### Backup Options

```python
# Automated backups (point-in-time recovery)
dynamodb.update_continuous_backups(
    TableName='users',
    PointInTimeRecoverySpecification={
        'PointInTimeRecoveryEnabled': True
    }
)

# Manual snapshot
dynamodb.create_backup(
    TableName='users',
    BackupName='users-backup-2024-01-05'
)

# Restore from snapshot
dynamodb.restore_table_from_backup(
    TargetTableName='users-restored',
    BackupArn='arn:aws:dynamodb:...'
)
```

### Multi-Region Strategy

```
Primary Region (US-East):
  ✓ Handles all writes
  ✓ Low latency for US users
  
Replica Regions (EU, AP):
  ✓ Eventually consistent reads
  ✓ Low latency for local users
  ✓ Automatic failover on primary failure
  
Failover:
  1. Monitor primary region health
  2. Detect failure (CloudWatch alarm)
  3. Switch writes to replica region
  4. Client redirects to replica
  5. RPO: < 1 second (replication lag)
```

---

## Summary & Key Takeaways

**DynamoDB excels at:**
- ✓ Fully managed database (no ops overhead)
- ✓ High throughput (100K+/sec per table)
- ✓ Low latency (single-digit milliseconds)
- ✓ Auto-scaling (handle traffic spikes)
- ✓ Multi-region (global tables)
- ✓ ACID transactions (single/multi-item)

**Key challenges:**
- ✗ Eventual consistency (not strong by default)
- ✗ Cost at massive scale (pay per request)
- ✗ Limited query flexibility (design tables per query)
- ✗ Hot partition bottlenecks (need write sharding)
- ✗ Vendor lock-in (AWS-specific)

**Critical design questions:**
1. What's my throughput requirement (ops/sec)?
2. Do I need strong consistency or eventually consistent is OK?
3. What's my query pattern (design tables around it)?
4. Will I have hot partitions (plan sharding)?
5. Do I need multi-region (global tables)?
6. What's my data retention (TTL auto-cleanup)?
7. Cost: provisioned vs on-demand?

