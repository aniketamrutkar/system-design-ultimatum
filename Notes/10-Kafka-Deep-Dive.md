# Apache Kafka - Complete Deep Dive

## What is Kafka?

**Apache Kafka** is a distributed event streaming platform that enables:
- **Publishing & Subscribing**: Multiple producers and consumers
- **Durability**: Persistent storage with replication
- **Real-time Processing**: Millisecond latency for stream processing
- **High Throughput**: Millions of events/second capacity

### Core Characteristics

| Aspect | Benefit |
|--------|---------|
| **Distributed** | Horizontal scalability across servers |
| **Fault-tolerant** | Automatic replication and failover |
| **Durable** | Persists to disk with configurable retention |
| **Ordered** | Per-partition event ordering guaranteed |
| **Replicated** | 3x copies prevent data loss |

---

## Kafka Architecture Overview

<details>
<summary>Click to view code</summary>

```
Producers → [Brokers (1,2,3...)] ← Consumers
              ↓
         Partitioned Topics
              ↓
       Metadata: ZooKeeper/KRaft
```

</details>

**Key layers:**
- **Producers**: Publish events to topics
- **Brokers**: Store and replicate partitions (cluster)
- **Topics**: Named event streams with partitions
- **Partitions**: Parallel storage units (leader + replicas)
- **Consumers**: Subscribe to partitions via consumer groups
- **Metadata**: ZooKeeper or KRaft manages cluster state

---

## Core Components

### 1. Topics and Partitions

**Topic**: A stream/channel of events (like a table in a database)

<details>
<summary>Click to view code</summary>

```
Topic: user-events

Partition 0:  [event1] → [event2] → [event3] → [event4]
Partition 1:  [event5] → [event6] → [event7]
Partition 2:  [event8] → [event9]
```

</details>

**Why partitions?**
- Parallelism: Multiple consumers can read different partitions simultaneously
- Throughput: Spread writes across partitions
- Ordering: Events in same partition are ordered (globally unordered)

**Partition assignment strategy**:
- **Round-robin**: Distribute across partitions evenly
- **By key**: Events with same key go to same partition (ordering guaranteed)

<details>
<summary>Click to view code (python)</summary>

```python
# Example: User ID as key
producer.send(
    topic='user-events',
    value={'action': 'login'},
    key='user123'  # All user123 events go to same partition
)
```

</details>

---

### 2. Brokers

**Broker**: A single Kafka server in the cluster

Each broker:
- Stores partition replicas
- Handles producer/consumer requests
- Replicates data to other brokers

**Broker ID**: 0, 1, 2, N (unique identifier)

<details>
<summary>Click to view code</summary>

```
Broker 0:
  - Topic A Partition 0 (leader)
  - Topic A Partition 1 (replica)
  - Topic B Partition 0 (replica)

Broker 1:
  - Topic A Partition 0 (replica)
  - Topic A Partition 1 (leader)
  - Topic B Partition 0 (leader)

Broker 2:
  - Topic A Partition 0 (replica)
  - Topic A Partition 1 (replica)
  - Topic B Partition 0 (replica)
```

</details>

---

### 3. Replication

**Replication Factor**: Number of copies of partition data

<details>
<summary>Click to view code</summary>

```
Topic: user-events
Replication Factor: 3

Partition 0:
  Leader: Broker 0 (receives writes)
  Replica 1: Broker 1 (copy)
  Replica 2: Broker 2 (copy)

If Broker 0 dies:
  Broker 1 becomes leader (automatic failover)
  Writes/reads continue on Broker 1
```

</details>

**In-Sync Replicas (ISR):**
- Replicas that are caught up with leader
- Producer waits for ISR acknowledgment (before Kafka confirms)
- If ISR < min.insync.replicas → Producer fails

<details>
<summary>Click to view code (python)</summary>

```python
# Producer settings for durability
producer = KafkaProducer(
    bootstrap_servers=['localhost:9092'],
    acks='all',  # Wait for all ISR to acknowledge
    retries=3,
    min_insync_replicas=2  # At least 2 replicas must ack
)
```

</details>

---

### 4. Offsets and Partitions

**Offset**: Position of message in partition (0, 1, 2, 3...)

<details>
<summary>Click to view code</summary>

```
Partition 0:
Offset 0: {'user_id': 123, 'action': 'login'}
Offset 1: {'user_id': 456, 'action': 'purchase', 'amount': 99.99}
Offset 2: {'user_id': 789, 'action': 'logout'}
         ↑
      Consumer reads from here
```

</details>

**Consumer offset tracking:**
- Kafka stores consumer group's current offset
- Consumer can resume from last offset after restart
- Enables exactly-once semantics

---

### 5. Consumer Groups

**Consumer Group**: Set of consumers reading same topic together

<details>
<summary>Click to view code</summary>

```
Topic: user-events (4 partitions)

Consumer Group: analytics-team
  ├─ Consumer 1 → Partition 0
  ├─ Consumer 2 → Partition 1
  ├─ Consumer 3 → Partition 2
  └─ Consumer 4 → Partition 3

Each partition read by exactly ONE consumer in group
Multiple consumers = parallel processing
```

</details>

**Rebalancing**: When consumer joins/leaves group
<details>
<summary>Click to view code</summary>

```
Initial: 2 consumers for 4 partitions
  Consumer 1: Partitions 0, 1
  Consumer 2: Partitions 2, 3

New consumer joins:
  Rebalance triggered
  Consumer 1: Partitions 0, 2
  Consumer 2: Partitions 1, 3
  Consumer 3: Partitions (empty or reassigned)
```

</details>

---

## Producers (Deep Dive)

### Producer Flow

<details>
<summary>Click to view code</summary>

```
Producer Code:
  send(topic, message)
       ↓
ProducerRecord created:
  {topic, partition, key, value, timestamp, headers}
       ↓
Partitioner determines partition:
  partition = hash(key) % num_partitions
       ↓
Add to batch buffer (waits for batch.size or linger.ms)
       ↓
Serializer converts to bytes
       ↓
Compression (gzip, snappy, lz4, zstd)
       ↓
Send to broker (batch of messages)
       ↓
Broker acknowledges (acks setting)
       ↓
Callback invoked (success or error)
```

</details>

### Producer Acknowledgments (acks)

| Setting | Behavior | Durability | Speed |
|---------|----------|-----------|-------|
| **acks=0** | No wait for ack | Fire-and-forget; data loss possible | Fastest |
| **acks=1** | Wait for leader ack | Leader acknowledged, replicas copying | Medium |
| **acks=all** | Wait for ISR ack | All replicas acknowledged | Slowest |

<details>
<summary>Click to view code (python)</summary>

```python
# Fire-and-forget (low latency, potential loss)
producer = KafkaProducer(
    acks=0,  # Don't wait
    batch_size=16384,
    linger_ms=10
)

# Balanced (medium latency, good safety)
producer = KafkaProducer(
    acks=1,  # Wait for leader
    retries=3
)

# Safe (higher latency, no data loss)
producer = KafkaProducer(
    acks='all',  # Wait for all ISR
    min_insync_replicas=2,
    retries=3
)
```

</details>

### Batching and Performance

**Batching parameters:**
<details>
<summary>Click to view code (python)</summary>

```python
producer = KafkaProducer(
    batch_size=16384,      # Send when 16KB accumulated (or linger_ms)
    linger_ms=10,          # Wait max 10ms before sending
    compression_type='snappy'  # Compress batch
)
```

</details>

**Tradeoff:**
<details>
<summary>Click to view code</summary>

```
batch_size=100B, linger_ms=0:
  - Send every message immediately
  - Latency: 1ms
  - Throughput: Low (1K messages/sec)

batch_size=1MB, linger_ms=100:
  - Accumulate 100ms worth of messages
  - Latency: 100ms
  - Throughput: High (1M messages/sec)
  - Compression: 10:1 ratio (90% smaller)
```

</details>

### Idempotent Producer

**Problem**: Network timeout causes duplicate sends

<details>
<summary>Click to view code</summary>

```
Producer sends message (offset 100)
  → Broker receives and acks
  → Ack lost (network issue)
  → Producer retries
  → Same message sent again (offset 101)
  → Duplicate in topic!
```

</details>

**Solution**: Enable idempotence

<details>
<summary>Click to view code (python)</summary>

```python
producer = KafkaProducer(
    enable_idempotence=True,  # Deduplicates retries
    acks='all',
    retries=3
)

# Kafka tracks <ProducerId, SequenceNumber>
# Retried message has same sequence number
# Broker deduplicates automatically
```

</details>

---

## Consumers (Deep Dive)

### Consumer Flow

<details>
<summary>Click to view code</summary>

```
Consumer Code:
  poll(timeout=1000)
       ↓
Request messages from broker (fetch.min.bytes, fetch.max.wait.ms)
       ↓
Broker returns batch of messages
       ↓
Deserializer converts bytes to objects
       ↓
Application processes messages
       ↓
commitSync() or commitAsync() stores offset
       ↓
Coordinator tracks offset in __consumer_offsets topic
```

</details>

### Offset Management

**Automatic offset commit** (default):
<details>
<summary>Click to view code (python)</summary>

```python
consumer = KafkaConsumer(
    'user-events',
    group_id='analytics-group',
    auto_offset_reset='earliest',  # Start from beginning if no offset
    enable_auto_commit=True,  # Auto-commit every 5 seconds
    auto_commit_interval_ms=5000
)

for message in consumer:
    process(message)
    # Offset auto-committed (5s later)
```

</details>

**Manual offset commit** (safer):
<details>
<summary>Click to view code (python)</summary>

```python
consumer = KafkaConsumer(
    'user-events',
    group_id='analytics-group',
    enable_auto_commit=False  # Don't auto-commit
)

for message in consumer:
    try:
        process(message)
        consumer.commit()  # Only commit after success
    except Exception as e:
        log_error(e)
        # Don't commit; retry from same offset
```

</details>

### Consumer Lag

**Lag**: How far behind the consumer is

<details>
<summary>Click to view code</summary>

```
Topic: user-events
Partition 0:

Latest offset (producer wrote):  100
Consumer offset:                  85
Lag:                            15

Lag = Latest offset - Consumer offset

High lag → Consumer slow or broken
Zero lag → Consumer caught up (real-time)
```

</details>

**Monitoring lag:**
<details>
<summary>Click to view code (python)</summary>

```python
from kafka.metrics import Metrics

# Track lag per partition
for partition, offset_data in consumer.committed().items():
    consumer_offset = offset_data
    latest = consumer.end_offsets([partition])[partition]
    lag = latest - consumer_offset
    print(f"Partition {partition}: lag={lag}")
```

</details>

### Rebalancing

**When does rebalancing happen?**
1. New consumer joins group
2. Consumer leaves (timeout, shutdown)
3. New partitions added to topic
4. Consumer calls leave_group()

**Rebalancing process:**
<details>
<summary>Click to view code</summary>

```
1. Stop consuming (all consumers pause)
2. Coordinator selects new partition assignment
3. Offsets revoked from old consumers
4. New assignment given to consumers
5. Resume consuming from new partitions

Impact:
- Pause: 1-30 seconds (depending on rebalance.timeout.ms)
- Data processed twice or missed (care needed)
```

</details>

**Minimize rebalancing:**
<details>
<summary>Click to view code (python)</summary>

```python
consumer = KafkaConsumer(
    group_id='analytics-group',
    session_timeout_ms=30000,      # Consumer timeout
    rebalance_timeout_ms=60000,    # Time to rejoin
    max_poll_interval_ms=300000,   # Time between polls
)
```

</details>

---

## Zookeeper vs KRaft (Controller)

### Zookeeper (Traditional)

<details>
<summary>Click to view code</summary>

```
Zookeeper Cluster:
  ├─ Zk1 (leader)
  ├─ Zk2
  └─ Zk3

Kafka Brokers:
  ├─ Broker 0 ┐
  ├─ Broker 1 │→ Query Zookeeper for metadata
  └─ Broker 2 ┘

Zookeeper stores:
  - Broker list
  - Topic configuration
  - Partition leaders
  - Consumer offsets (old versions)
```

</details>

**Issues:**
- Extra system to manage (operational overhead)
- Metadata changes take time (eventually consistent)
- Not scalable for millions of partitions

### KRaft (Kafka Raft Consensus, Kafka 3.3+)

<details>
<summary>Click to view code</summary>

```
Kafka Brokers (with embedded controller):
  ├─ Broker 0 (controller)  ← Elected leader
  ├─ Broker 1
  └─ Broker 2

No external Zookeeper needed
Metadata stored in __cluster_metadata partition
```

</details>

**Benefits:**
- Simpler deployment (one system)
- Faster metadata updates
- Scales to millions of partitions

---

## Configuration Tuning

### Producer Performance

<details>
<summary>Click to view code (properties)</summary>

```properties
# Throughput optimization
batch.size=32768                    # Larger batches
linger.ms=50                        # Wait for more messages
compression.type=snappy             # Reduce network traffic
acks=1                              # Don't wait for replicas
buffer.memory=67108864              # Larger buffer (64MB)

# Durability optimization
acks=all                            # Wait for all replicas
retries=3                           # Retry on failure
enable.idempotence=true             # Prevent duplicates
```

</details>

### Consumer Performance

<details>
<summary>Click to view code (properties)</summary>

```properties
# Throughput
fetch.min.bytes=1024                # Batch at least 1KB
fetch.max.wait.ms=500               # Wait up to 500ms
max.poll.records=500                # Process more records per poll

# Stability
session.timeout.ms=30000            # Timeout before rebalance
heartbeat.interval.ms=10000         # Send heartbeat every 10s
max.poll.interval.ms=300000         # Must poll within 5 min
```

</details>

### Broker Configuration

<details>
<summary>Click to view code (properties)</summary>

```properties
# Replication
min.insync.replicas=2               # Minimum replicas for acks=all
default.replication.factor=3        # Default copies
unclean.leader.election.enable=false # Don't elect out-of-sync leader

# Performance
num.network.threads=8               # Network threads
num.io.threads=8                    # Disk I/O threads
socket.send.buffer.bytes=102400     # 100KB send buffer
socket.receive.buffer.bytes=102400  # 100KB receive buffer
```

</details>

---

## Use Cases

### 1. Activity/Event Logging

<details>
<summary>Click to view code</summary>

```
Web servers → Kafka → Data warehouse

Real-time:
  - Page views
  - User clicks
  - Search queries
  - Video watches
  
Benefits:
  - Decouple logging from business logic
  - Multiple consumers (analytics, real-time dashboard, ML)
  - Replay events for debugging
```

</details>

### 2. Metrics Collection

<details>
<summary>Click to view code</summary>

```
Servers → Prometheus → Kafka → Time-series DB

Metrics:
  - CPU, memory, disk
  - Request latency
  - Error rates
  - Custom application metrics

Benefits:
  - Buffering during spikes
  - Multiple metric systems (Prometheus, InfluxDB)
  - Historical data in data lake
```

</details>

### 3. Real-time Analytics

<details>
<summary>Click to view code</summary>

```
User events → Kafka → Stream processor (Flink) → Results DB

Examples:
  - Real-time recommendations
  - Live dashboard metrics
  - Anomaly detection
  - Fraud detection

Benefits:
  - Millisecond latency
  - Stateful processing (session windows)
  - Exactly-once semantics
```

</details>

### 4. ETL Pipelines

<details>
<summary>Click to view code</summary>

```
Databases → Kafka Connect → Kafka → Data warehouse

Benefits:
  - CDC (Change Data Capture)
  - Decoupling source/destination
  - Exactly-once delivery
  - Connector ecosystem
```

</details>

### 5. Microservices Communication

<details>
<summary>Click to view code</summary>

```
Service A → Kafka → Service B
Service A → Kafka → Service C

Benefits:
  - Asynchronous communication
  - Event sourcing
  - Audit trail
  - Temporal decoupling
```

</details>

---

## Performance Benchmarks

### Throughput

<details>
<summary>Click to view code</summary>

```
Single broker, 3 replicas:
  Producer: 1-2 million messages/sec (1KB each = 1-2 GB/sec)
  Consumer: 2-3 million messages/sec

Cluster (10 brokers):
  1-10 million messages/sec depending on configuration
```

</details>

### Latency

<details>
<summary>Click to view code</summary>

```
End-to-end latency (producer → consumer):
  acks=0: 1-5ms (fastest)
  acks=1: 5-10ms (medium)
  acks=all: 10-20ms (safe)
  
With compression and batching:
  Average: 10-50ms for high throughput
```

</details>

### Storage

<details>
<summary>Click to view code</summary>

```
1 billion messages (1KB each):
  Raw: 1TB
  With compression (snappy): 100GB (10:1 ratio)
  
Retention (keeping 7 days):
  100K msg/sec: 8.64 billion/day → Need 100GB/day × 7 = 700GB
```

</details>

---

## Monitoring Kafka

### Key Metrics to Monitor

<details>
<summary>Click to view code</summary>

```
Producer:
  - record-send-rate (msg/sec)
  - record-size-avg (bytes/message)
  - batch-size-avg (messages/batch)
  - compression-rate-avg (reduction %)

Consumer:
  - records-consumed-rate (msg/sec)
  - consumer-lag (offset gap)
  - fetch-latency-avg (ms)

Broker:
  - BytesInPerSec (producer throughput)
  - BytesOutPerSec (consumer throughput)
  - UnderReplicatedPartitions (replication issues)
  - OfflinePartitionsCount (broker failures)
```

</details>

### Using JMX Monitoring

<details>
<summary>Click to view code (python)</summary>

```python
# Enable JMX on Kafka
export KAFKA_HEAP_OPTS="-Xmx1G -Xms1G"
export KAFKA_JVM_PERFORMANCE_OPTS="-XX:+UseG1GC -XX:MaxGCPauseMillis=20 -XX:+DisableExplicitGC"

# Monitor with tools
# - Prometheus + Kafka exporter
# - JConsole
# - Grafana dashboards
```

</details>

---

---

## Interview Questions & Answers

### Q1: Design Kafka for a ride-sharing service (10M events/sec)

**Requirements:**
- Track rides in real-time (100K rides/sec)
- Process by city (NYC, SF, LA)
- Handle surge pricing updates
- Multiple independent consumers (pricing, matching, analytics)

**Topic Design:**

<details>
<summary>Click to view code (properties)</summary>

```properties
Topic: rides
  Partitions: 100
  Replication Factor: 3
  Retention: 7 days
  Partition Key: city_id
  
Topic: surge-pricing
  Partitions: 10
  Replication Factor: 2
  Retention: 1 hour
  Partition Key: city_id
```

</details>

**Consumer Groups:**

| Group | Consumers | Purpose |
|-------|-----------|---------|
| matching-service | 10 | Real-time ride matching (1 consumer per 10 partitions) |
| pricing-service | 1 | Monitor all cities for surge pricing |
| analytics-batch | 1 | Daily aggregations (full replay) |

**Design rationale:**
- **Ordering by city**: city_id partition key ensures all city rides ordered (critical for replay)
- **Parallelism**: 100 partitions × 100K rides/sec = 1K rides/sec per partition
- **Isolation**: Different consumer groups process independently
- **Resilience**: 3x replication prevents data loss

**Debugging checklist:**

| Layer | Check |
|-------|-------|
| **Producer Config** | Correct broker? Correct topic? acks setting? |
| **Network** | Can reach broker? (telnet localhost:9092) Firewall? DNS? |
| **Broker** | Running? Disk space? Under-replicated partitions? |
| **Code** | Exception in callback? Message too large? Timeout? |
| **Consumer** | Right topic? Right starting offset? Group configured? |

**Common mistakes & fixes:**

<details>
<summary>Click to view code (python)</summary>

```python
# ❌ WRONG: Fire-and-forget, error silently lost
producer.send('my-topic', 'message')

# ✅ RIGHT: Wait for acknowledgment and catch errors
try:
    future = producer.send('my-topic', 'message')
    result = future.get(timeout=10)
except Exception as e:
    logger.error(f"Send failed: {e}")
    # Implement retry logic

# ❌ WRONG: Message too large (> max.message.bytes)
producer.send('my-topic', very_large_message)  # 10MB

# ✅ RIGHT: Compress or split
if len(message) > broker.max_message_bytes:
    message = compress(message)  # or split
```

</details>

**Quick diagnosis commands:**

<details>
<summary>Click to view code (bash)</summary>

```bash
# Verify broker is running
kafka-broker-api-versions.sh --bootstrap-server localhost:9092

# Check topic partitions and leaders
kafka-topics.sh --bootstrap-server localhost:9092 --describe --topic my-topic

# Check consumer lag
kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --group my-group --describe
```

</details>

---

### Q3: Consumer crashes. Avoid message loss or duplicates?

**Challenge**: Exactly-once semantics (not at-least-once or at-most-once)

**Solution: Manual offset commits with error handling**

<details>
<summary>Click to view code (python)</summary>

```python
consumer = KafkaConsumer(
    'input-topic',
    group_id='processing-group',
    enable_auto_commit=False,  # Manual commit ONLY
    auto_offset_reset='earliest'
)

for message in consumer:
    try:
        # Process message
        result = process(message)
        
        # Commit ONLY after successful processing
        consumer.commit()
        
    except Exception as e:
        logger.error(f"Processing failed: {e}")
        # Don't commit; resume from same offset on restart
        continue
```

</details>

**Behavior on crash:**

<details>
<summary>Click to view code</summary>

```
State 1: Process message at offset 100
         ↓
State 2: Processing completes
         ↓
State 3: About to commit offset 100
         ↓
State 4: ⚠️ CRASH

On Restart:
  Last committed offset: 99
  Consumer resumes from offset 100
  Re-processes message 100 (duplicate possible but safe)
  
Result: No message loss, possibly duplicate output
```

</details>

**Advanced: Kafka transactions (Kafka 0.11+)**

For zero duplicates with exactly-once semantics:

<details>
<summary>Click to view code (python)</summary>

```python
producer = KafkaProducer(
    transactional_id='processor-1',
    bootstrap_servers=['localhost:9092']
)

consumer = KafkaConsumer(
    'input-topic',
    isolation_level='read_committed'
)

for message in consumer:
    with producer.transaction():
        # Process
        result = process(message)
        
        # Produce + commit offset atomically
        producer.send('output-topic', result)
        consumer.commit()
        
        # All-or-nothing: both succeed or both fail
```

</details>

Crash scenarios with transactions:
- Crash before commit → rolled back, re-process on restart
- Crash after commit → already processed, skip on restart

---

### Q4: Design Kafka for a system handling 10M events/sec with 99.99% uptime requirement.

**Answer:**

**Scale analysis:**

<details>
<summary>Click to view code</summary>

```
10M events/sec × 86,400 sec/day = 864 billion events/day
× 7 day retention = 6 trillion events stored
× 1KB/event = 6 petabytes

With compression (10:1): 600TB/week (reasonable)
```

</details>

**Architecture:**

<details>
<summary>Click to view code</summary>

```
Producers (Web servers, mobile apps):
  ├─ 100 producer threads
  ├─ Batch size: 32KB, linger: 50ms
  ├─ Compression: snappy (90% reduction)
  └─ acks='all' (safety first)
           ↓
Kafka Cluster (AWS):
  ├─ 50 brokers (i3.2xlarge: high memory, NVMe SSD)
  ├─ 2000 partitions (40 partitions/broker)
  ├─ Replication factor: 3 (99.99% uptime)
  ├─ min_insync_replicas: 2
  └─ Multi-AZ (3 availability zones)
           ↓
Consumers:
  ├─ Real-time (Flink): 100 consumer threads
  ├─ Analytics (Spark): batch job 4x/day
  └─ Storage (S3): 1 consumer group
```

</details>

**High availability strategy:**

<details>
<summary>Click to view code</summary>

```
1. Replication (3x):
   - Producer writes to leader
   - Replicated to ISR (in-sync replicas)
   - If leader dies: ISR takes over
   - Zero data loss with acks='all'

2. Multi-region failover:
   - Primary: US-East (50 brokers)
   - Replica: US-West (50 brokers, read-only)
   - MirrorMaker 2 replicates topics
   - Switch on primary failure

3. Monitoring:
   - Alert if UnderReplicatedPartitions > 0
   - Alert if consumer lag > 10000
   - Circuit breaker if broker availability < 99%

4. Planned maintenance (zero downtime):
   - Rolling restart of brokers
   - One broker at a time
   - Replicas ensure no downtime
```

</details>

**Configuration:**

<details>
<summary>Click to view code (properties)</summary>

```properties
# Broker
num.replica.fetchers=4              # Faster replication
replica.socket.receive.buffer.bytes=1MB
log.flush.interval.bytes=1GB        # Reduce fsync overhead
log.cleanup.policy=delete,compact   # Delete old, compact keys

# Network
num.network.threads=16
num.io.threads=16
socket.send.buffer.bytes=1MB
socket.receive.buffer.bytes=1MB

# Topic defaults
default.replication.factor=3
min.insync.replicas=2
log.retention.days=7
compression.type=snappy
```

</details>

**Expected performance:**

<details>
<summary>Click to view code</summary>

```
Throughput:
  10M msg/sec ÷ 2000 partitions = 5000 msg/sec per partition
  With batching: 5KB/msg × 5000 = 25MB/sec per partition
  50 brokers × 40 partitions × 25MB = 50GB/sec total
  
Latency:
  P99: < 50ms (end-to-end)
  P99.99: < 100ms
  
Availability:
  Uptime: 99.99% (52 minutes downtime/year)
  With 3x replication: Achievable
```

</details>

---

### Q5: How would you implement exactly-once delivery in a payment processing pipeline?

**Answer:**

**Challenge**: Payment must be processed exactly once (not 0 or 2 times)

<details>
<summary>Click to view code</summary>

```
Scenario: Customer pays $100
  
At-most-once (bad):
  - Message lost in transit → Payment never charged
  - Customer pays but not recorded

At-least-once (bad):
  - Message retried → Charged twice
  - Customer charged $200

Exactly-once (good):
  - Payment processed once
  - Idempotent processing
  - No duplicates
```

</details>

**Solution: Kafka + Idempotent Consumer + Database**

<details>
<summary>Click to view code (python)</summary>

```python
from kafka import KafkaConsumer
import psycopg2

consumer = KafkaConsumer(
    'payment-requests',
    group_id='payment-processor',
    enable_auto_commit=False,  # Manual commit
    isolation_level='read_committed'  # Only committed data
)

db = psycopg2.connect("dbname=payments user=postgres")

for message in consumer:
    payment_request = json.loads(message.value)
    idempotency_key = payment_request['idempotency_key']
    amount = payment_request['amount']
    user_id = payment_request['user_id']
    
    try:
        # Check if already processed (idempotency)
        cursor = db.cursor()
        cursor.execute(
            "SELECT id FROM payments WHERE idempotency_key = %s",
            [idempotency_key]
        )
        
        if cursor.fetchone():
            # Already processed, skip
            logger.info(f"Payment {idempotency_key} already processed")
        else:
            # New payment, process
            cursor.execute(
                """
                INSERT INTO payments (idempotency_key, user_id, amount, status)
                VALUES (%s, %s, %s, 'PENDING')
                """,
                [idempotency_key, user_id, amount]
            )
            db.commit()
            
            # Process with payment gateway
            try:
                charge_result = payment_gateway.charge(user_id, amount)
                
                cursor.execute(
                    "UPDATE payments SET status = %s WHERE idempotency_key = %s",
                    ['SUCCESS', idempotency_key]
                )
                db.commit()
                
                # Send confirmation
                confirmation_topic.send(
                    value={
                        'idempotency_key': idempotency_key,
                        'status': 'SUCCESS',
                        'charge_id': charge_result.id
                    }
                )
            except PaymentGatewayError:
                cursor.execute(
                    "UPDATE payments SET status = %s WHERE idempotency_key = %s",
                    ['FAILED', idempotency_key]
                )
                db.commit()
                raise
        
        # Commit offset ONLY after database write
        consumer.commit()
        
    except Exception as e:
        # Don't commit; will retry
        logger.error(f"Payment processing failed: {e}")
        # Consumer resumes from last committed offset
        db.rollback()
        continue
```

</details>

**Why this works:**

<details>
<summary>Click to view code</summary>

```
Scenario 1: Consumer crashes after charge but before commit
  Restart:
    - Resume from last committed offset
    - See same payment request again
    - Idempotency check finds existing record
    - Skip (no duplicate charge)

Scenario 2: Payment gateway timeout
  Exception caught:
  - Database rollback
  - Offset not committed
  - Retry with exponential backoff
  - Eventually succeeds or explicit error

Scenario 3: Duplicate message from producer retry
  Idempotency key identical:
  - First attempt: INSERT succeeds
  - Retry: INSERT fails (duplicate key)
  - Query finds existing record
  - Returns same result (idempotent)
```

</details>

**Database schema:**

<details>
<summary>Click to view code (sql)</summary>

```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key VARCHAR(255) UNIQUE NOT NULL,
  user_id BIGINT NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  status VARCHAR(50) DEFAULT 'PENDING',
  created_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP,
  
  INDEX (idempotency_key),  -- Fast lookup
  INDEX (user_id),
  INDEX (status)
);

CREATE TABLE payment_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID REFERENCES payments(id),
  event VARCHAR(50),  -- 'INITIATED', 'SUCCESS', 'FAILED'
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

</details>

## Kafka Patterns & Best Practices

### 1. Fan-out (One-to-many)
Single producer → Kafka topic → Multiple independent consumers

### 2. Event Sourcing
All state changes stored immutably; reconstruct state by replaying events

### 3. CQRS
Command side (writes) and Query side (reads) separated with Kafka as backbone

---

## Kafka vs Alternatives

| System | Throughput | Latency | Best For |
|--------|-----------|---------|----------|
| **Kafka** | 1M+/sec | 10-100ms | Event streaming, replay, durability |
| **RabbitMQ** | 100K/sec | 1-5ms | Task queues, RPC |
| **Redis Streams** | 1M+/sec | 1-5ms | Real-time, low latency |
| **AWS Kinesis** | Managed | 1sec | AWS-native, serverless |
| **Pulsar** | 1M+/sec | 1-5ms | Multi-tenancy, geo-replication |

---

## Disaster Recovery: Architecture Comparison

### Single-Region Deployment

| Aspect | Detail |
|--------|--------|
| **Failure** | Hard outage (user traffic down, producers blocked) |
| **Data Loss** | Yes, unless producers buffer to durable storage |
| **RTO** | Hours (need region recovery or complete rebuild) |
| **RPO** | Could be high without producer-side buffering |
| **Mitigation** | Implement producer buffering (disk/S3/DB) |

**Interview answer**: "Without buffering, hard outage = data loss. With buffering, we delay processing but preserve events."

---

### Active-Passive (Replica in Standby Region)

| Aspect | Detail |
|--------|--------|
| **Failure** | Producers/consumers switch to replica region |
| **Data Loss** | Bounded by replication lag (RPO: typically < 1 sec) |
| **RTO** | 5-30 minutes (failover + rebalancing) |
| **Duplicates** | Likely (offset mismatch); use idempotent consumers |
| **Setup** | MirrorMaker/Cluster Linking replication |
| **Critical** | Must auto-redirect producers (DNS/LB) |

**Interview answer**: "Failover gives availability with bounded loss (lag) and requires idempotent consumer design."

---

### Active-Active (Both Regions Serve Traffic)

| Aspect | Detail |
|--------|--------|
| **Failure** | West-2 continues uninterrupted (minimal downtime) |
| **Data Loss** | Small (in-flight events in dead region may be lost) |
| **RTO** | Minutes (already running in standby region) |
| **Complexity** | High (split brain, conflicts, ordering limits) |
| **Requirements** | Idempotent producers/consumers, conflict resolution |
| **Ordering** | Per-key only (global ordering impossible) |

**Interview answer**: "Minimal downtime but high complexity: handle duplicates, conflicts, and ordering carefully."

---

### Database Integration (Critical!)

**Problem**: Kafka failover is useless if your DB is still single-region

| Scenario | Outcome |
|----------|---------|
| **DB only in west-1** | Writes fail in west-2 → effective outage despite Kafka failover |
| **DB with geo-replication** | West-2 can serve reads/writes (eventual consistency trade-off) |

**Key takeaway**: Kafka DR must be paired with database DR

---

### Producer-Side Buffering Pattern

**Without buffering (block on failure):**
- Fewer moving parts
- Request failures on outage
- Data loss possible

**With buffering (disk/S3/DB queue):**
- App stays responsive
- Events replay after recovery
- Backlog spike on recovery (catch-up phase)

---

### Quick Reference: 30-Second Answers

<details>
<summary>Click to view code</summary>

```
Single-region:
  "Regional outage = Kafka down. Without buffering, 
   we lose events. With buffering, we delay processing."

Active-passive:
  "Failover to replica. Accept bounded loss (replication lag) 
   and duplicates. Use idempotent consumers."

Active-active:
  "West-2 continues serving. Minimal downtime but handle 
   duplicates, conflicts, and per-key ordering only."

General:
  "Pair Kafka failover with database DR. Replication alone 
   isn't enough—clients must auto-failover."
```

</details>

---

## Summary & Key Takeaways

**Kafka excels at:**
- ✓ High-throughput systems (1M+ events/sec)
- ✓ Event-driven architectures (event sourcing, CQRS)
- ✓ Real-time processing (stream processing, analytics)
- ✓ Decoupled systems (microservices, async workflows)
- ✓ Durable systems (replication, persistence, replay)

**Key challenges:**
- ✗ Operational complexity (cluster management, monitoring)
- ✗ No global ordering (partition-scoped ordering only)
- ✗ Exactly-once requires idempotency + transactions
- ✗ Cross-region failover is complex (duplicates, conflicts)

**Critical design questions:**
1. What's my target throughput (events/sec)?
2. How long must I retain data?
3. How many independent consumer groups?
4. What's my availability SLA (RTO/RPO)?
5. Can my consumers be idempotent?
6. Do I need global or per-partition ordering?
7. Is cross-region failover required?
