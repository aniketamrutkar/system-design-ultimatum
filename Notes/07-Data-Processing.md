# Data Processing Tradeoffs

## Batch vs Stream Processing

| Aspect | Batch | Stream | When to Use |
|--------|-------|--------|-------------|
| **Latency** | High (hours) | Low (milliseconds) | Batch: reports; Stream: real-time |
| **Volume** | Large | Small (per record) | Batch: historical; Stream: live |
| **Complexity** | Simpler | Complex | Batch for simplicity |
| **Cost** | Lower | Higher | Batch for cost-sensitive |

**Why Choose Batch:**
- Daily reports, ML training, ETL jobs
- Cost-effective for non-time-sensitive

**Why Choose Stream:**
- Real-time fraud detection, live dashboards
- Event-driven architectures

**Tradeoff Summary:**
- Batch: Cost-effective ↔ High latency
- Stream: Low latency ↔ Higher cost, complexity

---

## Batch Processing Tools

| Tool | Best For | Tradeoff |
|------|----------|----------|
| **MapReduce** | Distributed batch jobs, any data size | Complex to code, slower for small data |
| **Spark** | Iterative algorithms, in-memory speed | Higher memory overhead than MapReduce |
| **Hadoop** | Reliable batch on commodity hardware | Setup complexity, slower than cloud-native |
| **Cloud Dataflow** (GCP) | Unified batch+stream, serverless | Vendor lock-in, cost higher for simple jobs |
| **AWS EMR** | Flexible Hadoop/Spark cluster | Cluster management overhead |

**Decision tree**:
- 1-100 GB data? → SQL (Redshift, BigQuery)
- 100 GB - 10 TB data? → Spark
- > 10 TB data? → Hadoop or distributed system
- Need both batch+stream? → Apache Flink or Cloud Dataflow

---

## Stream Processing Tools

| Tool | Best For | Tradeoff |
|------|----------|----------|
| **Kafka Streams** | Stream as library (low latency) | Runs on each instance, state mgmt complex |
| **Apache Flink** | Complex transformations, low latency | Steeper learning curve, operational complexity |
| **Spark Streaming** | Batch-like syntax, micro-batches | 500ms minimum latency, not true streaming |
| **AWS Kinesis** | Managed, real-time, AWS ecosystem | Higher cost, vendor lock-in |
| **Google Pub/Sub + Dataflow** | Serverless streaming | Overkill for simple jobs, cost for small volume |

**Decision tree**:
- Latency < 100ms? → Kafka Streams or Flink
- Latency 100ms-1s? → Spark Streaming
- Managed/serverless? → Kinesis or Pub/Sub + Dataflow
- Complex ETL? → Apache Flink

---

## Workflow Orchestration Tools (Airflow & Alternatives)

### Apache Airflow vs Alternatives

| Tool | Best For | Latency | Complexity | Cost | Learning Curve |
|------|----------|---------|-----------|------|-----------------|
| **Apache Airflow** | Complex DAGs, dependencies, Python workflows | Minutes to hours | High control | Low (OSS) | Moderate |
| **Prefect** | Modern workflows, error handling, UI | Minutes to hours | Medium | Low (cloud free tier) | Easy |
| **Dagster** | Data-aware orchestration, testing | Minutes to hours | Medium | Medium | Moderate |
| **Temporal** | Long-running workflows, state mgmt | Can be real-time | Very high | Medium | Hard |
| **Cron + Python** | Simple one-off jobs | Minutes | Very low | Minimal | Easy |
| **Cloud Composer** (GCP) | Managed Airflow, Google ecosystem | Minutes to hours | High control | High | Moderate |
| **AWS Step Functions** | AWS ecosystem, serverless | Seconds to hours | Low | Pay per transition | Easy |
| **Luigi** (Spotify) | Simple DAGs, quick prototyping | Minutes to hours | Low | Free (OSS) | Very easy |

### Detailed Comparison

#### Apache Airflow
**Pros:**
- Most popular, large community, extensive plugins (200+)
- Pure Python (DAGs are code)
- Rich UI with monitoring, backfill, retry
- Handles complex dependencies
- Extensive logging and alerting

**Cons:**
- Complex to set up and operate (MetaDB, Scheduler, Webserver, Workers)
- High operational overhead
- Not designed for high-frequency tasks (minute-level inefficient)
- Debugging DAGs can be difficult
- Memory overhead for large DAGs

**Best for:** Complex batch ETL pipelines, dependencies between 100+ tasks, long-running workflows

**Example:**
```python
from datetime import datetime, timedelta
from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.operators.bash import BashOperator

default_args = {
    'owner': 'data_team',
    'retries': 2,
    'retry_delay': timedelta(minutes=5),
}

dag = DAG(
    'etl_pipeline',
    default_args=default_args,
    schedule_interval='0 2 * * *',  # 2 AM daily
    start_date=datetime(2024, 1, 1),
)

def extract_data():
    # Query API
    import requests
    data = requests.get('https://api.example.com/events').json()
    return data

def transform_data(ti):
    # Get data from upstream task
    data = ti.xcom_pull(task_ids='extract')
    # Transform: filter, aggregate, clean
    transformed = [d for d in data if d['valid']]
    ti.xcom_push(key='cleaned_data', value=transformed)

def load_data(ti):
    data = ti.xcom_pull(task_ids='transform', key='cleaned_data')
    # Load to data warehouse
    import psycopg2
    conn = psycopg2.connect("dbname=warehouse")
    cur = conn.cursor()
    for row in data:
        cur.execute("INSERT INTO events VALUES (%s, %s)", row)
    conn.commit()

extract = PythonOperator(
    task_id='extract',
    python_callable=extract_data,
    dag=dag,
)

transform = PythonOperator(
    task_id='transform',
    python_callable=transform_data,
    dag=dag,
)

load = PythonOperator(
    task_id='load',
    python_callable=load_data,
    dag=dag,
)

dq_check = BashOperator(
    task_id='data_quality_check',
    bash_command='python /scripts/validate.py',
    dag=dag,
)

# Define dependencies
extract >> transform >> load >> dq_check
```

---

#### Prefect
**Pros:**
- Modern Python-first design
- Automatic retry, error handling, logging
- Better UX (cleaner API)
- Cloud-hosted option (free tier)
- Data validation built-in
- Better for experimental/evolving workflows

**Cons:**
- Smaller community than Airflow
- Less plugins available
- Vendor lock-in risk (cloud)
- Overkill for simple jobs

**Best for:** Modern teams, experimental workflows, preference for UX, cloud-native deployments

**Example:**
```python
from prefect import flow, task
from prefect.tasks.bash import bash_shell
import requests

@task(retries=2, retry_delay_seconds=300)
def extract_data():
    response = requests.get('https://api.example.com/events')
    response.raise_for_status()
    return response.json()

@task
def transform_data(data):
    # Type hints help Prefect understand data flow
    return [d for d in data if d['valid']]

@task
def load_data(data):
    # Prefect handles logging automatically
    print(f"Loading {len(data)} records")
    # Load to warehouse
    pass

@flow
def etl_pipeline():
    raw_data = extract_data()
    clean_data = transform_data(raw_data)
    load_data(clean_data)

# Schedule: every day at 2 AM
if __name__ == "__main__":
    etl_pipeline()
```

---

#### Dagster
**Pros:**
- Data-aware (understands data assets)
- Built-in testing framework
- Better for data engineering teams
- Excellent for multi-stage pipelines
- Clear separation of logic from orchestration

**Cons:**
- Steeper learning curve
- Smaller community
- Relatively new (less battle-tested)
- More opinionated structure

**Best for:** Data engineering teams, asset-oriented pipelines, testing-first culture

**Example:**
```python
from dagster import job, op, In, Out

@op
def extract_data():
    import requests
    return requests.get('https://api.example.com/events').json()

@op
def transform_data(data):
    return [d for d in data if d['valid']]

@op
def load_data(data):
    print(f"Loaded {len(data)} records to warehouse")

@job
def etl_job():
    load_data(transform_data(extract_data()))

if __name__ == "__main__":
    etl_job.execute_in_process()
```

---

#### AWS Step Functions
**Pros:**
- Fully managed (no operational overhead)
- Integrates with 200+ AWS services
- Pay per execution (low cost if infrequent)
- State machine approach (clear logic)
- Serverless

**Cons:**
- Limited to AWS ecosystem
- Cannot easily move pipelines
- Definition language is JSON (not code)
- Less flexible for complex logic

**Best for:** AWS-only shops, simple to medium workflows, low operational overhead needed

**Example (State Machine JSON):**
```json
{
  "Comment": "ETL pipeline",
  "StartAt": "ExtractData",
  "States": {
    "ExtractData": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:us-east-1:123456789:function:extract",
      "Next": "TransformData",
      "Retry": [{
        "ErrorEquals": ["States.TaskFailed"],
        "IntervalSeconds": 300,
        "MaxAttempts": 2,
        "BackoffRate": 1.0
      }]
    },
    "TransformData": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:us-east-1:123456789:function:transform",
      "Next": "LoadData"
    },
    "LoadData": {
      "Type": "Task",
      "Resource": "arn:aws:states:::dynamodb:putItem",
      "Parameters": {
        "TableName": "processed_events",
        "Item": {
          "id": {"S.$": "$.id"},
          "data": {"S.$": "$.data"}
        }
      },
      "End": true
    }
  }
}
```

---

#### Luigi (Spotify)
**Pros:**
- Extremely simple (100 lines to complete pipeline)
- Python-native
- No dependencies (works locally)
- Good for quick prototyping
- Low overhead

**Cons:**
- Limited UI (CLI only)
- Not scalable beyond 100 tasks
- No built-in retry logic
- Poor visibility
- Abandoned (less maintenance)

**Best for:** Quick prototyping, simple one-off jobs, local development

**Example:**
```python
import luigi
import requests
import pandas as pd

class ExtractData(luigi.Task):
    def output(self):
        return luigi.LocalTarget('data/raw.json')
    
    def run(self):
        data = requests.get('https://api.example.com/events').json()
        with self.output().open('w') as f:
            import json
            json.dump(data, f)

class TransformData(luigi.Task):
    def requires(self):
        return ExtractData()
    
    def output(self):
        return luigi.LocalTarget('data/transformed.csv')
    
    def run(self):
        df = pd.read_json(self.input().path)
        df = df[df['valid'] == True]
        df.to_csv(self.output().path, index=False)

class LoadData(luigi.Task):
    def requires(self):
        return TransformData()
    
    def run(self):
        df = pd.read_csv(self.input().path)
        # Load to warehouse
        print(f"Loaded {len(df)} rows")

if __name__ == '__main__':
    luigi.build([LoadData()], local_scheduler=True)
```

---

### Decision Tree: Which Orchestrator to Use?

```
START
├─ Is it AWS-only? → YES → Use Step Functions ✓
├─ Need to deploy today?
│  ├─ YES → Use Luigi or cron ✓
│  ├─ NO → Continue
├─ 100+ task dependencies?
│  ├─ YES → Use Airflow ✓
│  ├─ NO → Continue
├─ Prefer modern UI/UX?
│  ├─ YES → Use Prefect ✓
│  ├─ NO → Continue
├─ Need data asset tracking?
│  ├─ YES → Use Dagster ✓
│  ├─ NO → Airflow ✓
```

### Comparison: Real Example (Data Pipeline)

**Scenario**: ETL pipeline runs daily, 20 tasks, dependencies, needs monitoring

**Option 1: Airflow**
```
Setup: 2 weeks (MetaDB, Scheduler, config)
Code: 150 lines Python
Monitoring: Excellent UI
Operations: Requires ops team
Cost: Infrastructure + personnel
Scalability: Handles 1000+ tasks
```

**Option 2: Prefect**
```
Setup: 2 days (sign up, deploy)
Code: 100 lines Python (simpler)
Monitoring: Modern UI (cloud)
Operations: Managed (Prefect handles)
Cost: Lower (no infrastructure)
Scalability: 500+ tasks
```

**Option 3: AWS Step Functions**
```
Setup: 1 day
Code: 200 lines JSON
Monitoring: AWS CloudWatch
Operations: Fully managed
Cost: $0.25 per 1M executions
Scalability: 1000+ concurrent
```

**Option 4: Luigi**
```
Setup: Hours
Code: 50 lines Python
Monitoring: CLI only
Operations: Manual
Cost: Minimal
Scalability: 100 tasks max
```

---

### Real-World Examples

**Netflix (Airflow)**
- 10,000+ daily DAGs
- Complex dependencies across teams
- Custom operators for internal services
- Airflow chosen for: flexibility, community support

**Uber (Luigi → Spark)**
- Started with Luigi
- Migrated to Spark when data grew
- Luigi works great for startup, doesn't scale
- Lesson: Start with Luigi, migrate to Airflow/Spark when needed

**Stripe (Custom + Step Functions)**
- AWS-first architecture
- Step Functions for standard workflows
- Custom Rust scheduler for ultra-high-throughput
- Lesson: Step Functions works until you need custom control

---

### When to Use Each

| Use Airflow If | Use Prefect If | Use Step Functions If | Use Luigi If |
|---|---|---|---|
| Complex DAGs with 100+ tasks | Prefer modern UX, experimental | AWS-only ecosystem | Quick prototype, <100 tasks |
| Need extensive plugins | Small team, less ops burden | Serverless requirement | Learning, local development |
| Multi-org pipelines | Cloud-native preference | Tight AWS integration | Simple scheduled jobs |
| High operational overhead acceptable | Growth-focused team | Pay-per-execution model | Development speed matters |

---

## Lambda vs Kappa Architecture

### Lambda Architecture (Batch + Stream Hybrid)

```
Raw data → Speed layer (stream)  → Real-time results
        → Batch layer (batch)    → Batch results
        ↓
    Serving layer (merge results)
```

**Pros:**
- Real-time results (stream) + accurate (batch)
- Batch handles late data, corrections
- Stream handles live updates

**Cons:**
- Maintain two pipelines (code duplication)
- Complex synchronization
- Resource overhead (running both)

**Use when:**
- Need both speed and accuracy
- Can afford running two systems

---

### Kappa Architecture (Stream Only)

```
Raw data → Stream processing → Results

Late data → Re-stream from data lake → Re-process
```

**Pros:**
- Single pipeline (simpler)
- Less resource overhead
- Easier to maintain

**Cons:**
- Corrections harder (re-stream old data)
- Accuracy depends on stream
- Requires high-quality data

**Use when:**
- Stream quality is high
- Corrections rare
- Simplicity valued

---

## Interview Questions & Answers

### Q1: Design a fraud detection system. Batch or stream?

**Answer:**
**Stream processing** because:
- Fraud must be detected instantly (< 1 second)
- Batch (hourly) is too slow
- User's transaction in progress

**Architecture**:
```
Transaction → Kafka topic
           ↓
    Stream processor
    (checks against rules)
    - Amount > $10,000?
    - Location change > 1000km in 1 hour?
    - Unusual merchant?
           ↓
    Score: 0.0 (safe) to 1.0 (fraud)
           ↓
    If score > 0.9 → Block transaction
    If 0.5-0.9 → Ask for 2FA
    If < 0.5 → Allow
```

**Why stream, not batch?**
```
Batch (hourly):
  9:00 AM: Transaction happens (fraud)
  10:00 AM: Batch job detects fraud
  1 HOUR LATE! Fraud already processed

Stream (real-time):
  9:00 AM: Transaction happens
  9:00:100ms: Detected as fraud
  Blocked instantly
```

**Implementation** (Apache Flink):
```python
env = StreamExecutionEnvironment.get_execution_environment()

transactions = env.add_source(KafkaSource(...))

fraud_scores = transactions.map(calculate_fraud_score)
               .filter(lambda x: x['score'] > 0.5)
               .sink_to(BlockedTransactionsSink())

env.execute("Fraud Detection")
```

---

### Q2: Design a daily analytics pipeline. Batch or stream?

**Answer:**
**Batch processing** because:
- Non-time-critical (daily reports)
- Can process large volume (cost-efficient)
- Accuracy more important than speed

**Architecture**:
```
Day 1: 9 PM
  All events for Day 1 accumulated in data lake
  
Day 1: 11 PM
  Batch job starts:
  - Read 1TB of events
  - Group by user, device, country
  - Generate metrics
  - Load into data warehouse
  
Day 2: 12 AM
  Reports available (1 hour after day ends)
  Analytics team reviews
```

**Why batch, not stream?**
```
Stream (real-time):
- Process 1M events/sec continuously
- High CPU/memory cost: 24/7
- Overkill for next-day reports

Batch (12 hours at night):
- Process 86.4B events in 12-hour window
- Cost: 1/2 (run half the day)
- Simpler to debug (re-run if error)
```

**Cost analysis**:
```
Stream: 1000 instances × $0.10/hour × 24 hours = $2,400/day
Batch: 1000 instances × $0.10/hour × 12 hours = $1,200/day

Savings: $1,200/day or $400K/year
Plus: Simpler to maintain, easier to correct errors
```

---

### Q3: Design an e-commerce recommendation system. Lambda or Kappa?

**Answer:**
**Lambda architecture** (hybrid):

```
Real-time layer (stream):
  - User views product X
  - Immediately recommend similar
  - Based on live session

Batch layer:
  - Daily: Recalculate models
  - Feedback: Which recommendations worked?
  - Update ML models

Serving layer:
  - Merge both sources
  - Pick best recommendations
```

**Why Lambda?**
- Speed: Real-time recommendations on every click
- Accuracy: Batch training improves models daily
- Feedback: Batch learns from yesterday's recommendations

**Example**:
```
User browsing electronics → Stream processor
    "User browsing laptops"
        ↓
    Real-time: Show similar laptops (instant)
        ↓
    Batch (daily): Did user buy? Feedback to model
        ↓
    Next day: Model improves (recommendation better)
```

**Implementation**:
```python
# Stream layer
def real_time_recommend(user_id, product_id):
    similar = redis.get(f"similar:{product_id}")
    return similar or default_similar  # Fast

# Batch layer
def train_recommendations_daily():
    # Read all transactions from yesterday
    feedback = get_yesterday_transactions()
    
    # Train ML model
    model = train_ml_model(feedback)
    
    # Store precomputed recommendations
    for product in all_products:
        similar = model.predict_similar(product)
        redis.set(f"similar:{product}", similar)

# Serving layer
def get_recommendations(user_id, product_id):
    return real_time_recommend(user_id, product_id)
    # Or: merge with batch ML scores if needed
```

---

### Q4: Your batch job takes 6 hours. Users need reports in 1 hour. What now?

**Answer:**
**Three options**:

**Option 1: Incremental batch** (fastest fix)
```
Old: Process all 1TB at 9 PM (6 hours)
New: 
  - 8 PM: Process only CHANGES since last run (100GB)
  - 2 PM: Process CHANGES since 8 PM (50GB)
  - 6 PM: Process CHANGES since 2 PM (30GB)
  - 9 PM: Process remaining changes (20GB)

Result: Reports every 2 hours (not 6)
```

**Option 2: Approximate batch** (speed + slight accuracy loss)
```
New: Process 50% sample of data (3 hours)
Result: ~95% accuracy in 3 hours

Better than 6 hours of full accuracy
```

**Option 3: Streaming** (best but complex)
```
Move to stream processing
Real-time aggregation
Reports always current

Complexity: Need to rewrite pipeline
```

**Recommendation**: Start with **Option 1** (incremental)
- Minimum code changes
- Faster results
- Proven approach

**Code example (incremental)**:
```python
def batch_job():
    last_checkpoint = redis.get("batch:checkpoint") or "2024-01-01"
    
    # Process only new data
    new_events = db.query(f"""
        SELECT * FROM events 
        WHERE timestamp > {last_checkpoint}
    """)
    
    # Aggregate
    metrics = process(new_events)
    
    # Store results
    results_db.insert(metrics)
    
    # Save checkpoint
    redis.set("batch:checkpoint", now())
    
    # Next run: start from here (50GB instead of 1TB)
```

---

### Q5: Design a real-time data warehouse for 1M events/sec.

**Answer:**
**Streaming + Columnar storage**:

```
Events → Kafka (buffering)
      ↓
Stream processor (Apache Flink)
  - Aggregate by (user, device, country)
  - Window: 1 minute
  - Calculate metrics
      ↓
Columnar store (Druid or ClickHouse)
  - Optimized for analytics queries
  - High cardinality (billions of values)
  - Fast range scans
      ↓
User queries
  "Show traffic by country last hour"
  "Revenue by device type today"
```

**Why columnar?**
```
Row-oriented (traditional DB):
Row 1: user_id, device, country, revenue, timestamp
Row 2: user_id, device, country, revenue, timestamp
Query: "Sum revenue by country"
→ Must read entire rows (includes user_id, device, timestamp you don't need)

Columnar (Druid):
Column: [user_id, user_id, user_id, ...]
Column: [device, device, device, ...]
Column: [country, country, country, ...]
Column: [revenue, revenue, revenue, ...]
Query: "Sum revenue by country"
→ Only read country and revenue columns (ignore user_id, device, timestamp)
→ 10x faster
```

**Architecture**:
```
1M events/sec → Kafka → Flink stream job (aggregation)
                              ↓
                        Micro-batches (1 sec windows)
                              ↓
                        Druid (columnar index)
                              ↓
                        Analytics queries (drill down by any dimension)
```

**Cost comparison**:
```
Traditional: 1M events/sec → PostgreSQL
Cost: Expensive (row-oriented not suited for this)

Columnar: 1M events/sec → Druid
Cost: 1/10th (columnar compression + efficient scans)

Result: Real-time analytics at scale, affordable
```

