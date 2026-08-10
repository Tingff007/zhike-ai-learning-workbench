import React from 'react'
import CodeEditor from '../../components/sandbox/CodeEditor'

/**
 * SandboxPage
 * - 学生端代码沙箱演示页面
 * - 支持 Python / JavaScript 双模式运行
 */
export default function SandboxPage(): JSX.Element {
  return (
    <main style={{ padding: 16 }}>
      <h2 style={{ margin: '8px 0' }}>代码沙箱</h2>
      <p style={{ color: '#6b7280', marginBottom: 16 }}>
        该页面展示可执行代码编辑器，支持 Python 后端执行与 JavaScript 前端沙箱执行。
      </p>
      <div style={{ maxWidth: 1040 }}>
        <CodeEditor />
      </div>
    </main>
  )
}
