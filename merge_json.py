"""
Author: Dorad, ddxid@outlook.com
Date: 2024-10-08 20:36:41 +08:00
LastEditors: Dorad, ddxid@outlook.com
LastEditTime: 2024-10-08 20:47:14 +08:00
FilePath: \merge_json.py
Description: 

Copyright (c) 2024 by Dorad (ddxid@outlook.com), All Rights Reserved.
"""

# 将data/**下所有*.json文件全部合并为一个文件
import os, json
from pathlib import Path
from datetime import datetime


def find_json_files(directory):
    path = Path(directory)
    return list(path.rglob("*.json"))


json_files = find_json_files("data")
print(json_files)

# 读取所有json文件, 将其dict的values合并为一个list
data = []
for file in json_files:
    with file.open(encoding="utf-8") as f:
        new_data = json.load(f)
        if isinstance(new_data, dict):
            new_data = new_data.values()
        data.extend(sum(new_data, []))
    print(f"Read {file} done.")

# 将tm由timestamp转为时间字符串, ms
for item in data:
    item["tm"] = datetime.fromtimestamp(int(item["tm"]) / 1000).strftime(
        "%Y-%m-%d %H:%M:%S"
    )

# 将合并后的list写入到一个新的json文件中
with open("merged.json", "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
