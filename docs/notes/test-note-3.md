---
title: Docker 容器化部署笔记
date: 2026-07-09
type: notes
tags: [Docker, 容器化]
description: Docker 容器化部署的基础知识和常用命令。
---

# Docker 容器化部署笔记

Docker 让应用部署变得简单。

## 基础概念

- 镜像（Image）
- 容器（Container）
- 仓库（Registry）

## 常用命令

```bash
docker build -t myapp .
docker run -d -p 8080:80 myapp
docker ps
```
