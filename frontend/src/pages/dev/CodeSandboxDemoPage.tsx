import React from 'react'
import CodeEditor from '../../components/sandbox/CodeEditor'

/**
 * CodeSandbox 演示页
 * - 演示如何在页面中使用 `CodeEditor` 组件
 */
export default function CodeSandboxDemoPage(): JSX.Element {
  return (
    <main style={{ padding: 16 }}>
      <h2 style={{ margin: '8px 0' }}>代码沙箱演示</h2>
      <p style={{ color: '#6b7280', marginBottom: 12 }}>支持切换 Python（后端）与 JavaScript（前端沙箱）模式。</p>
      <div style={{ maxWidth: 980 }}>
        <CodeEditor />
      </div>
    </main>
  )
}
