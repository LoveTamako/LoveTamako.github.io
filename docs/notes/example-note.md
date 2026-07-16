---
title: TypeScript 类型系统笔记
date: 2026-07-12
type: notes
tags: [TypeScript, 类型系统]
description: TypeScript 类型系统的核心概念和使用技巧笔记。
---

# TypeScript 类型系统笔记

记录 TypeScript 类型系统的一些要点。

## 基础类型

- string, number, boolean
- array, tuple
- enum, any, unknown

## 高级类型

- Union Types: `string | number`
- Intersection Types: `A & B`
- Type Guards
- Generics

## 实用工具类型

- `Partial<T>` - 所有属性可选
- `Required<T>` - 所有属性必选
- `Pick<T, K>` - 选择部分属性
- `Omit<T, K>` - 排除部分属性
