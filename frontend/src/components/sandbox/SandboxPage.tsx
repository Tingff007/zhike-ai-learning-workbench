import { useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import CodeEditor from '@/components/sandbox/CodeEditor';
import { CodeAssistantPanel } from '@/components/sandbox/CodeAssistantPanel';

export function SandboxPage() {
  const [currentCode, setCurrentCode] = useState('');

  return (
    <div className="space-y-6 px-6 pb-8">
      <PageHeader 
        title="在线编程实验" 
        subtitle="编写、运行和测试代码，右侧 AI 助手随时解答问题" 
      />

      <div className="flex gap-6">
        {/* 左侧：代码编辑器 */}
        <div className="flex-1 min-w-0">
          <CodeEditor 
            height="520px" 
            onChange={(code) => setCurrentCode(code || '')}
          />
        </div>

        {/* 右侧：AI 代码辅导面板 */}
        <div className="w-[420px] shrink-0 h-[560px]">
          <CodeAssistantPanel code={currentCode} />
        </div>
      </div>
    </div>
  );
}