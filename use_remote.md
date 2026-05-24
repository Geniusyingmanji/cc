# 远端机器使用说明

## 可用机器列表

### 本地服务器（当前）
- **IP**: 10.2.170.119
- **GPU**: 8× A800 80GB（索引 0-7，实际常用 0-3）
- **用途**: Tool 模型（GroundingDINO, DA3, Florence, SAM2, VGGT, MoGe 等），Ray Serve

### H200 服务器（主力推理）
- **IP**: 33.235.207.40
- **SSH Port**: 8022
- **GPU**: 8× H200 141GB
- **当前部署**: Qwen3-VL-235B-A22B-Thinking，vLLM port **8031**，PID 1439103
- **vLLM 参数**: tp=8, max-model-len=8192, max-num-seqs=4, dtype=bfloat16, gpu-memory-utilization=0.85
- **注意**: 有占卡程序，见下方说明

### H200 服务器 B (33.236.229.113)
- **IP**: 33.236.229.113
- **SSH Port**: 8022
- **GPU**: 8× H200 141GB
- **状态**: 在线，显存几乎满载（128-140GB/卡），有重度训练任务在跑
- **最后检查**: 2026-04-25

### H200 服务器 C (33.235.207.4)
- **IP**: 33.235.207.4
- **SSH Port**: 8022
- **GPU**: 8× H200 141GB
- **状态**: 在线，显存有余量（28-54GB/卡），利用率高但可能是占卡程序
- **最后检查**: 2026-04-25

### H100 服务器（不可达）
- **IP**: 10.238.29.47
- **GPU**: 8× H100 80GB
- **状态**: 不可达（No route to host），最后检查 2026-04-25

### 不可达服务器
- **10.245.251.229:8022** — 不可达（2026-04-25）
- **33.235.220.61:8022** — 不可达（2026-04-25）
- **33.236.218.121:8022** — 不可达（2026-04-25）

### CPU 服务器（跳板+下载）
- **IP**: 10.24.173.16，Port 8419
- **用途**: 中转跳板，有公网访问权限（可 HuggingFace 下载）
- **模型存储**: `/mnt/dolphinfs/ssd_pool/docker/user/hadoop-nlp-sh02/native_mm/zhangquan/`（dolphinfs 共享，H200/H100 均可访问）

### 外部跳板
- **IP**: 47.99.241.174，Port 30666

---

## SSH 连接方式（三跳，用 paramiko）

连接路径：`本地 → 47.99.241.174:30666 → 10.24.173.16:8419 → 目标 GPU 服务器`

```python
import paramiko

WINDOW = 128 * 1024 * 1024


def client():
    x = paramiko.SSHClient()
    x.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    return x

# 注意：用户名和密码已从迁移文档中去除，实际使用时请自行补充凭据。

# 第一跳：外部跳板
j1 = client()
j1.connect('47.99.241.174', port=30666, username='YOUR_USER', password='YOUR_PASSWORD',
           timeout=30, look_for_keys=False, allow_agent=False)
t1 = j1.get_transport(); t1.set_keepalive(30); t1.default_window_size = WINDOW

# 第二跳：CPU 服务器
cpu = client()
s1 = t1.open_channel('direct-tcpip', ('10.24.173.16', 8419), ('127.0.0.1', 0))
cpu.connect('10.24.173.16', port=8419, username='YOUR_USER', password='YOUR_PASSWORD',
            sock=s1, timeout=30, look_for_keys=False, allow_agent=False)
t2 = cpu.get_transport(); t2.set_keepalive(30); t2.default_window_size = WINDOW

# 第三跳：GPU 服务器（H200）
gpu = client()
s2 = t2.open_channel('direct-tcpip', ('33.235.207.40', 8022), ('127.0.0.1', 0))
gpu.connect('33.235.207.40', port=8022, username='YOUR_USER', password='YOUR_PASSWORD',
            sock=s2, timeout=30, look_for_keys=False, allow_agent=False)

_, stdout, _ = gpu.exec_command("nvidia-smi")
print(stdout.read().decode())
```

---

## 本地访问 H200 vLLM（隧道）

```bash
# 启动隧道（后台运行），本地 8099 -> H200:8031
python3 /nfsdata-117/quantaalpha/zyf/connect_235b.sh 8099 &

# 验证
curl http://localhost:8099/v1/models

# Agent 使用方式
AGENT_COT_REASONER_MODEL='Qwen3-VL-235B-A22B-Thinking' \
AGENT_COT_REASONER_BASE_URL='http://localhost:8099/v1' \
...
```

---

## 占卡程序注意事项

H200/H100 服务器上运行着**轮巡占卡程序**（`god.py` + `train/train.py`）：
- GPU 利用率 < 30% 时自动启动，占用约 **10GB 显存 + 70% 利用率**
- GPU 利用率 > 30% 时自动退出
- **不要 kill `god.py` 和 `train/train.py`**，否则服务器会直接中断

正确做法：登录服务器后直接运行自己的脚本，占卡程序检测到高利用率后会**自动退出**。

---

## H200 vLLM 重启命令

```bash
CUDA_VISIBLE_DEVICES="0,1,2,3,4,5,6,7" \
NCCL_TIMEOUT=1800 \
VLLM_WORKER_MULTIPROC_METHOD=spawn \
TORCHDYNAMO_DISABLE=1 \
/mnt/dolphinfs/.../vlse/bin/python -u -m vllm.entrypoints.openai.api_server \
  --model /mnt/dolphinfs/.../Qwen3-VL-235B-A22B-Thinking \
  --host 0.0.0.0 --port 8031 --tensor-parallel-size 8 \
  --served-model-name Qwen3-VL-235B-A22B-Thinking --trust-remote-code \
  --gpu-memory-utilization 0.70 --max-model-len 8192 --max-num-seqs 8 \
  --dtype bfloat16 \
  --enforce-eager
```

注意：
- 需要 `TORCHDYNAMO_DISABLE=1` 和 `--enforce-eager`，否则首次推理可能触发 `torch._dynamo` 编译崩溃。
- `gpu-memory-utilization=0.70` 是为占卡程序预留余量；若占卡程序已退出，可上调到 `0.85`。
- `--reasoning-parser qwen3` 会导致 worker crash，不要加。

完整路径前缀：`/mnt/dolphinfs/ssd_pool/docker/user/hadoop-nlp-sh02/native_mm/zhangquan/`
- Python env: `agent/xl/rick/envs/vlse/bin/python`
- 模型目录: `code/models/Qwen3-VL-235B-A22B-Thinking/`
- Log: `code/models/Qwen3-VL-235B-A22B-Thinking/vllm_launch.log`

---

## dolphinfs 路径

所有节点共享：

```text
/mnt/dolphinfs/ssd_pool/docker/user/hadoop-nlp-sh02/native_mm/zhangquan/
├── code/models/          # 模型权重
├── agent/xl/rick/envs/   # Python 环境 (vlse)
└── ...
```
