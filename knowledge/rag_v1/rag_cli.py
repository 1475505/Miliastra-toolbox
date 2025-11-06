#!/usr/bin/env python3
"""
RAG原子能力应用命令行入口
"""

import sys
from pathlib import Path

# 抑制 transformers 库的框架警告（必须在其他导入之前）
import os
os.environ['TRANSFORMERS_NO_ADVISORY_WARNINGS'] = '1'

# 添加src目录到Python路径
src_dir = Path(__file__).parent / "src"
sys.path.insert(0, str(src_dir))

from src.cli import cli

if __name__ == "__main__":
    cli()