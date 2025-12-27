# Apache Kafka - Complete Deep Dive

## What is Kafka?

**Apache Kafka** is a distributed event streaming platform designed for:
- Publishing and subscribing to streams of events (logs, metrics, transactions)
- Storing streams durably and reliably
- Processing streams in real-time
- High throughput (millions of events/second)
- Low latency (milliseconds)

**Key characteristics:**
- Distributed (runs on multiple servers)
- Fault-tolerant (replicates data)
- Scalable (add servers, increase throughput)
- Durable (persists to disk)
- Stream-oriented (ordered events)

---

## Kafka Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     KAFKA CLUSTER                           │
├──────────────┬──────────────┬──────────────┬──────────────┐
│   Broker 1   │   Broker 2   │   Broker 3   │   Broker N   │
│ ┌─────────┐  │ ┌─────────┐  │ ┌─────────┐  │ ┌─────────┐  │
│ │ Topic A │  │ │ Topic B │  │ │ Topic A │  │ │ Topic C │  │
│ │Part 0,1 │  │ │ Part 0  │  │ │Part 2,3 │  │ │ Part 0  │  │
│ └─────────┘  │ └─────────┘  │ └─────────┘  │ └─────────┘  │
└──────────────┴──────────────┴──────────────┴──────────────┘
       ↑              ↑              ↑              ↑
       └──────────────┴──────────────┴──────────────┘
              Controlled by Zookeeper/KRaft
       
┌─────────────────────────────────────────────────────────────┐
│                     ZOOKEEPER CLUSTER                        │
│         (Metadata, Leader Election, Failover)              │
└─────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. Topics and Partitions

**Topic**: A stream/channel of events (like a table in a database)

```
Topic: user-events

Partition 0:  [event1] → [event2] → [event3] → [event4]
Partition 1:  [event5] → [event6] → [event7]
Partition 2:  [event8] → [event9]
```

**Why partitions?**
- Parallelism: Multiple consumers can read different partitions simultaneously
- Throughput: Spread writes across partitions
- Ordering: Events in same partition are ordered (globally unordered)

**Partition assignment strategy**:
- **Round-robin**: Distribute across partitions evenly
- **By key**: Events with same key go to same partition (ordering guaranteed)

```python
# Example: User ID as key
producer.send(
    topic='user-events',
    value={'action': 'login'},
    key='user123'  # All user123 events go to same partition
)
```

---

### 2. Brokers

**Broker**: A single Kafka server in the cluster

Each broker:
- Stores partition replicas
- Handles producer/consumer requests
- Replicates data to other brokers

**Broker ID**: 0, 1, 2, N (unique identifier)

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

---

### 3. Replication

**Replication Factor**: Number of copies of partition data

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

**In-Sync Replicas (ISR):**
- Replicas that are caught up with leader
- Producer waits for ISR acknowledgment (before Kafka confirms)
- If ISR < min.insync.replicas → Producer fails

```python
# Producer settings for durability
producer = KafkaProducer(
    bootstrap_servers=['localhost:9092'],
    acks='all',  # Wait for all ISR to acknowledge
    retries=3,
    min_insync_replicas=2  # At least 2 replicas must ack
)
```

---

### 4. Offsets and Partitions

**Offset**: Position of message in partition (0, 1, 2, 3...)

```
Partition 0:
Offset 0: {'user_id': 123, 'action': 'login'}
Offset 1: {'user_id': 456, 'action': 'purchase', 'amount': 99.99}
Offset 2: {'user_id': 789, 'action': 'logout'}
         ↑
      Consumer reads from here
```

**Consumer offset tracking:**
- Kafka stores consumer group's current offset
- Consumer can resume from last offset after restart
- Enables exactly-once semantics

---

### 5. Consumer Groups

**Consumer Group**: Set of consumers reading same topic together

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

**Rebalancing**: When consumer joins/leaves group
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

---

## Producers (Deep Dive)

### Producer Flow

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

### Producer Acknowledgments (acks)

| Setting | Behavior | Durability | Speed |
|---------|----------|-----------|-------|
| **acks=0** | No wait for ack | Fire-and-forget; data loss possible | Fastest |
| **acks=1** | Wait for leader ack | Leader acknowledged, replicas copying | Medium |
| **acks=all** | Wait for ISR ack | All replicas acknowledged | Slowest |

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

### Batching and Performance

**Batching parameters:**
```python
producer = KafkaProducer(
    batch_size=16384,      # Send when 16KB accumulated (or linger_ms)
    linger_ms=10,          # Wait max 10ms before sending
    compression_type='snappy'  # Compress batch
)
```

**Tradeoff:**
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

### Idempotent Producer

**Problem**: Network timeout causes duplicate sends

```
Producer sends message (offset 100)
  → Broker receives and acks
  → Ack lost (network issue)
  → Producer retries
  → Same message sent again (offset 101)
  → Duplicate in topic!
```

**Solution**: Enable idempotence

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

---

## Consumers (Deep Dive)

### Consumer Flow

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

### Offset Management

**Automatic offset commit** (default):
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

**Manual offset commit** (safer):
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

### Consumer Lag

**Lag**: How far behind the consumer is

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

**Monitoring lag:**
```python
from kafka.metrics import Metrics

# Track lag per partition
for partition, offset_data in consumer.committed().items():
    consumer_offset = offset_data
    latest = consumer.end_offsets([partition])[partition]
    lag = latest - consumer_offset
    print(f"Partition {partition}: lag={lag}")
```

### Rebalancing

**When does rebalancing happen?**
1. New consumer joins group
2. Consumer leaves (timeout, shutdown)
3. New partitions added to topic
4. Consumer calls leave_group()

**Rebalancing process:**
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

**Minimize rebalancing:**
```python
consumer = KafkaConsumer(
    group_id='analytics-group',
    session_timeout_ms=30000,      # Consumer timeout
    rebalance_timeout_ms=60000,    # Time to rejoin
    max_poll_interval_ms=300000,   # Time between polls
)
```

---

## Zookeeper vs KRaft (Controller)

### Zookeeper (Traditional)

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

**Issues:**
- Extra system to manage (operational overhead)
- Metadata changes take time (eventually consistent)
- Not scalable for millions of partitions

### KRaft (Kafka Raft Consensus, Kafka 3.3+)

```
Kafka Brokers (with embedded controller):
  ├─ Broker 0 (controller)  ← Elected leader
  ├─ Broker 1
  └─ Broker 2

No external Zookeeper needed
Metadata stored in __cluster_metadata partition
```

**Benefits:**
- Simpler deployment (one system)
- Faster metadata updates
- Scales to millions of partitions

---

## Configuration Tuning

### Producer Performance

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

### Consumer Performance

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

### Broker Configuration

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

---

## Use Cases

### 1. Activity/Event Logging

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

### 2. Metrics Collection

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

### 3. Real-time Analytics

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

### 4. ETL Pipelines

```
Databases → Kafka Connect → Kafka → Data warehouse

Benefits:
  - CDC (Change Data Capture)
  - Decoupling source/destination
  - Exactly-once delivery
  - Connector ecosystem
```

### 5. Microservices Communication

```
Service A → Kafka → Service B
Service A → Kafka → Service C

Benefits:
  - Asynchronous communication
  - Event sourcing
  - Audit trail
  - Temporal decoupling
```

---

## Performance Benchmarks

### Throughput

```
Single broker, 3 replicas:
  Producer: 1-2 million messages/sec (1KB each = 1-2 GB/sec)
  Consumer: 2-3 million messages/sec

Cluster (10 brokers):
  1-10 million messages/sec depending on configuration
```

### Latency

```
End-to-end latency (producer → consumer):
  acks=0: 1-5ms (fastest)
  acks=1: 5-10ms (medium)
  acks=all: 10-20ms (safe)
  
With compression and batching:
  Average: 10-50ms for high throughput
```

### Storage

```
1 billion messages (1KB each):
  Raw: 1TB
  With compression (snappy): 100GB (10:1 ratio)
  
Retention (keeping 7 days):
  100K msg/sec: 8.64 billion/day → Need 100GB/day × 7 = 700GB
```

---

## Monitoring Kafka

### Key Metrics to Monitor

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

### Using JMX Monitoring

```python
# Enable JMX on Kafka
export KAFKA_HEAP_OPTS="-Xmx1G -Xms1G"
export KAFKA_JVM_PERFORMANCE_OPTS="-XX:+UseG1GC -XX:MaxGCPauseMillis=20 -XX:+DisableExplicitGC"

# Monitor with tools
# - Prometheus + Kafka exporter
# - JConsole
# - Grafana dashboards
```

---

## Interview Questions & Answers

### Q1: How would you design Kafka topic partitioning for a ride-sharing service?

**Answer:**

**Requirements:**
- Track rides in real-time (100K rides/sec)
- Process by city (NYC, SF, LA)
- Handle surge pricing updates
- Feed to multiple consumers (pricing, matching, analytics)

**Topic Design:**

```
Topic: rides
Partitions: 100
Replication Factor: 3
Retention: 7 days

Partition key: city_id
  - All NYC rides → same partition
  - All SF rides → different partition
  - Guarantees ordering per city
```

**Topic: surge-pricing
Partitions: 10
Replication Factor: 2
Retention: 1 hour

Partition key: city_id
  - Frequent updates (multiple consumers)
  - Lower durability (TTL not critical)
```

**Consumer Groups:**

```
Consumer Group: matching-service
  - 10 consumers
  - Each handles 10 partitions
  - Real-time ride matching

Consumer Group: pricing-service
  - Monitors all cities
  - Updates surge pricing
  - Same topic, different group

Consumer Group: analytics-batch
  - Reads all events (replay)
  - Daily aggregations
  - 1 consumer (no parallelism needed)
```

**Why this design?**
- **Ordering**: All rides from same city ordered (important for replay)
- **Scalability**: 100 partitions allow 100 concurrent riders
- **Flexibility**: Multiple consumers independently
- **Failover**: 3 replicas ensure no data loss

---

### Q2: Producer sends message but it's not received. What could be wrong?

**Answer:**

**Debugging checklist:**

```
1. Producer Configuration
   - Correct broker address?
   - Correct topic name?
   - acks setting too strict?

2. Network Issues
   - Can producer reach broker? (telnet localhost:9092)
   - Firewall blocking?
   - DNS resolution working?

3. Broker Status
   - Broker running? (zookeeper shows broker in cluster?)
   - Disk space full?
   - Under-replicated partitions?

4. Producer Code
   - Exception in callback?
   - Message too large (> max.message.bytes)?
   - Timeout before ack received?

5. Consumer Side
   - Consumer reading correct topic?
   - Starting from correct offset?
   - Consumer group properly configured?
```

**Common issues:**

```python
# WRONG: No error checking
producer.send('my-topic', 'message')
# Fire-and-forget; error silently ignored

# RIGHT: Check for errors
try:
    future = producer.send('my-topic', 'message')
    result = future.get(timeout=10)  # Wait for ack
    print(f"Message sent to {result.topic} partition {result.partition}")
except Exception as e:
    print(f"Send failed: {e}")
    # Retry logic here

# WRONG: Message too large
producer.send('my-topic', very_large_message)  # 10MB
# Error: MessageSizeTooLarge

# RIGHT: Check message size
if len(message) > broker_config.max_message_bytes:
    # Split message or compress
    pass
```

**Diagnosis command:**

```bash
# Check broker is running
kafka-broker-api-versions.sh --bootstrap-server localhost:9092

# Check topic exists and has partitions
kafka-topics.sh --bootstrap-server localhost:9092 --describe --topic my-topic

# Check consumer group lag
kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --group my-group --describe
```

---

### Q3: Consumer group crashes. How do you resume without losing/duplicating messages?

**Answer:**

**Challenge**: Exactly-once semantics (not at-least-once or at-most-once)

**Solution: Transactional Processing**

```python
from kafka import KafkaConsumer, KafkaProducer

consumer = KafkaConsumer(
    'input-topic',
    group_id='processing-group',
    enable_auto_commit=False,  # Manual commit only
    auto_offset_reset='earliest'
)

producer = KafkaProducer(
    bootstrap_servers=['localhost:9092']
)

for message in consumer:
    try:
        # Process message
        result = process(message)
        
        # Send result
        producer.send('output-topic', result)
        
        # Commit ONLY after processing and producing
        consumer.commit()
        
    except Exception as e:
        # Error: don't commit
        # Consumer resumes from last committed offset
        logger.error(f"Processing failed: {e}")
        # Retry logic with exponential backoff
        
        continue
```

**Flow on crash:**

```
1. Process message at offset 100
2. Produce output
3. About to commit offset 100
4. Consumer crashes

On restart:
5. Consumer resumes from last committed offset (99)
6. Re-processes offset 100 (duplicate possible but OK)
7. Same output produced (idempotent)

Result: No message loss, possibly duplicated output
```

**Advanced: Exactly-once with Kafka transactions**

```python
# Kafka 0.11+ supports transactions
from kafka import KafkaProducer, KafkaConsumer

consumer = KafkaConsumer(
    'input-topic',
    isolation_level='read_committed'  # Only read committed messages
)

producer = KafkaProducer(
    transactional_id='processor-1',  # Enable transactions
    bootstrap_servers=['localhost:9092']
)

for message in consumer:
    with producer.transaction():
        # Process
        result = process(message)
        
        # Produce
        producer.send('output-topic', result)
        
        # Send offset to commit in same transaction
        consumer.commit()
        # All-or-nothing: both produced OR neither

# If crash between produce and commit:
# On restart: Transaction rolled back, re-process
# If crash after commit: Already processed, skip
```

---

### Q4: Design Kafka for a system handling 10M events/sec with 99.99% uptime requirement.

**Answer:**

**Scale analysis:**

```
10M events/sec × 86,400 sec/day = 864 billion events/day
× 7 day retention = 6 trillion events stored
× 1KB/event = 6 petabytes

With compression (10:1): 600TB/week (reasonable)
```

**Architecture:**

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

**High availability strategy:**

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

**Configuration:**

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

**Expected performance:**

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

---

### Q5: How would you implement exactly-once delivery in a payment processing pipeline?

**Answer:**

**Challenge**: Payment must be processed exactly once (not 0 or 2 times)

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

**Solution: Kafka + Idempotent Consumer + Database**

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

**Why this works:**

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

**Database schema:**

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

**Testing (ensuring exactly-once):**

```python
def test_duplicate_message():
    """Simulate consumer processing same message twice"""
    
    # Send payment request
    send_payment(idempotency_key='test-123', amount=100)
    
    # Consumer processes first time
    assert db.count("SELECT * FROM payments WHERE status='SUCCESS'") == 1
    
    # Simulate duplicate (producer retry)
    send_payment(idempotency_key='test-123', amount=100)
    
    # Consumer processes second time
    # Should still be exactly 1 payment
    assert db.count("SELECT * FROM payments WHERE status='SUCCESS'") == 1
    
    # User charged only once
    assert user_balance == original_balance - 100
```

---

## Common Kafka Patterns

### Fan-out Pattern (One-to-many)

```
Single producer → Kafka topic → Multiple consumers

Product events:
  ├─ Inventory service (update stock)
  ├─ Recommendation service (user preferences)
  ├─ Analytics (track trends)
  └─ Warehouse (fulfillment)

All independently process same events
```

### Event Sourcing

```
Store all state changes as immutable events

Application state = Replay all events from beginning

Benefits:
  - Complete audit trail
  - Time-travel (state at any point)
  - Event-driven debugging
```

### CQRS (Command Query Responsibility Segregation)

```
Command side (writes):
  Write model → Kafka → Event store

Query side (reads):
  Event store → Build read models → Queries

Decouples write and read optimization
```

---

## Kafka vs Other Systems

| System | Throughput | Latency | Use Case |
|--------|-----------|---------|----------|
| **Kafka** | Very High (1M+) | Low (10-100ms) | Event streaming, event sourcing |
| **RabbitMQ** | Medium (100K) | Very Low (1ms) | Task queues, RPC |
| **Redis Streams** | High (1M) | Very Low (1ms) | Rate limiting, sessions, real-time |
| **AWS Kinesis** | High (managed) | Low (1sec) | AWS native, serverless |
| **Pulsar** | Very High (1M+) | Very Low (1ms) | Multi-tenancy, geo-replication |

**Choose Kafka if:**
- Need high throughput (1M+ msg/sec)
- Event streaming and replay important
- Multiple consumers independently
- Long retention needed

**Choose RabbitMQ if:**
- Message queuing (task distribution)
- RPC patterns (request-response)
- Lower throughput acceptable
- Complex routing needed

