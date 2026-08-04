from __future__ import annotations

import argparse

from app.services.resource.task_worker import run_resource_generation_worker_sync


def main() -> None:
    """启动资源生成后台任务 Worker。"""
    parser = argparse.ArgumentParser(description="运行资源生成后台任务 Worker。")
    parser.add_argument("--poll-interval", type=float, default=2.0, help="没有可用任务时等待的秒数。")
    args = parser.parse_args()
    run_resource_generation_worker_sync(poll_interval_seconds=args.poll_interval)


if __name__ == "__main__":
    main()
