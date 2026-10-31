#!/usr/bin/env node
/**
 * 校验版本号一致性：
 * 1. package.json 与 public/manifest.json 的 version 必须相同（扩展商店按 manifest 版本判重）
 * 2. 若由 Git 标签触发（GITHUB_REF_TYPE=tag），标签必须等于 v + 版本号
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => JSON.parse(readFileSync(resolve(root, p), 'utf8'))

const pkg = read('package.json')
const manifest = read('public/manifest.json')

let failed = false

if (pkg.version !== manifest.version) {
  console.error(`✗ 版本不一致：package.json=${pkg.version} / public/manifest.json=${manifest.version}`)
  failed = true
} else {
  console.log(`✓ 版本一致：${pkg.version}`)
}

const { GITHUB_REF_NAME: tag, GITHUB_REF_TYPE: refType } = process.env
if (refType === 'tag' && tag) {
  const expected = `v${pkg.version}`
  if (tag !== expected) {
    console.error(`✗ 标签与版本不匹配：tag=${tag} / 期望 ${expected}`)
    failed = true
  } else {
    console.log(`✓ 标签匹配：${tag}`)
  }
}

process.exit(failed ? 1 : 0)
