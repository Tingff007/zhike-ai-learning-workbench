export const knowledgeBaseMock = {
  documents: [
    { id: 'doc-01', name: '深度学习讲义第8章.pdf', type: 'PDF', chapter: '第 8 章 卷积神经网络', chunks: 2346, parseStatus: 'completed', vectorStatus: 'ready', quality: 92, icon: 'pdf', parserVersion: 'iflytek_chatdoc', chatdocFileStatus: 'vectored', parseType: 'AUTO', iflytekFileId: 'mock-file-d2l-ch8', ingestionDurationMs: 182000 },
    { id: 'doc-02', name: 'CNN实验指导.md', type: 'MD', chapter: '第 8 章 卷积神经网络', chunks: 1862, parseStatus: 'completed', vectorStatus: 'indexed', quality: 88, icon: 'markdown', chatdocFileStatus: 'vectored', parseType: 'TEXT' },
    { id: 'doc-03', name: '反向传播习题集.pdf', type: 'PDF', chapter: '第 7 章 反向传播', chunks: 0, parseStatus: 'parsing', vectorStatus: 'indexing', quality: null, icon: 'pdf', chatdocFileStatus: 'vectoring', parseType: 'AUTO' },
    { id: 'doc-04', name: 'PyTorch项目说明.txt', type: 'TXT', chapter: '项目实践', chunks: 1204, parseStatus: 'completed', vectorStatus: 'indexed', quality: 86, icon: 'txt', chatdocFileStatus: 'vectored', parseType: 'TEXT' },
    { id: 'doc-05', name: 'BatchNorm论文摘录.pdf', type: 'PDF', chapter: '第 8 章 卷积神经网络', chunks: 2300, parseStatus: 'pending_check', vectorStatus: 'indexed', quality: 76, icon: 'pdf', chatdocFileStatus: 'vectored', parseType: 'OCR' },
  ],
};
